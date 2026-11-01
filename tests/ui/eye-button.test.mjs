// The eye button's choices (ui/settings/input-choice.js): which inputs a layout hides, one click, which inputs can be
// shown, and that its list matches the overlay's (ui/overlay/input-kinds.js). Run with: node --test tests/ui/eye-button.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INPUTS, hiddenInputs, inputEnabled, toggledInputs } from '../../ui/settings/input-choice.js';
import { INPUT_KINDS } from '../../ui/overlay/input-kinds.js';

test('the settings window and the overlay name the same inputs, in the same order', () => {
  assert.deepEqual(INPUTS, INPUT_KINDS);
});

test('the selected layout hides only the inputs its profile lists', () => {
  const settings = { layout: { id: 'tkl', profiles: { tkl: { hiddenInputs: ['mouse', 'oops', 'keyboard'] } } } };
  assert.deepEqual(hiddenInputs(settings), ['keyboard', 'mouse']);
  assert.deepEqual(hiddenInputs({ layout: { id: 'wasd', profiles: {} } }), []);
});

test('a click hides a shown input and shows a hidden one, keeping the order', () => {
  assert.deepEqual(toggledInputs([], 'keyboard'), ['keyboard']);
  assert.deepEqual(toggledInputs(['controller'], 'keyboard'), ['keyboard', 'controller']);
  assert.deepEqual(toggledInputs(['keyboard', 'mouse'], 'keyboard'), ['mouse']);
});

test('the keyboard can always be shown; the mouse and controller only while their input is on', () => {
  assert.equal(inputEnabled({}, 'keyboard'), true);
  assert.equal(inputEnabled({}, 'mouse'), false);
  assert.equal(inputEnabled({}, 'controller'), false);
  const on = { inputs: { mouse: { enabled: true }, gamepad: { enabled: true } } };
  assert.equal(inputEnabled(on, 'mouse'), true);
  assert.equal(inputEnabled(on, 'controller'), true);
});
