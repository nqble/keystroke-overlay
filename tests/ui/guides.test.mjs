// Unit tests for the key editor's smart guides (ui/settings/tabs/keys-guides.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapToGuides } from '../../ui/settings/tabs/keys-guides.js';

const key = (code, x, y, w = 1, h = 1) => ({ code, x, y, w, h });
const OTHERS = [key('KeyQ', 0, 0), key('KeyTab', 0, 2, 1.5)];

test('a left edge close to another key’s left edge sticks to it', () => {
  // 2 wide, so only its left edge is near an edge (its right edge, 2.15, is near nothing)
  const result = snapToGuides(key('KeyW', 0, 0, 2), 0.15, 5, OTHERS);
  assert.equal(result.x, 0);
  assert.equal(result.guideX, 0);
});

test('a right edge close to another key’s right edge sticks to it', () => {
  // Tab ends at 1.5; a 1-wide key whose right edge is near 1.5 lands at 0.5
  const result = snapToGuides(key('KeyW', 0, 0), 0.6, 5, OTHERS);
  assert.equal(result.x, 0.5);
  assert.equal(result.guideX, 1.5);
});

test('a top edge close to another key’s top sticks to it', () => {
  const result = snapToGuides(key('KeyW', 0, 0), 8, 1.9, OTHERS);
  assert.equal(result.y, 2);
  assert.equal(result.guideY, 2);
});

test('nothing close means no guide and the wished-for position unchanged', () => {
  const result = snapToGuides(key('KeyW', 0, 0), 7.37, 6.61, OTHERS);
  assert.deepEqual(result, { x: 7.37, y: 6.61, guideX: null, guideY: null });
});

test('the closest edge wins when two are in reach', () => {
  const others = [key('A', 3, 0), key('B', 3.3, 4)];
  const result = snapToGuides(key('KeyW', 0, 0), 3.25, 9, others);
  assert.equal(result.x, 3.3);
});
