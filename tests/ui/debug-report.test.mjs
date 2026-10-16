// Unit tests for the Debug tab's reports (ui/settings/debug-report.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devReport, redactSettings, scrub, settingsDiff } from '../../ui/settings/debug-report.js';

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
  state: { paused: false, port: 7878, inputMethod: 'hook', dataDir: 'C:\\Users\\jordan\\AppData' },
  selfTest: [
    { name: 'The overlay server is running', ok: true, detail: 'port 7878' },
    { name: 'Key capture is working', ok: false, detail: 'hook failed' },
  ],
  settingsDiff: { 'style.radius': { now: 12, default: 8 } },
  log: [[1200, 'app started (v1.4.0)']],
};

test('the developer report has a readable summary and exact JSON', () => {
  const report = devReport(facts);
  assert.match(report, /^## Keystroke Overlay v1\.4\.0 \(release\) on windows x86_64/);
  assert.match(report, /Self-test: 1 failed \(Key capture is working\)/);
  const json = JSON.parse(report.split('```json\n')[1].split('\n```')[0]);
  assert.equal(json.format, 1);
  assert.deepEqual(json.settingsDiff, facts.settingsDiff);
  assert.equal(json.selfTest.length, 2);
});

test('the developer report never carries the user name', () => {
  assert.doesNotMatch(devReport(facts), /jordan/);
});
