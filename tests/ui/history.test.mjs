// Unit tests for the Keys tab's undo / redo (ui/settings/tabs/keys-history.js). Run with: npm run test:ui
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_HISTORY,
  canRedo,
  canUndo,
  clearHistory,
  observe,
  redo,
  undo,
} from '../../ui/settings/tabs/keys-history.js';

beforeEach(clearHistory);

test('a fresh layout has nothing to undo or redo', () => {
  observe('tkl', 'start');
  assert.equal(canUndo(), false);
  assert.equal(canRedo(), false);
  assert.equal(undo(), null);
  assert.equal(redo(), null);
});

test('drawing the tab again without a change adds no step', () => {
  observe('tkl', 'start');
  observe('tkl', 'start');
  observe('tkl', 'start');
  assert.equal(canUndo(), false);
});

test('each change is one undo step, and undo returns the earlier snapshot', () => {
  observe('tkl', 'start');
  observe('tkl', 'moved');
  observe('tkl', 'moved again');
  assert.equal(undo(), 'moved');
  assert.equal(undo(), 'start');
  assert.equal(undo(), null);
});

test('redo steps forward again through what was undone', () => {
  observe('tkl', 'a');
  observe('tkl', 'b');
  observe('tkl', 'c');
  undo();
  undo();
  assert.equal(redo(), 'b');
  assert.equal(redo(), 'c');
  assert.equal(redo(), null);
});

test('redrawing after an undo does not count as a new change', () => {
  observe('tkl', 'a');
  observe('tkl', 'b');
  const back = undo();
  observe('tkl', back); // the tab redraws with the restored edits
  assert.equal(canRedo(), true);
  assert.equal(canUndo(), false);
});

test('a new change after an undo clears redo', () => {
  observe('tkl', 'a');
  observe('tkl', 'b');
  observe('tkl', undo());
  observe('tkl', 'different');
  assert.equal(canRedo(), false);
  assert.equal(undo(), 'a');
});

test('only the last MAX_HISTORY steps are kept', () => {
  observe('tkl', 'edit 0');
  for (let n = 1; n <= MAX_HISTORY + 10; n++) observe('tkl', `edit ${n}`);
  let steps = 0;
  while (undo() !== null) steps++;
  assert.equal(steps, MAX_HISTORY);
});

test('switching to another layout starts a fresh history', () => {
  observe('tkl', 'a');
  observe('tkl', 'b');
  observe('wasd', 'x');
  assert.equal(canUndo(), false);
  observe('wasd', 'y');
  assert.equal(undo(), 'x');
});
