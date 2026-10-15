// Suite: Debug mode (General -> App -> Debug mode): the Debug tab appears and disappears, every tool works,
// and the privacy rules hold (nothing recorded while off, no key presses in the log or the bug report).
import { execSync } from 'node:child_process';
import { connect, byTest, inject, check, finish, sleep } from '../lib/cdp.mjs';

const p = await connect();
await sleep(3000);
const tab = async (id) => {
  await p.ev(`document.querySelector('${byTest('tab', `[data-tab="${id}"]`)}').click()`);
  await sleep(500);
};
// the ids of the tabs in the tab bar ('layout', 'keys', ..., 'debug')
const navNames = () => p.q(`[...document.querySelectorAll('${byTest('tab')}')].map(b => b.dataset.tab)`);
const click = (hook) => p.ev(`document.querySelector('${byTest(hook)}').click()`);
const debugToggle = `document.querySelector('${byTest('toggle-general-debug-mode')}')`;
const card = (id) => `document.querySelector('${byTest('debug-card', `[data-card="${id}"]`)}')`;
const state = async () => (await p.invoke('get_state')).ok;

// ---- off by default
check(
  'Debug mode is off by default and there is no Debug tab',
  (await navNames()).length === 6 &&
    !(await navNames()).includes('debug') &&
    (await state()).settings.general.debugMode === false,
);
check('while it is off nothing is recorded', (await p.invoke('debug_log')).ok.length === 0);
await p.invoke('create_layout', { name: 'Quiet' });
const quiet = (await p.invoke('debug_log')).ok.length;
await p.invoke('delete_layout', { id: 'quiet' });
check('...even when the app does things (create / delete a layout)', quiet === 0);

// ---- switch it on through the real toggle
await tab('general');
check('General -> App has the "Debug mode (for developers)" switch', await p.q(`!!${debugToggle}`));
await p.ev(`${debugToggle}.click()`);
await sleep(900);
check(
  'switching it on saves the setting and adds a Debug tab',
  (await state()).settings.general.debugMode === true && (await navNames()).includes('debug'),
);
await tab('debug');
const titles = await p.q(`[...document.querySelectorAll('${byTest('debug-card-title')}')].map(h => h.textContent)`);
check(
  'the Debug tab shows all its tools',
  [
    'This app',
    'Self-test',
    'Event log',
    'Key monitor',
    'Settings (raw)',
    'Test helpers',
    'Developer tools (full browser inspector)',
    'Bug report',
  ].every((t) => titles.includes(t)),
  titles.join(' | '),
);

// ---- this app
await sleep(2500);
const facts = await p.q(`document.querySelector('${byTest('debug-facts')}').innerText`);
check(
  '"This app" shows version, memory, server and key-capture status',
  /Version/.test(facts) && /Memory/.test(facts) && /running on port/.test(facts) && /Standard/.test(facts),
  facts.replace(/\s+/g, ' ').slice(0, 160),
);
const info = (await p.invoke('debug_info')).ok;
check(
  'debug_info reports real numbers',
  info.memoryMb > 1 &&
    info.handles > 10 &&
    info.settingsValid === true &&
    info.dataWritable === true &&
    info.uptimeSecs >= 0,
);

// ---- self-test
await click('debug-self-test-run');
await sleep(1200);
const tests = await p.q(
  `[...document.querySelectorAll('${byTest('debug-test')}')].map(t => [t.classList.contains('good'), t.innerText.replace(/\\s+/g, ' ')])`,
);
check(
  'the self-test runs and every check passes',
  tests.length >= 6 && tests.every((t) => t[0]),
  JSON.stringify(tests.filter((t) => !t[0])),
);

