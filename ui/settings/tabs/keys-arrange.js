// =====================================================================================================================
//  Plain geometry for groups of keys in the Keys tab: how far a group may move, and where each key ends up.
//  No page code in here (it only imports round2 from profiles.js, which is plain too), so tests/ui can run it with Node.
//  Used by editor/editor.js (dragging) and keys.js (the nudge pad). All numbers are in key units (1 = one normal key).
//
//  A "box" is { code, x, y, w, h }: a key's top-left corner and its size.
// =====================================================================================================================
import { round2 } from '../profiles.js';

/** The smallest rectangle that holds every box: { minX, minY, maxX, maxY }. */
export function boundsOf(boxes) {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return { minX: left, minY: top, maxX: right, maxY: bottom };
}

/**
 * Shrink a wished-for move so the whole group stays inside `area` ({ minX, minY, maxX, maxY }). The group keeps its shape:
 * if one key hits the edge, every key stops there. Returns the move that is allowed: { dx, dy }.
 */
export function clampMove(boxes, dx, dy, area) {
  const group = boundsOf(boxes);
  const lowestDx = area.minX - group.minX;
  const highestDx = area.maxX - group.maxX;
  const lowestDy = area.minY - group.minY;
  const highestDy = area.maxY - group.maxY;
  return {
    dx: Math.min(highestDx, Math.max(lowestDx, dx)),
    dy: Math.min(highestDy, Math.max(lowestDy, dy)),
  };
}

/** Where every box ends up after moving by (dx, dy): { code: { x, y } }, rounded to 2 decimals like the saved positions. */
export function movedPositions(boxes, dx, dy) {
  const positions = {};
  for (const box of boxes) positions[box.code] = { x: round2(box.x + dx), y: round2(box.y + dy) };
  return positions;
}

/** The ways to line keys up. Each lines the keys up with an edge or the middle of the group's outline. */
export const ALIGNMENTS = ['left', 'center', 'right', 'top', 'middle', 'bottom'];

/**
 * Line the boxes up with an edge or the center of the group (`ALIGNMENTS`). Only one direction changes: left, center
 * and right change x; top, middle and bottom change y. Returns { code: { x, y } } for every box.
 */
export function alignPositions(boxes, alignment) {
  const group = boundsOf(boxes);
  const positions = {};
  for (const box of boxes) {
    let { x, y } = box;
    if (alignment === 'left') x = group.minX;
    if (alignment === 'right') x = group.maxX - box.w;
    if (alignment === 'center') x = (group.minX + group.maxX) / 2 - box.w / 2;
    if (alignment === 'top') y = group.minY;
    if (alignment === 'bottom') y = group.maxY - box.h;
    if (alignment === 'middle') y = (group.minY + group.maxY) / 2 - box.h / 2;
    positions[box.code] = { x: round2(x), y: round2(y) };
  }
  return positions;
}

/**
 * Spread the boxes out so the gaps between neighboring keys are equal along one direction ('across' or 'down'). The
 * first and last key stay where they are. Needs three or more boxes; with fewer, nothing moves.
 */
export function distributePositions(boxes, direction) {
  const across = direction === 'across';
  const start = (box) => (across ? box.x : box.y);
  const size = (box) => (across ? box.w : box.h);
  const ordered = [...boxes].sort((first, second) => start(first) - start(second));
  const positions = {};
  for (const box of boxes) positions[box.code] = { x: box.x, y: box.y };
  if (ordered.length < 3) return positions;

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const spaceBetween = start(last) + size(last) - start(first);
  const totalSize = ordered.reduce((sum, box) => sum + size(box), 0);
  const gap = (spaceBetween - totalSize) / (ordered.length - 1);

  let next = start(first);
  for (const box of ordered) {
    const place = round2(next);
    positions[box.code] = across ? { x: place, y: box.y } : { x: box.x, y: place };
    next += size(box) + gap;
  }
  return positions;
}
