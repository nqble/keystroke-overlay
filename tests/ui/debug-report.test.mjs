// Unit tests for the Debug tab's reports (ui/settings/debug-report.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactSettings, scrub } from '../../ui/settings/debug-report.js';

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
