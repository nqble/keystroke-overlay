// =====================================================================================================================
//  Plain geometry for groups of keys in the Keys tab: how far a group may move, and where each key ends up.
//  No page code in here (it only imports round2 from profiles.js, which is plain too), so tests/ui can run it with Node.
//  Used by keys-map.js (dragging) and keys.js (the nudge pad). All numbers are in key units (1 = one normal key).
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
