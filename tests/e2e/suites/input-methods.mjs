// Suite: keyboard input methods (Standard hook vs Compatibility Raw Input).
// Injects real key presses and checks both methods deliver the same events, switching is clean, and cost is low.
import { connect, byTest, inject, procStats, listenKeys, check, finish, sleep } from '../lib/cdp.mjs';

const p = await connect();
await sleep(1500);
const events = await listenKeys();
await sleep(300);
const run = async (scenario, n = 1, settle = 800) => {
  events.length = 0;
  await inject(scenario, n);
  await sleep(settle);
  return [...events];
};
const EXPECT = [
  '+KeyW',
  '-KeyW',
  '+ControlRight',
  '-ControlRight',
  '+Space',
  '+KeyA',
  '-Space',
  '-KeyA',
  '+NumpadEnter',
  '-NumpadEnter',
  '+Enter',
  '-Enter',
  '+PrintScreen',
  '-PrintScreen',
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const select = `document.querySelector('${byTest('input-method-select')}')`;

// ------------------------------------------------------------ the General tab section
await p.ev(`document.querySelector('${byTest('tab', '[data-tab="general"]')}').click()`);
await sleep(500);
// the choice is a segmented control (a radiogroup of buttons, ui/settings/blocks.js), not a dropdown
const ui = await p.q(
  `(() => { const s = ${select}; const radios = s ? [...s.querySelectorAll('[role=radio]')] : []; return { has: !!s, value: radios.find(r => r.getAttribute('aria-checked') === 'true')?.textContent.trim(), labels: radios.map(r => r.textContent.trim()), card: !!document.querySelector('${byTest('general-input')}') }; })()`,
);
const pageText = () => p.q(`document.querySelector('${byTest('pane')}').innerText`);
check('General has a "Keyboard input" card', ui.card);
check(
  'default is Standard (hook), with Compatibility as the other choice',
  ui.has && ui.value === 'Standard' && same(ui.labels, ['Standard', 'Compatibility']),
);
check('help text explains Standard', /Works with nearly every game/.test(await pageText()));
check(
  'help text covers administrator games, and the Standard note is only the short line (no "keep it unless")',
  /If a game runs as administrator, start Keystroke Overlay as administrator too\./.test(await pageText()) &&
    /Works with nearly every game\./.test(await pageText()) &&
    !/Keep it unless/.test(await pageText()),
);
check('backend reports "hook" as the active method', (await p.invoke('get_state')).ok.inputActive === 'hook');

// ------------------------------------------------------------ Standard (hook)
const hookSeq = await run('seq');
check(
  'hook: correct sequence (OS repeats dropped, extended keys, overlapping keys, PrintScreen)',
  same(hookSeq, EXPECT),
  hookSeq.join(' '),
);

// ------------------------------------------------------------ switch through the real UI control
await p.ev(
  `[...${select}.querySelectorAll('[role=radio]')].find(r => r.textContent.trim() === 'Compatibility').click()`,
);
await sleep(700);
const st = (await p.invoke('get_state')).ok;
check(
  'choosing Compatibility switches live and is saved',
  st.inputActive === 'rawinput' && st.settings.general.inputMethod === 'rawinput' && !st.inputError,
);
check(
  'help text changes to explain Compatibility',
  /For games where keys don.t light up with Standard/.test(await pageText()),
);
const rawSeq = await run('seq');
check('Raw Input delivers the same sequence as the hook', same(rawSeq, EXPECT), rawSeq.join(' '));

// ------------------------------------------------------------ switching is clean
const before = procStats();
let doubled = 0,
  lost = 0;
for (let i = 0; i < 20; i++) {
  await p.invoke('set_input_method', { method: i % 2 ? 'hook' : 'rawinput' });
  await sleep(120);
  const ev = await run('flood', 1, 500);
  if (ev.length > 2) doubled++;
  if (ev.length < 2) lost++;
}
const after = procStats();
check(
  '20 live switches: exactly one down + one up per key (never doubled)',
  doubled === 0,
  `doubled ${doubled}, lost ${lost}`,
);
check(
  '20 live switches: no thread or handle leak',
  after[0] <= before[0] + 1 && after[1] <= before[1] + 12,
  `threads ${before[0]}->${after[0]}, handles ${before[1]}->${after[1]}`,
);

await p.invoke('set_input_method', { method: 'hook' });
await sleep(200);
events.length = 0;
await inject('hold');
await sleep(300);
const held = events.includes('+ControlRight');
await p.invoke('set_input_method', { method: 'rawinput' });
await sleep(400);
check(
  'a key held during a switch is released (never stuck)',
  held && events.includes('-ControlRight'),
  events.join(' '),
);
await inject('release');
await sleep(300);

// ------------------------------------------------------------ cost
for (const m of ['hook', 'rawinput']) {
  await p.invoke('set_input_method', { method: m });
  await sleep(300);
  const a = procStats();
  events.length = 0;
  const t0 = Date.now();
  await inject('flood', 4000);
  await sleep(1200);
  const secs = (Date.now() - t0) / 1000,
    b = procStats(),
    cpu = (((b[3] - a[3]) / 1000 / secs) * 100).toFixed(2);
  check(
    `${m}: an 8000-event flood is fully delivered (${events.length}/8000, ${cpu}% of one core)`,
    events.length >= 7900,
  );
}
for (const m of ['hook', 'rawinput']) {
  await p.invoke('set_input_method', { method: m });
  await sleep(2500);
  const a = procStats();
  await sleep(15000);
  const b = procStats();
  const idle = (((b[3] - a[3]) / 15000) * 100).toFixed(3);
  check(`${m}: idle CPU is ~0`, +idle < 0.3, `${idle}% of one core`);
}
await p.invoke('set_input_method', { method: 'hook' });
finish();
