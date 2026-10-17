// Unit tests for the Debug tab's reports (ui/settings/debug-report.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bugReport, redactSettings, scrub, settingsDiff } from '../../ui/settings/debug-report.js';

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
