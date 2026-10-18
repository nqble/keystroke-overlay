// Unit tests for the key editor's zoom and pan (ui/settings/tabs/keys-view.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ZOOM_MAX,
  centredView,
  clampPan,
  clampView,
  coverZoom,
  panBy,
  stretchPan,
  toBoard,
  toScreen,
  wheelFactor,
  zoomAt,
} from '../../ui/settings/tabs/keys-view.js';

const VIEW = { w: 800, h: 400 };
const CONTENT = { w: 1000, h: 600 };
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual}`);

test('cover zoom is the smallest zoom that still fills the box', () => {
  // width needs 0.8, height needs 0.667: 0.8 fills both
  assert.equal(coverZoom(VIEW, CONTENT), 0.8);
});

test('one wheel notch zooms about 12%, and scrolling back undoes it', () => {
  close(wheelFactor(-100), Math.exp(0.12), 'in');
  close(wheelFactor(-100) * wheelFactor(100), 1, 'there and back');
});

test('clampPan never shows anything outside the board', () => {
  // at 100% the board is 1000 wide in an 800 box: pan may go from −200 to 0
  assert.equal(clampPan(50, 1, 800, 1000), 0);
  assert.equal(clampPan(-500, 1, 800, 1000), -200);
  assert.equal(clampPan(-120, 1, 800, 1000), -120);
});

test('stretchPan goes past the edge at 30% while dragging', () => {
  close(stretchPan(100, 1, 800, 1000), 30, 'pulled 100 past the left edge');
  assert.equal(stretchPan(-120, 1, 800, 1000), -120, 'inside the limits it follows exactly');
});

test('clampView springs a stretched view back to the edge', () => {
  assert.deepEqual(clampView({ zoom: 1, panX: 30, panY: -250 }, VIEW, CONTENT), { zoom: 1, panX: 0, panY: -200 });
});

test('centredView centres the board at 100%', () => {
  assert.deepEqual(centredView(VIEW, CONTENT), { zoom: 1, panX: -100, panY: -100 });
});

test('zooming keeps the spot under the cursor still', () => {
  const start = centredView(VIEW, CONTENT);
  const cursor = { x: 300, y: 200 };
  const before = toBoard(cursor, start);
  const after = zoomAt(start, 1.5, cursor, VIEW, CONTENT);
  const spot = toBoard(cursor, after);
  close(spot.x, before.x, 'x');
  close(spot.y, before.y, 'y');
});

test('zoom stops at the cover zoom and at the maximum', () => {
  const start = centredView(VIEW, CONTENT);
  assert.equal(zoomAt(start, 0.01, { x: 400, y: 200 }, VIEW, CONTENT).zoom, 0.8);
  assert.equal(zoomAt(start, 100, { x: 400, y: 200 }, VIEW, CONTENT).zoom, ZOOM_MAX);
});

test('zooming out near an edge still shows only the board', () => {
  const zoomedIn = { zoom: 2, panX: 0, panY: 0 };
  const out = zoomAt(zoomedIn, 0.5, { x: 790, y: 390 }, VIEW, CONTENT);
  assert.ok(out.panX <= 0 && out.panX >= VIEW.w - CONTENT.w * out.zoom, `panX ${out.panX}`);
  assert.ok(out.panY <= 0 && out.panY >= VIEW.h - CONTENT.h * out.zoom, `panY ${out.panY}`);
});

test('toBoard and toScreen undo each other', () => {
  const state = { zoom: 1.4, panX: -60, panY: -35 };
  const point = { x: 123, y: 45 };
  const back = toScreen(toBoard(point, state), state);
  close(back.x, point.x, 'x');
  close(back.y, point.y, 'y');
});

test('panBy moves the view by the scroll and keeps only the board in the box', () => {
  const view = { w: 400, h: 200 };
  const content = { w: 800, h: 400 };
  const start = { zoom: 1, panX: -100, panY: -50 };
  assert.deepEqual(panBy(start, -30, -20, view, content), { zoom: 1, panX: -130, panY: -70 });
  // pulling past the board's edge stops at the edge
  assert.deepEqual(panBy(start, 500, 500, view, content), { zoom: 1, panX: 0, panY: 0 });
  assert.deepEqual(panBy(start, -9999, -9999, view, content), { zoom: 1, panX: -400, panY: -200 });
});