// ---- event log
await p.invoke('create_layout', { name: 'Logged' });
await p.invoke('set_layout', { id: 'tkl' });
await p.invoke('delete_layout', { id: 'logged' });
await sleep(2200);
const log = (await p.invoke('debug_log')).ok.map((l) => l[1]);
check(
  'the event log records what the app did (and the switch itself)',
  log.some((l) => /debug mode turned on/.test(l)) &&
    log.some((l) => /layout created: logged/.test(l)) &&
    log.some((l) => /layout deleted: logged/.test(l)),
  log.join(' / ').slice(0, 200),
);
check(
  'the log is shown on screen',
  /layout created: logged/.test(await p.q(`document.querySelector('${byTest('debug-log')}').innerText`)),
);

// ---- key monitor (and: key presses never reach the event log)
await click('debug-monitor-toggle');
await sleep(500);
await inject('flood', 2);
await sleep(900);
const mon = await p.q(`document.querySelector('${byTest('debug-monitor-log')}').innerText`);
check(
  'the key monitor shows presses as they happen',
  /↓ ControlRight/.test(mon) && /↑ ControlRight/.test(mon),
  mon.replace(/\s+/g, ' '),
);
await click('debug-monitor-toggle');
await sleep(400);
const before = await p.q(`document.querySelector('${byTest('debug-monitor-log')}').innerText`);
await inject('flood', 2);
await sleep(700);
check(
  'after Stop it shows nothing more',
  (await p.q(`document.querySelector('${byTest('debug-monitor-log')}').innerText`)) === before,
);
check(
  'key presses are NEVER written to the event log',
  !(await p.invoke('debug_log')).ok.some((l) => /ControlRight|Control/i.test(l[1])),
);

// ---- raw settings
await p.ev(
  `const t = document.querySelector('${byTest('debug-json')}'); const s = JSON.parse(t.value); s.style.radius = 9999; s.style.fontFamily = 'x"; }'; t.value = JSON.stringify(s)`,
);
await click('debug-raw-apply');
await sleep(1500);
const result = await p.q(`${card('raw-settings')}.innerText`);
const kept = (await state()).settings.style;
check(
  'hostile values typed into the raw editor are corrected and reported',
  kept.radius === 100 && !/["{};]/.test(kept.fontFamily) && /corrected/.test(result),
  `${kept.radius} ${kept.fontFamily}`,
);
await p.invoke('save_settings', {
  settings: { ...(await state()).settings, style: { ...kept, radius: 8, fontFamily: 'Segoe UI' } },
});

// ---- fake update
await click('debug-fake-update');
await sleep(800);
check(
  '"Fake update available" shows the update button and the tray indicator',
  (await p.q(`!document.querySelector('${byTest('update-button')}').hidden`)) && (await state()).updateBadge === true,
);
await click('debug-clear-fake-update');
await sleep(800);
check(
  '"Clear fake update" removes both',
  (await p.q(`document.querySelector('${byTest('update-button')}').hidden`)) && (await state()).updateBadge === false,
);

// ---- bug report (read the real clipboard)
await click('debug-bug-report');
await sleep(900);
const report = execSync('powershell.exe -NoProfile -Command "Get-Clipboard -Raw"').toString();
check(
  'the bug report has version, self-test, settings and log sections',
  /Keystroke Overlay v/.test(report) && /SELF-TEST/.test(report) && /SETTINGS/.test(report) && /EVENT LOG/.test(report),
);
check(
  'the bug report contains no key presses, no private key and no Windows user name',
  !/ControlRight/.test(report) &&
    !/[0-9a-f]{32}/.test(report) &&
    !report.toLowerCase().includes(('Users\\' + (process.env.USERNAME || 'zzzz')).toLowerCase()),
);

// ---- the developer console helper, then switch it off again
check(
  'the "ko" console helper exists for the inspector',
  await p.q(`typeof ko === 'object' && typeof ko.info === 'function'`),
);
await tab('general');
await p.ev(`${debugToggle}.click()`);
await sleep(900);
check(
  'switching it off removes the tab and forgets the log',
  !(await navNames()).includes('debug') &&
    (await p.invoke('debug_log')).ok.length === 0 &&
    (await state()).settings.general.debugMode === false,
);
finish();
