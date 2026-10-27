// Tests for ui/settings/drag-press.js: when a press on a Layout tab card is a click or a drag, and which clicks are
// swallowed. Run with: node --test tests/ui/drag-press.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDragPress } from '../../ui/settings/drag-press.js';

const MOUSE = 1;
const MOUSE_CLICK = 1; // a click event's detail: 1 for a mouse click, 0 for Enter or Space
const KEYBOARD_CLICK = 0;

function dragOverGap(press, gap) {
  press.down('tkl', 100, 50, MOUSE);
  press.move(120, 50, MOUSE);
  press.setGap(gap);
}

test('a press that barely moves is a click: it picks the layout', () => {
  const press = createDragPress();
  press.down('tkl', 100, 50, MOUSE);
  assert.equal(press.move(101, 51, MOUSE), false);
  assert.equal(press.up(MOUSE), null);
  assert.equal(press.swallowClick(MOUSE_CLICK), false);
});

test('a drag over a gap saves the new order, and the click after it is swallowed once', () => {
  const press = createDragPress();
  dragOverGap(press, 3);
  assert.equal(press.dragId, 'tkl');
  assert.deepEqual(press.up(MOUSE), { layoutId: 'tkl', gap: 3 });
  press.lostCapture(MOUSE); // the browser releases the capture between pointerup and click
  assert.equal(press.swallowClick(MOUSE_CLICK), true);
  assert.equal(press.swallowClick(MOUSE_CLICK), false, 'only the one click');
});

test('a fast flick that ends before the page redraws still saves its drop', () => {
  const press = createDragPress();
  press.down('tkl', 100, 50, MOUSE);
  press.move(140, 50, MOUSE);
  press.setGap(0);
  assert.deepEqual(press.up(MOUSE), { layoutId: 'tkl', gap: 0 });
});

test('after a canceled drag, pressing Enter on a card still picks it', () => {
  const press = createDragPress();
  dragOverGap(press, 2);
  press.cancel(MOUSE);
  assert.equal(press.dragId, null);
  assert.equal(press.swallowClick(KEYBOARD_CLICK), false);
});

test('a keyboard click right after a drag is never swallowed', () => {
  const press = createDragPress();
  dragOverGap(press, 2);
  press.up(MOUSE);
  assert.equal(press.swallowClick(KEYBOARD_CLICK), false);
});

test('a drag whose card lost the pointer mid-way ends without saving', () => {
  const press = createDragPress();
  dragOverGap(press, 2);
  press.lostCapture(MOUSE);
  assert.equal(press.dragId, null);
  assert.equal(press.up(MOUSE), null);
});

test("another pointer's moves and lift don't drive the press", () => {
  const press = createDragPress();
  const FINGER = 7;
  press.down('tkl', 100, 50, MOUSE);
  assert.equal(press.move(160, 50, FINGER), false);
  assert.equal(press.up(FINGER), null);
  assert.equal(press.dragId, null, 'still a press, not a drag');
});
