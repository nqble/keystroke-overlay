// The every-system check (tools/check-systems.mjs): which lines it flags and which it leaves alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowsWordsIn } from '../../tools/check-systems.mjs';

test('Windows-only words in shown text are flagged', () => {
  assert.deepEqual(windowsWordsIn("  autostart: 'Start with Windows',"), ['Windows']);
  assert.deepEqual(windowsWordsIn("  hint: 'Ctrl-click to add.',"), ['Ctrl']);
  assert.deepEqual(windowsWordsIn('  help: `the orange tray dot`,'), ['tray']);
  assert.deepEqual(windowsWordsIn("  fonts: ['Segoe UI', 'Arial'],"), ['Segoe']);
});

test('comments, code names and joined hook names are left alone', () => {
  assert.deepEqual(windowsWordsIn('// the tray menu, like Windows'), []);
  assert.deepEqual(windowsWordsIn('const withCtrl = keyEvent.ctrlKey;'), []);
  assert.deepEqual(windowsWordsIn('  test="toggle-general-minimize-to-tray"'), []);
  assert.deepEqual(windowsWordsIn("  startup: { windows: 'start-with-Windows' },"), []);
});

test('a line marked as for one system only is allowed', () => {
  assert.deepEqual(windowsWordsIn("parts.push('Ctrl'); // per-system: the saved shortcut text"), []);
});

test('a placeholder in a template is code, not text', () => {
  assert.deepEqual(windowsWordsIn('  help: `the orange ${trayName} dot`,'), []);
});
