// =====================================================================================================================
//  Keystroke Overlay: the Debug tab (developer tools).
//
//  The tab only exists while General → App → "Debug mode" is on. settings.js draws it by calling
//  `window.debugTab.render()`;
//  this file is loaded BEFORE settings.js (see index.html) and only uses settings.js's helpers inside functions, after
//  everything has started. The Rust half is src-tauri/src/debug.rs.
//
//  PRIVACY: nothing here is saved to disk or sent anywhere. The event log is the app's own memory and records what the
//  app did, never which keys you pressed. The Key monitor shows key presses, so it only runs when you press Start, and
//  it
//  stops by itself after 60 seconds or when you leave this tab.
//
//  HOW TO ADD A DEBUG TOOL (takes about ten lines):
//    1. Add an object to SECTIONS below:   { id: 'my-tool', title: 'My tool', build() { return [ ...page elements... ]; } }
//    2. Need data from the app?  Add a #[tauri::command] in src-tauri/src/debug.rs, list it in main.rs, then call it
//    here
//       with   await invoke('my_command', { arg })
//    3. Need something to refresh by itself?   every(root, 2000, () => { ...update the page... })
//  Helpers from settings.js you can use: el(), heading(), note(), button(), row(), toast(), call(), invoke(), settings,
//  layouts, size, showNotes(), resync(), render().   Full guide: docs/DEBUGGING.md
// =====================================================================================================================
import { flatten, redactSettings, scrub } from './debug-report.js';
import { addLayoutDialog, showNotes } from './popups.js';
import { button, call, el, tauriEvent, heading, invoke, note, toast } from './helpers.js';
import { resync } from './messages.js';
import { render } from './settings.js';
import { settings, appVersion, layouts, setTab, size } from './state.js';

// -------------------------------------------------------------------------------------------------------------------
// Words the user reads. The longer explanations live here, so the code below stays short and the wording is easy to
// find.
// -------------------------------------------------------------------------------------------------------------------
const TEXT = {
  selfTestHelp:
    'Checks that the server, the overlay page, key capture, your settings, the data folder and every ' +
    'layout are healthy.',
  eventLogHelp:
    'What the app itself did: server restarts, layout changes, update checks, tray actions. Kept in ' +
    'memory only (last 300 lines). Never records key presses.',
  keyMonitorHelp:
    'Shows each key the app sees, with the time since the previous event. Use it to check that a key ' +
    'is detected and for timing problems. Press Start first; it stops by itself. Nothing is stored. ' +
    'Don’t type passwords while it runs.',
  rawSettingsHelp:
    'The current settings exactly as the app holds them. Edit and press Apply to try odd values; the ' +
    'app validates them like a hand-edited settings file and shows what it corrected. Port, ' +
    'start-with-Windows, keyboard method and secure link have their own controls, so they are not ' +
    'changed here.',
  fakeUpdateHelp:
    '“Fake update available” shows the update button, the orange tray dot and the “Update available” ' +
    'tray entry without needing a real release.',
  inspectorStepEdge:
    'In Microsoft Edge open edge://inspect, add localhost:9222 under “Configure…”, then click ' +
    '“inspect” under Keystroke Overlay.',
  inspectorDeveloperNote:
    'Developers working on the code can run “npm run dev:debug”, which does all of this and turns ' +
    'Debug mode on. In the inspector’s console, the object “ko” has shortcuts: ko.info(), ko.log(), ' +
    "ko.settings(), ko.goto('style').",
  bugReportHelp:
    'Copies one block of text for a GitHub issue: version, system, self-test results, your settings ' +
    '(without the private link key) and the recent event log. It contains no key presses, and your ' +
    'Windows user name is removed.',
  debugToolsIntro:
    'Developer tools. Switch them off in General → App → Debug mode. Nothing here is saved to disk or ' +
    'sent anywhere.',
};

// -------------------------------------------------------------------------------------------------------------------
// Small helpers used by every section
// -------------------------------------------------------------------------------------------------------------------
/** Run `fn` now and then every `ms` milliseconds, until `root` has left the page (the tab was changed or redrawn). */
function every(root, ms, fn) {
  fn();
  const timer = setInterval(() => {
    if (!root.isConnected) clearInterval(timer);
    else fn();
  }, ms);
}

