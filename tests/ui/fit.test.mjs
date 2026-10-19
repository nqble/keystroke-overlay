// Fitting the keyboard into the OBS source's box (ui/overlay/fit.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitInBox } from '../../ui/overlay/fit.js';

test('a box of exactly the suggested size changes nothing', () => {
  assert.deepEqual(fitInBox({ w: 800, h: 300 }, { w: 800, h: 300 }), { fit: 1, x: 0, y: 0 });
});

test('a bigger box grows the keyboard to fill it, centered', () => {
  assert.deepEqual(fitInBox({ w: 800, h: 300 }, { w: 1600, h: 900 }), { fit: 2, x: 0, y: 150 });
});

test('a layout wider than the box shrinks to fit instead of being cut off', () => {
  const { fit, x, y } = fitInBox({ w: 1200, h: 300 }, { w: 600, h: 300 });
  assert.equal(fit, 0.5);
  assert.equal(x, 0);
  assert.equal(y, 75);
});

test('a box with no size yet leaves the keyboard as it is', () => {
  assert.deepEqual(fitInBox({ w: 800, h: 300 }, { w: 0, h: 0 }), { fit: 1, x: 0, y: 0 });
});
