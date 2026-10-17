// The pause shortcut's text (ui/settings/shortcut.js): what a key press becomes, and how it is shown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortcutFromKey, shortcutName } from '../../ui/settings/shortcut.js';

const press = (code, mods = {}) => ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

test('a key with modifiers becomes the text the app registers', () => {
  assert.equal(shortcutFromKey(press('KeyP', { ctrlKey: true, shiftKey: true })), 'Ctrl+Shift+KeyP');
  assert.equal(shortcutFromKey(press('Digit1', { altKey: true })), 'Alt+Digit1');
});

test('a plain letter, or Shift and a letter, is refused so it never steals typing', () => {
  assert.equal(shortcutFromKey(press('KeyP')), null);
  assert.equal(shortcutFromKey(press('KeyP', { shiftKey: true })), null);
});

test('function keys and Pause may be used alone', () => {
  assert.equal(shortcutFromKey(press('F9')), 'F9');
  assert.equal(shortcutFromKey(press('Pause')), 'Pause');
});

test('holding only modifiers waits for the real key', () => {
  assert.equal(shortcutFromKey(press('ControlLeft', { ctrlKey: true })), '');
});

test('the shown name is friendly', () => {
  assert.equal(shortcutName('Ctrl+Shift+KeyP'), 'Ctrl + Shift + P');
  assert.equal(shortcutName('Super+Digit2'), 'Win + 2');
});