/** A titled box. `id` goes into data-card, so the tests can pick one box without reading its title. */
function card(id, title, ...content) {
  const box = el(
    'section',
    { className: 'dbg-card', test: 'debug-card' },
    el('h3', { textContent: title, test: 'debug-card-title' }),
    content.flat(),
  );
  box.dataset.card = id;
  return box;
}

/** A two-column list of label → value. Call `.set(rows)` to refresh it. */
function facts() {
  const box = el('div', { className: 'dbg-facts', test: 'debug-facts' });
  box.set = (rows) =>
    box.replaceChildren(
      ...rows.flatMap(([label, value, state]) => [
        el('span', { className: 'k', textContent: label }),
        el('span', { className: 'v ' + (state ?? ''), textContent: String(value) }),
      ]),
    );
  return box;
}

const seconds = (s) => (s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
const clock = (ms) => {
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(Math.floor(ms / 60000))}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
};

// -------------------------------------------------------------------------------------------------------------------
// Self-test: quick yes/no checks of everything that has to work for the overlay to work
// -------------------------------------------------------------------------------------------------------------------
async function runSelfTest() {
  const info = await invoke('debug_info');
  const brokenLayouts = layouts.filter(
    (l) => !l.keys?.length || new Set(l.keys.map((k) => k.code)).size !== l.keys.length,
  );
  return [
    ['The overlay server is running', !info.serverError, info.serverError || `port ${info.port}`],
    [
      'The live preview loaded (the overlay page works)',
      !!size,
      size ? `${size.w} × ${size.h}` : 'the preview has not reported in',
    ],
    [
      'Key capture is working',
      !info.inputError,
      (info.inputActive === 'hook' ? 'Standard method' : 'Compatibility method') +
        (info.inputError ? ': ' + info.inputError : ''),
    ],
    ['Settings are valid (nothing needed correcting)', info.settingsValid, ''],
    ['The data folder can be written to', info.dataWritable, scrub(info.dataDir)],
    [
      `All ${layouts.length} layouts have keys, and no key appears twice`,
      layouts.length > 0 && !brokenLayouts.length,
      brokenLayouts.map((l) => l.id).join(', '),
    ],
    ['The selected layout exists', layouts.some((l) => l.id === settings.layout.id), settings.layout.id],
  ].map(([name, ok, detail]) => ({ name, ok: !!ok, detail }));
}

/** One report a developer can paste into a GitHub issue. Contains no key presses and no personal paths. */
async function buildReport() {
  const info = await invoke('debug_info'),
    tests = await runSelfTest(),
    log = await invoke('debug_log');
  return scrub(
    [
      `Keystroke Overlay v${info.version} (${info.build}) on ${info.os}`,
      `Browser engine: ${navigator.userAgent}`,
      `Screen: ${screen.width}x${screen.height} at ${devicePixelRatio}x, window ${innerWidth}x${innerHeight}`,
      `Running for ${seconds(info.uptimeSecs)}; memory ${info.memoryMb} MB; ` +
        `${info.handles} handles; port ${info.port}`,
      `Keyboard: ${info.inputActive}${info.inputError ? ' (error: ' + info.inputError + ')' : ''}`,
      '',
      'SELF-TEST',
      ...tests.map((t) => `${t.ok ? 'PASS' : 'FAIL'}  ${t.name}${t.detail ? ' — ' + t.detail : ''}`),
      '',
      'SETTINGS',
      JSON.stringify(redactSettings(settings)),
      '',
      `EVENT LOG (last ${Math.min(60, log.length)} of ${log.length})`,
      ...log.slice(-60).map(([ms, text]) => `${clock(ms)}  ${text}`),
    ].join('\n'),
  );
}

// -------------------------------------------------------------------------------------------------------------------
// The key monitor sends events through Tauri; one listener is shared by whichever monitor is on screen
// -------------------------------------------------------------------------------------------------------------------
let monitor = null,
  listening = false;
