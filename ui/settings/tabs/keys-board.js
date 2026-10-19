// =====================================================================================================================
//  The key editor's board: the fixed area, in key units, that every key must stay inside (docs/design/key-editor.md §3).
//  Plain geometry, no page code, so tests/ui can run it with Node. Boxes are { code, x, y, w, h } like keys-arrange.js.
//
//  The board is sized from the layout with free space around it, the layout starts in its middle, and keys are clamped
//  so they never leave it. Saved keys that already sit outside (for example after a layout file changed) are never
//  moved on load: the board grows to fit them instead.
// =====================================================================================================================
import { boundsOf } from './keys-arrange.js';
import { round2 } from '../profiles.js';

// Free space around the layout, and the smallest board, all in keys (docs/design/key-editor.md §3).
export const BOARD_MARGIN_W = 8;
export const BOARD_MARGIN_H = 6;
export const BOARD_MIN_W = 24;
export const BOARD_MIN_H = 12;

/**
 * Dragging a resize handle can't make a key narrower than this (or than its own width in the layout file, if that is
 * smaller). Not the same as profiles.js MIN_KEY_WIDTH, which is the hard limit for hand-edited settings files.
 */
export const MIN_RESIZE_WIDTH = 1;

/** The gap "Close gaps" leaves between groups of keys, in keys. Even grid closes gaps completely. */
export const CLOSED_GAP = 0.25;

// Two edges this close (in keys) count as touching, so rounding never creates a false gap or overlap.
const EPSILON = 0.01;

/** Width and height of the board for a layout's keys: the layout plus the margins, never smaller than the minimum. */
function sizeFor(boxes) {
  const bounds = boundsOf(boxes);
  return {
    w: Math.max(BOARD_MIN_W, Math.ceil(bounds.maxX - bounds.minX + BOARD_MARGIN_W)),
    h: Math.max(BOARD_MIN_H, Math.ceil(bounds.maxY - bounds.minY + BOARD_MARGIN_H)),
  };
}

/**
 * The board for a layout: { w, h } in keys. `placedBoxes` are the keys as the user left them; if any of them reach past
 * the normal board, the board grows to hold them (with the same margin on the far side), so nothing is moved on load.
 */
export function boardSize(layoutBoxes, placedBoxes = []) {
  const board = sizeFor(layoutBoxes);
  if (!placedBoxes.length) return board;
  const placed = boundsOf(placedBoxes);
  return {
    w: Math.max(board.w, Math.ceil(placed.maxX + BOARD_MARGIN_W / 2)),
    h: Math.max(board.h, Math.ceil(placed.maxY + BOARD_MARGIN_H / 2)),
  };
}

/**
 * A layout's keys as boxes in Even grid style: every key 1 wide, placed at the column and row the app worked out
 * (`layout.grid`, from src-tauri/src/grid.rs, so the editor and the overlay always agree). A key missing from
 * `layout.grid` keeps its layout-file place.
 */
export function evenGridBoxes(layout) {
  const grid = layout.grid ?? {};
  return layout.keys.map((key) => {
    const place = grid[key.code] ?? { x: key.x, y: key.y };
    return { code: key.code, x: place.x, y: place.y, w: 1, h: key.h ?? 1 };
  });
}

/**
 * The board with the layout in the middle of it: { w, h, originX, originY }. A key's board place (what the editor draws and
 * works with) is its saved place plus the origin, so a layout saved at x 0 sits in the middle of the board, with room on every
 * side, and keys can be dragged to the left of and above it (saved positions may be negative). The origin is a whole number
 * of keys, so grid dots line up with whole and half keys. `layoutBoxes` are the layout style's own places (the file's, or
 * the even grid's); `placedBoxes` are the keys as the user left them, in saved places. If a saved key reaches past the
 * board, the origin or the board grows so nothing is moved on load.
 */
export function boardFrame(layoutBoxes, placedBoxes = []) {
  const board = sizeFor(layoutBoxes);
  const layout = boundsOf(layoutBoxes);
  let originX = Math.floor((board.w - (layout.maxX - layout.minX)) / 2 - layout.minX);
  let originY = Math.floor((board.h - (layout.maxY - layout.minY)) / 2 - layout.minY);
  let { w, h } = board;
  if (placedBoxes.length) {
    const placed = boundsOf(placedBoxes);
    originX = Math.max(originX, Math.ceil(-placed.minX));
    originY = Math.max(originY, Math.ceil(-placed.minY));
    w = Math.max(w, Math.ceil(placed.maxX + originX + BOARD_MARGIN_W / 2));
    h = Math.max(h, Math.ceil(placed.maxY + originY + BOARD_MARGIN_H / 2));
  }
  return { w, h, originX, originY };
}

/** Saved places as board places, and back: the same shift in both directions. */
export const toBoardPlace = (place, frame) => ({
  x: round2(place.x + frame.originX),
  y: round2(place.y + frame.originY),
});
export const toSavedPlace = (place, frame) => ({
  x: round2(place.x - frame.originX),
  y: round2(place.y - frame.originY),
});

