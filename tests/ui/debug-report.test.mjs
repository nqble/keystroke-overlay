// Unit tests for the Debug tab's reports (ui/settings/debug-report.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accessRows,
  bugReport,
  engineName,
  memoryText,
  redactSettings,
  scrub,
  settingsDiff,
} from '../../ui/settings/debug-report.js';

test('scrub removes the user name from home-folder paths on every system', () => {
  assert.equal(scrub('C:\\Users\\jordan\\AppData'), 'C:\\Users\\<you>\\AppData');
  assert.equal(scrub('C:/Users/jordan/AppData'), 'C:/Users/<you>/AppData');
  assert.equal(scrub('/home/jordan/.config/x'), '/home/<you>/.config/x');
  assert.equal(scrub('/Users/jordan/Library'), '/Users/<you>/Library');
  assert.equal(scrub('"d:\\users\\Jordan P"'), '"d:\\users\\<you> P"');
  assert.equal(scrub(JSON.stringify('C:\\Users\\jordan\\x')), '"C:\\\\Users\\\\<you>\\\\x"'); // inside JSON text
});

test('scrub leaves other text alone', () => {
  assert.equal(scrub('port 7878, layout tkl'), 'port 7878, layout tkl');
});

test('redactSettings hides the link key and leaves the original untouched', () => {
  const settings = { general: { linkKey: 'secret123', port: 7878 } };
  assert.equal(redactSettings(settings).general.linkKey, '(hidden)');
  assert.equal(settings.general.linkKey, 'secret123');
});

test('settingsDiff lists only what differs from the defaults', () => {
  const defaults = { style: { radius: 8, gap: 6 }, layout: { id: 'tkl' } };
  const settings = { style: { radius: 12, gap: 6 }, layout: { id: 'tkl' }, extra: true };
  assert.deepEqual(settingsDiff(settings, defaults), {
    extra: { now: true, default: undefined },
    'style.radius': { now: 12, default: 8 },
  });
});

const facts = {
  version: '1.4.0',
  build: 'release',
  os: 'windows x86_64',
  engine: 'Edg/130',
  state: {
    paused: false,
    port: 7878,
    inputMethod: 'hook',
    inputError: 'hook failed',
    layout: 'tkl',
    uptimeSecs: 840,
    dataDir: 'C:\\Users\\jordan\\AppData',
  },
  lastUpdate: { available: false, version: '1.4.0', channel: 'stable' },
  selfTest: [
    { name: 'The overlay server is running', ok: true, detail: 'port 7878' },
    { name: 'Key capture is working', ok: false, detail: 'hook failed' },
  ],
  settingsDiff: { 'style.radius': { now: 12, default: 8 } },
  detailSinceMs: null,
  log: [
    [1200, 'app started (v1.4.0)'],
    [12800, 'keyboard input (hook) could not start: hook failed'],
  ],
};