function listenForKeys() {
  if (listening) return;
  listening = true;
  tauriEvent.listen('debug-key', (e) => monitor?.onKey(e.payload));
  tauriEvent.listen('debug-key-stopped', () => monitor?.onStopped());
}

// -------------------------------------------------------------------------------------------------------------------
// The sections. Add yours here.
// -------------------------------------------------------------------------------------------------------------------
const SECTIONS = [
  {
    id: 'this-app',
    title: 'This app',
    build() {
      const table = facts(),
        peak = { memory: 0 };
      const root = el('div', {}, table);
      every(root, 2000, async () => {
        const info = await invoke('debug_info');
        peak.memory = Math.max(peak.memory, info.memoryMb);
        table.set([
          ['Version', `v${info.version}  (${info.build})`],
          ['Running for', seconds(info.uptimeSecs)],
          ['Memory (this program)', `${info.memoryMb} MB  (highest seen here: ${peak.memory} MB)`],
          ['Open handles', info.handles],
          [
            'Overlay server',
            info.serverError ? `problem: ${info.serverError}` : `running on port ${info.port}`,
            info.serverError ? 'bad' : 'good',
          ],
          [
            'Key capture',
            `${info.inputActive === 'hook' ? 'Standard (hook)' : 'Compatibility (Raw Input)'}` +
              `${info.inputError ? ' — ' + info.inputError : ''}`,
            info.inputError ? 'bad' : 'good',
          ],
          [
            'Settings valid',
            info.settingsValid ? 'yes' : 'no: the sanitizer would change something',
            info.settingsValid ? 'good' : 'bad',
          ],
          [
            'Data folder',
            scrub(info.dataDir) + (info.dataWritable ? '' : '   (cannot write here!)'),
            info.dataWritable ? '' : 'bad',
          ],
          ['Browser engine', (navigator.userAgent.match(/Edg\/[\d.]+/) || [navigator.userAgent])[0]],
          [
            'Window / screen',
            `${innerWidth}×${innerHeight} window, ${screen.width}×${screen.height} screen at ${devicePixelRatio}×`,
          ],
        ]);
      });
      root.append(
        el(
          'div',
          { className: 'btns' },
          button('Open data folder', () => call('open_folder', { kind: 'root' }), '', 'debug-open-folder'),
        ),
      );
      return root;
    },
  },
  {
    id: 'self-test',
    title: 'Self-test',
    build() {
      const results = el('div', { className: 'dbg-tests' });
      const run = async () => {
        results.replaceChildren(el('span', { className: 'hint', textContent: 'Running…' }));
        const tests = await runSelfTest();
        results.replaceChildren(
          ...tests.map((testResult) =>
            el(
              'div',
              { className: 'dbg-test ' + (testResult.ok ? 'good' : 'bad'), test: 'debug-test' },
              el('b', { textContent: testResult.ok ? '✔' : '✖' }),
              el('span', { textContent: testResult.name }),
              el('i', { textContent: testResult.detail }),
            ),
          ),
        );
      };
      return [
        note(TEXT.selfTestHelp),
        el('div', { className: 'btns' }, button('Run self-test', run, 'primary', 'debug-self-test-run')),
        results,
      ];
    },
  },
  {
    id: 'event-log',
    title: 'Event log',
    build() {
      const box = el('div', { className: 'dbg-log', test: 'debug-log' });
      const refresh = async () => {
        const lines = await invoke('debug_log');
        const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
        box.replaceChildren(
          ...(lines.length ? lines : [[0, '(nothing yet: use the app and lines appear here)']]).map(([ms, text]) =>
            el('div', {}, el('span', { className: 'ts', textContent: clock(ms) }), el('span', { textContent: text })),
          ),
        );
        if (atEnd) box.scrollTop = box.scrollHeight;
      };
      const root = el('div', {}, note(TEXT.eventLogHelp), box);
      root.append(
        el(
          'div',
          { className: 'btns' },
          button(
            'Copy log',
            async () => {
              await call('copy_text', {
                text: scrub((await invoke('debug_log')).map(([ms, t]) => `${clock(ms)}  ${t}`).join('\n')),
              });
              toast('Log copied');
            },
            '',
            'debug-log-copy',
          ),
          button(
            'Clear',
            async () => {
              await invoke('debug_log_clear');
              refresh();
            },
            '',
            'debug-log-clear',
          ),
        ),
      );
      every(root, 1500, refresh);
      return root;
    },
  },
  {
    id: 'key-monitor',
    title: 'Key monitor',
    build() {
      listenForKeys();
      const list = el('div', { className: 'dbg-log short', test: 'debug-monitor-log' }),
        status = el('span', { className: 'hint', test: 'debug-monitor-status' });
      let running = false,
        count = 0,
        previous = 0,
        lines = [];
      const paint = () => {
        status.textContent = running
          ? `Listening… ${count} events so far (stops by itself after 60 s)`
          : count
            ? `Stopped. ${count} events.`
            : 'Not running.';
        list.replaceChildren(
          ...lines.map((l) =>
            el('div', {}, el('span', { className: 'ts', textContent: l.gap }), el('span', { textContent: l.text })),
          ),
        );
        list.scrollTop = list.scrollHeight;
      };
      const stop = async () => {
        running = false;
        monitor = null;
        paint();
        try {
          await invoke('debug_key_monitor', { on: false });
        } catch {
          /* already stopped */
        }
      };
      const toggleBtn = button(
        'Start',
        async () => {
          if (running) {
            await stop();
            toggleBtn.textContent = 'Start';
            return;
          }
          lines = [];
          count = 0;
          previous = 0;
          running = true;
          toggleBtn.textContent = 'Stop';
          monitor = {
            onKey: (payload) => {
              count++;
              lines.push({
                gap: previous ? `+${payload.ms - previous} ms` : 'first',
                text: `${payload.down ? '↓' : '↑'} ${payload.k}`,
              });
              previous = payload.ms;
              lines = lines.slice(-40);
              paint();
            },
            onStopped: () => {
              running = false;
              toggleBtn.textContent = 'Start';
              paint();
            },
          };
          await invoke('debug_key_monitor', { on: true });
          paint();
        },
        'primary',
        'debug-monitor-toggle',
      );
      const root = el('div', {}, note(TEXT.keyMonitorHelp), el('div', { className: 'btns' }, toggleBtn, status), list);
      every(root, 1000, () => {
        if (running && !root.isConnected) stop();
      });
      paint();
      return root;
    },
  },
  {
    id: 'raw-settings',
    title: 'Settings (raw)',
    build() {
      const box = el('textarea', {
        className: 'dbg-json',
        test: 'debug-json',
        spellcheck: false,
        value: JSON.stringify(redactSettings(settings), null, 2),
      });
      const result = el('div', { className: 'dbg-tests', test: 'debug-raw-result' });
      const apply = async () => {
        let typed;
        try {
          typed = JSON.parse(box.value);
        } catch (e) {
          toast('That is not valid JSON: ' + e.message, true);
          return;
        }
        try {
          await invoke('save_settings', { settings: typed });
        } catch (e) {
          toast(String(e), true);
          return;
        }
        const kept = (await invoke('get_state')).settings;
        const before = flatten(typed),
          after = flatten(kept);
        const changes = Object.keys(after).filter((k) => before[k] !== after[k] && k !== 'general.linkKey');
        await resync();
        box.value = JSON.stringify(redactSettings(settings), null, 2);
        result.replaceChildren(
          el(
            'div',
            { className: 'dbg-test ' + (changes.length ? 'bad' : 'good') },
            el('b', { textContent: changes.length ? '!' : '✔' }),
            el('span', {
              textContent: changes.length
                ? `The app corrected ${changes.length} value(s) you typed:`
                : 'Applied exactly as typed.',
            }),
          ),
          ...changes
            .slice(0, 20)
            .map((settingPath) =>
              el(
                'div',
                { className: 'dbg-test' },
                el('b'),
                el('span', { textContent: settingPath }),
                el('i', { textContent: `typed ${before[settingPath] ?? '(missing)'}  →  kept ${after[settingPath]}` }),
              ),
            ),
        );
      };
      return [
        note(TEXT.rawSettingsHelp),
        box,
        el(
          'div',
          { className: 'btns' },
          button('Apply', apply, 'primary', 'debug-raw-apply'),
          button(
            'Reload from app',
            async () => {
              await resync();
              box.value = JSON.stringify(redactSettings(settings), null, 2);
              result.replaceChildren();
            },
            '',
            'debug-raw-reload',
          ),
          button(
            'Copy',
            async () => {
              await call('copy_text', { text: box.value });
              toast('Settings copied');
            },
            '',
            'debug-raw-copy',
          ),
        ),
        result,
      ];
    },
  },
  {
    id: 'test-helpers',
    title: 'Test helpers',
    build() {
      return [
        note('Shortcuts for trying things that are hard to trigger on demand.'),
        el(
          'div',
          { className: 'btns' },
          button('Fake update available', () => invoke('debug_simulate_update', { on: true }), '', 'debug-fake-update'),
          button(
            'Clear fake update',
            () => invoke('debug_simulate_update', { on: false }),
            '',
            'debug-clear-fake-update',
          ),
          button(
            'Show “What’s new” popup',
            () => showNotes(appVersion, `What's new in v${appVersion}`),
            '',
            'debug-whats-new',
          ),
          button('New layout popup', () => addLayoutDialog(), '', 'debug-new-layout'),
        ),
        el(
          'div',
          { className: 'btns' },
          button('Toast', () => toast('A normal message'), '', 'debug-toast'),
          button('Error toast', () => toast('An error message', true), '', 'debug-error-toast'),
          button(
            'Restart server',
            async () => {
              await call('restart_server');
              toast('Server restarted');
            },
            '',
            'debug-restart-server',
          ),
          button('Reload this window', () => location.reload(), '', 'debug-reload-window'),
        ),
        note(TEXT.fakeUpdateHelp),
      ];
    },
  },
  {
    id: 'developer-tools',
    title: 'Developer tools (full browser inspector)',
    build() {
      const command = 'set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222';
      return [
        note('To inspect this window like a web page (elements, console, network):'),
        el(
          'ol',
          { className: 'dbg-steps' },
          el('li', { textContent: 'Quit Keystroke Overlay (tray icon → Quit).' }),
          el('li', {
            textContent: 'In a Command Prompt, run the line below, then start the app from that same window.',
          }),
          el('li', { textContent: TEXT.inspectorStepEdge }),
        ),
        el('code', { className: 'dbg-cmd', textContent: command }),
        el(
          'div',
          { className: 'btns' },
          button(
            'Copy command',
            async () => {
              await call('copy_text', { text: command });
              toast('Copied');
            },
            '',
            'debug-copy-command',
          ),
        ),
        note(TEXT.inspectorDeveloperNote),
      ];
    },
  },
  {
    id: 'bug-report',
    title: 'Bug report',
    build() {
      return [
        note(TEXT.bugReportHelp),
        el(
          'div',
          { className: 'btns' },
          button(
            'Copy bug report',
            async () => {
              await call('copy_text', { text: await buildReport() });
              toast('Bug report copied');
            },
            'primary',
            'debug-bug-report',
          ),
        ),
      ];
    },
  },
];

// -------------------------------------------------------------------------------------------------------------------
// The tab itself
// -------------------------------------------------------------------------------------------------------------------
async function renderDebugTab() {
  // Handy from the inspector's console (see "Developer tools" above).
  window.ko = {
    invoke,
    info: () => invoke('debug_info'),
    log: () => invoke('debug_log'),
    state: () => invoke('get_state'),
    settings: () => settings,
    layouts: () => layouts,
    goto: (name) => {
      setTab(name);
      render();
    },
  };
  const page = el('div', { className: 'debug' }, heading('Debug'), note(TEXT.debugToolsIntro));
  for (const section of SECTIONS) page.append(card(section.id, section.title, section.build()));
  return page;
}

export const debugTab = { name: 'Debug', render: renderDebugTab };
