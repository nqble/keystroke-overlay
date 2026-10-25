// Unit tests for arrow keys in a row of choices (ui/settings/choice-keys.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepChoice } from '../../ui/settings/choice-keys.js';

test('the arrows step to the next and previous choice', () => {
  assert.equal(stepChoice(3, 0, 'ArrowRight'), 1);
  assert.equal(stepChoice(3, 1, 'ArrowDown'), 2);
  assert.equal(stepChoice(3, 2, 'ArrowLeft'), 1);
  assert.equal(stepChoice(3, 1, 'ArrowUp'), 0);
});

test('stepping past either end wraps around', () => {
  assert.equal(stepChoice(3, 2, 'ArrowRight'), 0);
  assert.equal(stepChoice(3, 0, 'ArrowLeft'), 2);
});

test('Home and End jump to the ends', () => {
  assert.equal(stepChoice(4, 2, 'Home'), 0);
  assert.equal(stepChoice(4, 1, 'End'), 3);
});

test('other keys are not ours, and an empty row does nothing', () => {
  assert.equal(stepChoice(3, 1, 'Enter'), null);
  assert.equal(stepChoice(3, 1, 'a'), null);
  assert.equal(stepChoice(0, 0, 'ArrowRight'), null);
});