/** The board as an area for clampMove (keys-arrange.js): { minX, minY, maxX, maxY }. */
export const boardArea = (board) => ({ minX: 0, minY: 0, maxX: board.w, maxY: board.h });

/** How far to move a group so it sits in the middle of the board, on the snap step: { dx, dy }. */
export function centreOffset(boxes, board, step) {
  const bounds = boundsOf(boxes);
  const onStep = (value) => (step ? Math.floor(value / step) * step : value);
  return {
    dx: round2(onStep((board.w - (bounds.maxX - bounds.minX)) / 2 - bounds.minX)),
    dy: round2(onStep((board.h - (bounds.maxY - bounds.minY)) / 2 - bounds.minY)),
  };
}

/** A key's position pulled back inside the board: { x, y }. Its size never changes here. */
export function clampToBoard(box, board) {
  return {
    x: round2(Math.min(board.w - box.w, Math.max(0, box.x))),
    y: round2(Math.min(board.h - box.h, Math.max(0, box.y))),
  };
}

/**
 * The sizes a key may take when dragged by one side: { min, max }. 'left' and 'right' change its width, 'top' and 'bottom' its
 * height. The opposite edge stays put, so growing to the right stops at the board's right edge, growing to the left at its left
 * edge, and the same for down and up. `layoutSize` is the layout's own width (or height): a key may be made narrower than one
 * key only if the layout already has it that narrow.
 */
export function resizeLimits(box, side, board, layoutSize = MIN_RESIZE_WIDTH) {
  const min = Math.min(MIN_RESIZE_WIDTH, layoutSize);
  const max = {
    right: board.w - box.x,
    left: box.x + box.w,
    bottom: board.h - box.y,
    top: box.y + box.h,
  }[side];
  return { min, max: Math.max(min, max) };
}

/**
 * Resize a key by dragging one side by `delta` keys. Snaps the size to `step` (0 = no snapping) and keeps it within
 * resizeLimits. Returns the key's new { x, w } for 'left' and 'right', or { y, h } for 'top' and 'bottom'.
 */
export function resizeBox(box, side, delta, board, step, layoutSize = MIN_RESIZE_WIDTH) {
  const limits = resizeLimits(box, side, board, layoutSize);
  const vertical = side === 'top' || side === 'bottom';
  const current = vertical ? box.h : box.w;
  const grow = side === 'right' || side === 'bottom' ? delta : -delta;
  const wished = current + grow;
  const snapped = step ? Math.round(wished / step) * step : wished;
  const size = round2(Math.min(limits.max, Math.max(limits.min, snapped)));
  if (vertical) return { y: side === 'bottom' ? box.y : round2(box.y + box.h - size), h: size };
  return { x: side === 'right' ? box.x : round2(box.x + box.w - size), w: size };
}

/** True when two boxes cover some of the same area (touching edges do not count). */
function overlaps(first, second) {
  const apartX = first.x + first.w <= second.x + EPSILON || second.x + second.w <= first.x + EPSILON;
  const apartY = first.y + first.h <= second.y + EPSILON || second.y + second.h <= first.y + EPSILON;
  return !apartX && !apartY;
}

/** The codes of every key that overlaps another one. */
export function overlappingCodes(boxes) {
  const codes = new Set();
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (!overlaps(boxes[i], boxes[j])) continue;
      codes.add(boxes[i].code);
      codes.add(boxes[j].code);
    }
  }
  return codes;
}

/**
 * For one axis: a function giving a coordinate's new value once every gap wider than `keepGap` between stretches of
 * keys is shrunk to `keepGap`. Keys keep their order and their relative places inside each stretch.
 */
function gapCloser(spans, keepGap) {
  const sorted = [...spans].sort((first, second) => first[0] - second[0]);
  const cuts = [];
  let end = sorted[0][0];
  for (const [from, to] of sorted) {
    const gap = from - end;
    if (gap > keepGap + EPSILON) cuts.push({ from, shrink: gap - keepGap });
    end = Math.max(end, to);
  }
  return (value) => {
    const shrinkBefore = cuts.filter((cut) => value >= cut.from - EPSILON);
    return value - shrinkBefore.reduce((sum, cut) => sum + cut.shrink, 0);
  };
}

/**
 * "Close gaps": slide the visible keys together so no gap between groups is wider than `keepGap` (CLOSED_GAP, or 0 in
 * Even grid), on both axes, then center the result on the board. Returns { code: { x, y } } for every box given.
 */
export function closeGapsPositions(boxes, board, keepGap = CLOSED_GAP, step = CLOSED_GAP) {
  if (!boxes.length) return {};
  const closeX = gapCloser(
    boxes.map((box) => [box.x, box.x + box.w]),
    keepGap,
  );
  const closeY = gapCloser(
    boxes.map((box) => [box.y, box.y + box.h]),
    keepGap,
  );
  const closed = boxes.map((box) => ({ ...box, x: closeX(box.x), y: closeY(box.y) }));
  const { dx, dy } = centreOffset(closed, board, step);
  const positions = {};
  for (const box of closed) positions[box.code] = { x: round2(box.x + dx), y: round2(box.y + dy) };
  return positions;
}
