// Turning keys in the Keys tab: the maths (ui/settings/tabs/keys-turn.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAngle,
  pointerAngle,
  turnedAngle,
  turnedBounds,
  turnedOverlap,
} from '../../ui/settings/tabs/keys-turn.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('angles stay between -180 and 180', () => {
  assert.equal(normalizeAngle(190), -170);
  assert.equal(normalizeAngle(-190), 170);
  assert.equal(normalizeAngle(360), 0);
  assert.equal(normalizeAngle(-180), 180);
  assert.equal(normalizeAngle(45), 45);
});

test('the pointer angle is measured clockwise from the right', () => {
  near(pointerAngle({ x: 0, y: 0 }, { x: 10, y: 0 }), 0);
  near(pointerAngle({ x: 0, y: 0 }, { x: 0, y: 10 }), 90);
  near(pointerAngle({ x: 0, y: 0 }, { x: -10, y: 0 }), 180);
});

test('dragging the handle adds the turn of the pointer, in 15 degree steps with Snap', () => {
  assert.equal(turnedAngle(0, -45, -25, 15), 15, '20 degrees of pointer turn snaps to 15');
  assert.equal(turnedAngle(0, -45, -38, 15), 0, '7 degrees stays at 0');
  assert.equal(turnedAngle(10, -45, -25, 0), 30, 'Snap off: whole degrees');
  assert.equal(turnedAngle(170, 0, 30, 15), -165, 'past 180 comes back in at -180');
});

test('a turned key covers a bigger upright box around the same center', () => {
  assert.deepEqual(turnedBounds({ code: 'K', x: 2, y: 3, w: 2, h: 1 }), { code: 'K', x: 2, y: 3, w: 2, h: 1 });
  const quarter = turnedBounds({ code: 'K', x: 0, y: 0, w: 2, h: 1, r: 90 });
  near(quarter.x, 0.5);
  near(quarter.y, -0.5);
  near(quarter.w, 1);
  near(quarter.h, 2);
  const diagonal = turnedBounds({ code: 'K', x: 0, y: 0, w: 1, h: 1, r: 45 });
  near(diagonal.w, Math.SQRT2);
  near(diagonal.x, (1 - Math.SQRT2) / 2);
});

test('a turned key overlaps only the keys its real shape reaches', () => {
  const turned = { x: 1, y: 1, w: 1, h: 1, r: 45 };
  assert.equal(
    turnedOverlap(turned, { x: 2, y: 1, w: 1, h: 1 }, 0.01),
    true,
    'its corner pokes into the key beside it',
  );
  assert.equal(
    turnedOverlap(turned, { x: 2.1, y: 2.1, w: 1, h: 1 }, 0.01),
    false,
    'the diagonal neighbor is not reached',
  );
  assert.equal(
    turnedOverlap({ x: 0, y: 0, w: 1, h: 1, r: 0 }, { x: 1, y: 0, w: 1, h: 1 }, 0.01),
    false,
    'touching is fine',
  );
  assert.equal(turnedOverlap({ x: 0, y: 0, w: 2, h: 1, r: 90 }, { x: 0.5, y: -0.4, w: 1, h: 1 }, 0.01), true);
});
