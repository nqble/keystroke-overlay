// Unit tests for the Layout tab's order (ui/settings/layout-order.js). The first three cases are the same as in
// src-tauri/src/layout_order.rs, which the tray uses. Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropGap, moveBy, moveToGap, otherLayouts, shownLayouts } from '../../ui/settings/layout-order.js';

const layout = (id, user = false) => ({ id, name: id, keys: [], user });
const ids = (list) => list.map((l) => l.id);

test('built-in layouts show only while listed, in their order', () => {
  const all = [layout('full'), layout('tkl'), layout('numpad')];
  assert.deepEqual(ids(shownLayouts(all, ['tkl', 'full'])), ['tkl', 'full']);
});

test("the user's own layouts always show, missing ones at the end", () => {
  const all = [layout('full'), layout('mine', true), layout('also-mine', true)];
  assert.deepEqual(ids(shownLayouts(all, ['also-mine', 'full'])), ['also-mine', 'full', 'mine']);
});

test('ids of layouts that are gone are skipped', () => {
  assert.deepEqual(ids(shownLayouts([layout('full')], ['deleted', 'full'])), ['full']);
});

test('Other layouts are the built-in ones not shown, never your own', () => {
  const all = [layout('full'), layout('numpad'), layout('arrows'), layout('mine', true)];
  assert.deepEqual(ids(otherLayouts(all, ['full'])), ['numpad', 'arrows']);
});

test('moving into a gap', () => {
  const order = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveToGap(order, 'a', 2), ['b', 'a', 'c', 'd']); // between b and c
  assert.deepEqual(moveToGap(order, 'd', 0), ['d', 'a', 'b', 'c']); // to the front
  assert.deepEqual(moveToGap(order, 'b', 4), ['a', 'c', 'd', 'b']); // to the end
  assert.deepEqual(moveToGap(order, 'b', 1), order); // its own gaps change nothing
  assert.deepEqual(moveToGap(order, 'b', 2), order);
});

test('moving one place left or right, and not past either end', () => {
  const order = ['a', 'b', 'c'];
  assert.deepEqual(moveBy(order, 'b', 1), ['a', 'c', 'b']);
  assert.deepEqual(moveBy(order, 'b', -1), ['b', 'a', 'c']);
  assert.deepEqual(moveBy(order, 'a', -1), order);
  assert.deepEqual(moveBy(order, 'c', 1), order);
});

test('drops land only in a gap or close to one, never in the middle of a card', () => {
  // one row: cards 100 px wide with 12 px gaps
  const boxes = [0, 112, 224].map((left) => ({ left, right: left + 100, top: 0, bottom: 80 }));
  assert.equal(dropGap(106, 40, boxes), 1); // in the gap between the first two
  assert.equal(dropGap(90, 40, boxes), 1); // near the first card's right edge
  assert.equal(dropGap(120, 40, boxes), 1); // near the second card's left edge
  assert.equal(dropGap(50, 40, boxes), null); // the middle of the first card
  assert.equal(dropGap(5, 40, boxes), 0); // before the first card
  assert.equal(dropGap(330, 40, boxes), 3); // after the last card
  assert.equal(dropGap(106, 200, boxes), null); // below every row
});

test('drops work with real page boxes, whose fields are getters (like DOMRect)', () => {
  class Box {
    constructor(left) {
      this._left = left;
    }
    get left() {
      return this._left;
    }
    get right() {
      return this._left + 100;
    }
    get top() {
      return 0;
    }
    get bottom() {
      return 80;
    }
  }
  const boxes = [0, 112].map((left) => new Box(left));
  assert.equal(dropGap(106, 40, boxes), 1);
  assert.equal(dropGap(5, 40, boxes), 0);
});