test('the bug report puts the problems first, then the state, the events and exact JSON', () => {
  const report = bugReport(facts);
  const lines = report.split('\n');
  assert.equal(lines[0], '## Keystroke Overlay bug report');
  assert.match(lines[1], /^v1\.4\.0 \(release\) · windows x86_64 · Edg\/130 · up 14 min · format 2$/);
  assert.ok(report.indexOf('### What happened') < report.indexOf('### Problems found'), 'room for the user first');
  assert.match(report, /### Problems found\n- ✗ Key capture is working: hook failed\n/);
  assert.match(report, /\| Keyboard input \| hook, error: hook failed \|/);
  assert.match(report, /\| Updates \| up to date \(stable\) \|/);
  assert.match(report, /### Self-test: 1 passed, 1 failed/);
  assert.match(report, /style\.radius: 12 \(default 8\)/);
  assert.match(report, /important events only/);
  assert.match(report, /\+ {4}1\.2s {2}app started \(v1\.4\.0\)\n\+ {3}12\.8s {2}keyboard input/);
  const json = JSON.parse(report.split('```json\n')[1].split('\n```')[0]);
  assert.equal(json.format, 2);
  assert.deepEqual(json.settingsDiff, facts.settingsDiff);
  assert.equal(json.selfTest.length, 2);
  assert.deepEqual(json.log, facts.log);
});

test('a report with nothing wrong says so, and names since when Debug mode details were recorded', () => {
  const healthy = { ...facts, selfTest: [facts.selfTest[0]], settingsDiff: {}, detailSinceMs: 65000 };
  const report = bugReport(healthy);
  assert.match(report, /### Problems found\n- none\n/);
  assert.match(report, /### Settings changed from defaults \(0\)\nnone\n/);
  assert.match(report, /everything since Debug mode was turned on \(\+65\.0s\)/);
});

test('a crash in the last run is the first problem listed, and is in the JSON', () => {
  const report = bugReport({
    ...facts,
    lastCrash: 'v1.4.0 crashed in src/server.rs:120 (thread main), 3 min after start',
  });
  assert.match(report, /### Problems found\n- ✗ The last run crashed: v1\.4\.0 crashed in src\/server\.rs:120/);
  const json = JSON.parse(report.split('```json\n')[1].split('\n```')[0]);
  assert.match(json.lastCrash, /src\/server\.rs:120/);
});

test('the bug report never carries the user name', () => {
  assert.doesNotMatch(bugReport(facts), /jordan/);
});

test('memory and handles say so when a system does not measure them', () => {
  assert.equal(memoryText(20.5, 133), '20.5 MB · 133 handles');
  assert.equal(memoryText(20.5, null), '20.5 MB · handles not measured');
  assert.equal(memoryText(0, undefined), 'memory not measured on this system · handles not measured');
});

test('the macOS rows show Input Monitoring and Secure Input, and nothing elsewhere', () => {
  assert.deepEqual(accessRows({ applies: false, allowed: true }), []);
  assert.deepEqual(accessRows(null), []);
  const rows = accessRows({ applies: true, allowed: false, captureSeen: false, secureInput: true });
  assert.deepEqual(rows, [
    ['Input Monitoring', 'not allowed (no key has arrived yet)'],
    ['Secure Input', 'on: macOS is blocking key capture'],
  ]);
  const fine = accessRows({ applies: true, allowed: true, captureSeen: true, secureInput: false });
  assert.deepEqual(fine, [
    ['Input Monitoring', 'allowed (keys are arriving)'],
    ['Secure Input', 'off'],
  ]);
});

test('the bug report shows the method name, the macOS rows and honest memory', () => {
  const report = bugReport({
    version: '2.0.0',
    build: 'release',
    os: 'macos aarch64',
    engine: 'AppleWebKit',
    state: {
      paused: false,
      port: 7878,
      inputMethod: 'Standard (event tap)',
      inputError: null,
      layout: 'tkl',
      uptimeSecs: 60,
      dataDir: '/Users/me/Library/Application Support/x',
      memoryMb: 31.2,
      handles: 21,
      keyboardAccess: { applies: true, allowed: true, captureSeen: true, secureInput: false },
    },
    lastUpdate: null,
    selfTest: [],
    settingsDiff: {},
    detailSinceMs: null,
    lastCrash: null,
    log: [],
  });
  assert.match(report, /\| Keyboard input \| Standard \(event tap\) \|/);
  assert.match(report, /\| Input Monitoring \| allowed \(keys are arriving\) \|/);
  assert.match(report, /\| Memory \| 31.2 MB · 21 handles \|/);
});

test('the engine is named for Edge on Windows and WebKit on a Mac', () => {
  const edge =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.56';
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';
  assert.equal(engineName(edge), 'Edg/130.0.2849.56');
  assert.equal(engineName(mac), 'WebKit 605.1.15');
  assert.equal(engineName('SomethingElse/1.0'), 'SomethingElse/1.0');
});
