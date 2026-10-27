// Turned keys in the overlay (ui/overlay/turn.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleOf, turnedBox } from '../../ui/overlay/turn.js';

const close = (actual, expected) =>
  Object.keys(expected).forEach((side) => assert.ok(Math.abs(actual[side] - expected[side]) < 1e-9, side));

test('a key that is not turned covers its own rectangle', () => {
  assert.deepEqual(turnedBox(10, 20, 60, 40, 0), { left: 10, top: 20, right: 70, bottom: 60 });
});

test('a quarter turn swaps width and height around the same center', () => {
  close(turnedBox(0, 0, 60, 40, 90), { left: 10, top: -10, right: 50, bottom: 50 });
  close(turnedBox(0, 0, 60, 40, -90), { left: 10, top: -10, right: 50, bottom: 50 });
});

test('a square turned 45 degrees covers its diagonal', () => {
  const half = Math.SQRT2 * 25;
  close(turnedBox(0, 0, 50, 50, 45), { left: 25 - half, top: 25 - half, right: 25 + half, bottom: 25 + half });
});

test("the user's turn wins over the layout file's, and nothing turns in the grid", () => {
  assert.equal(angleOf('KeyW', 10, 'shape', { KeyW: 15 }), 15);
  assert.equal(angleOf('KeyW', 10, 'shape', {}), 10);
  assert.equal(angleOf('KeyW', undefined, 'shape', undefined), 0);
  assert.equal(angleOf('KeyW', 10, 'grid', { KeyW: 15 }), 0);
  assert.equal(angleOf('KeyW', 'x', 'shape', {}), 0);
});
