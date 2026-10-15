// Unit tests for the group-of-keys geometry (ui/settings/tabs/keys-arrange.js). Run with: npm run test:ui
// They use Node's own test runner, so there is nothing to install.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundsOf, clampMove, movedPositions } from '../../ui/settings/tabs/keys-arrange.js';

const key = (code, x, y, w = 1, h = 1) => ({ code, x, y, w, h });
const AREA = { minX: 0, minY: 0, maxX: 10, maxY: 5 };

test('boundsOf covers every key, including wide and tall ones', () => {
  const group = [key('A', 1, 1), key('Space', 3, 2, 6), key('Tall', 0, 4, 1, 2)];
  assert.deepEqual(boundsOf(group), { minX: 0, minY: 1, maxX: 9, maxY: 6 });
});

test('a move that fits is allowed unchanged', () => {
  const group = [key('A', 1, 1), key('B', 2, 1)];
  assert.deepEqual(clampMove(group, 2, 1, AREA), { dx: 2, dy: 1 });
});

test('the whole group stops when one key reaches the edge, so the shape is kept', () => {
  const group = [key('A', 1, 1), key('B', 3, 2)];
  // wished 5 to the left: A could only go 1 left, so the group moves 1
  assert.deepEqual(clampMove(group, -5, 0, AREA), { dx: -1, dy: 0 });
  // wished 20 to the right: B (right edge 4) can go 6 right
  assert.deepEqual(clampMove(group, 20, 0, AREA), { dx: 6, dy: 0 });
  assert.deepEqual(clampMove(group, 0, -9, AREA), { dx: 0, dy: -1 });
  assert.deepEqual(clampMove(group, 0, 9, AREA), { dx: 0, dy: 2 });
});

test('a group already against an edge cannot be pushed through it', () => {
  const group = [key('A', 0, 0)];
  assert.deepEqual(clampMove(group, -1, -1, AREA), { dx: 0, dy: 0 });
});

test('movedPositions moves every key by the same amount and rounds to 2 decimals', () => {
  const group = [key('A', 1, 1), key('B', 2.5, 3)];
  assert.deepEqual(movedPositions(group, 0.25, -1), { A: { x: 1.25, y: 0 }, B: { x: 2.75, y: 2 } });
  assert.deepEqual(movedPositions([key('A', 0.1, 0.2)], 0.2, 0.1), { A: { x: 0.3, y: 0.3 } });
});
