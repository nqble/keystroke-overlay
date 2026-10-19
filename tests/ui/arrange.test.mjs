// Unit tests for the group-of-keys geometry (ui/settings/tabs/keys-arrange.js). Run with: npm run test:ui
// They use Node's own test runner, so there is nothing to install.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALIGNMENTS,
  alignPositions,
  boundsOf,
  clampMove,
  distributePositions,
  movedPositions,
} from '../../ui/settings/tabs/keys-arrange.js';

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

// ---- align and distribute
const GROUP = [key('A', 1, 1), key('B', 4, 3), key('Wide', 2, 6, 3, 2)]; // outline: x 1..5, y 1..8

test('aligning left, right and center changes only x', () => {
  const left = alignPositions(GROUP, 'left');
  assert.deepEqual(
    [left.A, left.B, left.Wide],
    [
      { x: 1, y: 1 },
      { x: 1, y: 3 },
      { x: 1, y: 6 },
    ],
  );
  const right = alignPositions(GROUP, 'right');
  assert.deepEqual(
    [right.A, right.B, right.Wide],
    [
      { x: 4, y: 1 },
      { x: 4, y: 3 },
      { x: 2, y: 6 },
    ],
  );
  const center = alignPositions(GROUP, 'center');
  assert.deepEqual([center.A.x, center.B.x, center.Wide.x], [2.5, 2.5, 1.5]);
});

test('aligning top, bottom and middle changes only y', () => {
  const top = alignPositions(GROUP, 'top');
  assert.deepEqual(
    [top.A, top.B, top.Wide],
    [
      { x: 1, y: 1 },
      { x: 4, y: 1 },
      { x: 2, y: 1 },
    ],
  );
  const bottom = alignPositions(GROUP, 'bottom');
  assert.deepEqual([bottom.A.y, bottom.B.y, bottom.Wide.y], [7, 7, 6]);
  const middle = alignPositions(GROUP, 'middle');
  assert.deepEqual([middle.A.y, middle.B.y, middle.Wide.y], [4, 4, 3.5]);
});

test('every alignment keeps the keys inside the group outline', () => {
  const outline = boundsOf(GROUP);
  for (const alignment of ALIGNMENTS) {
    const placed = Object.entries(alignPositions(GROUP, alignment)).map(([code, at]) => {
      const original = GROUP.find((box) => box.code === code);
      return { ...original, ...at };
    });
    assert.deepEqual(boundsOf(placed).minX >= outline.minX && boundsOf(placed).maxX <= outline.maxX, true, alignment);
    assert.deepEqual(boundsOf(placed).minY >= outline.minY && boundsOf(placed).maxY <= outline.maxY, true, alignment);
  }
});

test('distributing across makes the gaps equal and keeps the end keys in place', () => {
  const row = [key('A', 0, 0), key('B', 1, 0), key('C', 9, 0, 2)]; // outline 0..11, sizes 1+1+2, two gaps of 3.5
  const spread = distributePositions(row, 'across');
  assert.deepEqual([spread.A.x, spread.B.x, spread.C.x], [0, 4.5, 9]);
  assert.equal(spread.B.y, 0);
});

test('distributing down works on y and ignores the order the keys were passed in', () => {
  const column = [key('C', 0, 6), key('A', 0, 0), key('B', 0, 1)];
  const spread = distributePositions(column, 'down');
  assert.deepEqual([spread.A.y, spread.B.y, spread.C.y], [0, 3, 6]);
  assert.equal(spread.B.x, 0);
});

test('distributing fewer than three keys moves nothing', () => {
  const two = [key('A', 0, 0), key('B', 5, 5)];
  assert.deepEqual(distributePositions(two, 'across'), { A: { x: 0, y: 0 }, B: { x: 5, y: 5 } });
});
