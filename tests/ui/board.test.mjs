// Unit tests for the key editor's board (ui/settings/tabs/keys-board.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_MIN_H,
  BOARD_MIN_W,
  boardArea,
  boardSize,
  centreOffset,
  clampToBoard,
  closeGapsPositions,
  overlappingCodes,
  resizeBox,
  resizeLimits,
} from '../../ui/settings/tabs/keys-board.js';

const key = (code, x, y, w = 1, h = 1) => ({ code, x, y, w, h });
const WASD = [key('KeyW', 1, 0), key('KeyA', 0, 1), key('KeyS', 1, 1), key('KeyD', 2, 1)];
const BOARD = { w: 24, h: 12 };

test('a small layout gets the minimum board', () => {
  assert.deepEqual(boardSize(WASD), { w: BOARD_MIN_W, h: BOARD_MIN_H });
});

test('a full-size layout gets its own size plus the margins, rounded up', () => {
  const wide = [key('Esc', 0, 0), key('Pause', 21.5, 0), key('Ctrl', 0, 6.5)];
  // 22.5 wide + 8 = 30.5 → 31; 7.5 tall + 6 = 13.5 → 14
  assert.deepEqual(boardSize(wide), { w: 31, h: 14 });
});

test('saved keys past the normal board make it grow instead of being moved', () => {
  const movedFarRight = [key('KeyW', 30, 3)];
  const board = boardSize(WASD, movedFarRight);
  assert.ok(board.w >= 31, `board should reach past x 31, got ${board.w}`);
  assert.equal(board.h, BOARD_MIN_H);
});

test('boardArea is the whole board, from 0', () => {
  assert.deepEqual(boardArea(BOARD), { minX: 0, minY: 0, maxX: 24, maxY: 12 });
});

test('centreOffset puts a group in the middle of the board, on the snap step', () => {
  // WASD is 3 × 2: the middle of a 24 × 12 board starts at x 10.5, y 5
  assert.deepEqual(centreOffset(WASD, BOARD, 0.25), { dx: 10.5, dy: 5 });
  // with whole-key steps the half key rounds down
  assert.deepEqual(centreOffset(WASD, BOARD, 1), { dx: 10, dy: 5 });
});

test('clampToBoard keeps a key fully on the board, wide keys included', () => {
  assert.deepEqual(clampToBoard(key('KeyW', -2, -1), BOARD), { x: 0, y: 0 });
  assert.deepEqual(clampToBoard(key('Space', 22, 11.5, 6.25), BOARD), { x: 17.75, y: 11 });
  assert.deepEqual(clampToBoard(key('KeyW', 5, 5), BOARD), { x: 5, y: 5 });
});

test('resizing from the right stops at the board edge; from the left at the left edge', () => {
  const space = key('Space', 10, 4, 6.25);
  assert.deepEqual(resizeLimits(space, 'right', BOARD), { min: 1, max: 14 });
  assert.deepEqual(resizeLimits(space, 'left', BOARD), { min: 1, max: 16.25 });
});

test('a key the layout file draws narrower than 1 may stay that narrow', () => {
  const tiny = key('Dot', 3, 3, 0.5);
  assert.equal(resizeLimits(tiny, 'right', BOARD, 0.5).min, 0.5);
});

test('resizeBox keeps the opposite edge still and snaps the width', () => {
  const space = key('Space', 10, 4, 6.25);
  assert.deepEqual(resizeBox(space, 'right', 1.1, BOARD, 0.25), { x: 10, w: 7.25 });
  // dragging the left edge 2 keys left widens it by 2; the right edge (16.25) stays put
  assert.deepEqual(resizeBox(space, 'left', -2, BOARD, 0.25), { x: 8, w: 8.25 });
});

test('resizeBox never goes under the minimum or past the board', () => {
  const space = key('Space', 10, 4, 6.25);
  assert.deepEqual(resizeBox(space, 'right', -20, BOARD, 0.25), { x: 10, w: 1 });
  assert.deepEqual(resizeBox(space, 'right', 50, BOARD, 0.25), { x: 10, w: 14 });
  assert.deepEqual(resizeBox(space, 'left', -50, BOARD, 0.25), { x: 0, w: 16.25 });
});

test('overlappingCodes finds overlaps but not keys that only touch', () => {
  const touching = [key('A', 0, 0), key('B', 1, 0)];
  assert.equal(overlappingCodes(touching).size, 0);
  const stacked = [key('A', 0, 0), key('B', 0.5, 0.5), key('C', 5, 5)];
  assert.deepEqual([...overlappingCodes(stacked)].sort(), ['A', 'B']);
});

test('close gaps shrinks wide gaps to a quarter key, keeps the order, and centres', () => {
  // A and B touch; a 3-key gap before C
  const keys = [key('A', 0, 0), key('B', 1, 0), key('C', 5, 0)];
  const positions = closeGapsPositions(keys, BOARD);
  const width = positions.C.x + 1 - positions.A.x;
  assert.equal(width, 3.25, 'A + B + a quarter-key gap + C');
  assert.ok(positions.A.x < positions.B.x && positions.B.x < positions.C.x, 'order kept');
  assert.equal(positions.B.x - positions.A.x, 1, 'touching keys stay touching');
  // centred: (24 − 3.25) / 2 = 10.375, which rounds down to the quarter step: 10.25
  assert.equal(positions.A.x, 10.25);
});

test('close gaps in Even grid closes gaps completely', () => {
  const keys = [key('A', 0, 0), key('C', 4, 0)];
  const positions = closeGapsPositions(keys, BOARD, 0, 1);
  assert.equal(positions.C.x - positions.A.x, 1);
});

test('close gaps keeps the keyboard shape when nothing needs closing', () => {
  const positions = closeGapsPositions(WASD, BOARD);
  assert.equal(positions.KeyW.x - positions.KeyA.x, 1, 'W stays above S, one key right of A');
  assert.equal(positions.KeyS.y - positions.KeyW.y, 1);
});

test('close gaps with no keys does nothing', () => {
  assert.deepEqual(closeGapsPositions([], BOARD), {});
});
