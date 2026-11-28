// The extra-button key picker's decisions (ui/settings/key-picker.js): Esc cancels, Delete or Backspace clears, a
// modifier waits for the rest of a chord, F13 sent with no scancode (an empty `code`) is still chosen.
// Run with: node --test tests/ui/key-picker.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyPickerStep, pressedCode } from '../../ui/settings/key-picker.js';

const press = (code, key = '') => keyPickerStep({ code, key });

test('Esc cancels, Delete and Backspace clear, a known key is chosen', () => {
  assert.equal(press('Escape').action, 'cancel');
  assert.equal(press('Delete').action, 'clear');
  assert.equal(press('Backspace').action, 'clear', "a Mac's delete key");
  assert.deepEqual(press('F13'), { action: 'choose', code: 'F13' });
  assert.deepEqual(press('KeyE'), { action: 'choose', code: 'KeyE' });
});

test('a modifier waits for the key the chord ends with', () => {
  assert.deepEqual(press('ControlLeft'), { action: 'wait', code: 'ControlLeft' });
  assert.equal(press('MetaLeft').action, 'wait', 'the Copilot key starts with Win');
  assert.equal(press('ShiftRight').action, 'wait');
});

test('F13 to F24 sent with no scancode are read from the key name', () => {
  assert.equal(pressedCode({ code: '', key: 'F13' }), 'F13');
  assert.deepEqual(press('', 'F24'), { action: 'choose', code: 'F24' });
  assert.equal(pressedCode({ code: '', key: 'a' }), '', 'only F13-F24 are taken from the key name');
  assert.equal(press('', 'Unidentified').action, 'cancel');
});
