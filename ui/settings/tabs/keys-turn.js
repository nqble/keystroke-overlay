// =====================================================================================================================
//  Turning keys in the Keys tab (key rotation, docs/proposals/key-rotation.md): plain maths with its own unit tests. The
//  handle that uses it is editor/rotate.js. Angles are degrees, clockwise, between -180 and 180.
// =====================================================================================================================

/** An angle brought into -180..180 (turning past 180 comes back in at -180). */
export function normalizeAngle(degrees) {
  const turned = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return turned === -180 ? 180 : turned;
}

/** The direction from `center` to `point`, in degrees clockwise from pointing right (screen y grows downwards). */
export const pointerAngle = (center, point) => (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;

/**
 * The key's new angle while its handle is dragged: the angle it had, plus how far the pointer has turned around its
 * center since the press, in steps of `step` degrees (0 or 1: whole degrees).
 */
export function turnedAngle(startAngle, startPointer, pointerNow, step) {
  const raw = normalizeAngle(startAngle + pointerNow - startPointer);
  const size = step > 0 ? step : 1;
  return normalizeAngle(Math.round(raw / size) * size);
}

/**
 * The box a turned key covers, as an upright box: { code, x, y, w, h } around the key's center. The board's edges and the
 * overlap warning use it, so a turned key stays on the board and an overlap is never missed. Not turned, it is the key itself.
 */
export function turnedBounds(box) {
  if (!box.r) return { code: box.code, x: box.x, y: box.y, w: box.w, h: box.h };
  const radians = (box.r * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const w = box.w * cos + box.h * sin;
  const h = box.w * sin + box.h * cos;
  return { code: box.code, x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** The four corners of a key turned around its center: [{ x, y }]. */
function cornersOf(box) {
  const radians = ((box.r ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sideX, sideY]) => {
    const dx = (sideX * box.w) / 2;
    const dy = (sideY * box.h) / 2;
    return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
  });
}

/**
 * True when two keys, either of them turned, cover some of the same area; touching (within `epsilon`) doesn't count. Two
 * rectangles are apart exactly when, along one of their edge directions, their shadows don't meet (the separating axis
 * test), so neighbors a turned key doesn't reach are never flagged.
 */
export function turnedOverlap(first, second, epsilon) {
  const firstCorners = cornersOf(first);
  const secondCorners = cornersOf(second);
  for (const corners of [firstCorners, secondCorners]) {
    for (let i = 0; i < 2; i++) {
      const axis = { x: corners[i + 1].x - corners[i].x, y: corners[i + 1].y - corners[i].y };
      const length = Math.hypot(axis.x, axis.y) || 1;
      const shadow = (points) => points.map((point) => (point.x * axis.x + point.y * axis.y) / length);
      const firstShadow = shadow(firstCorners);
      const secondShadow = shadow(secondCorners);
      const apart =
        Math.max(...firstShadow) <= Math.min(...secondShadow) + epsilon ||
        Math.max(...secondShadow) <= Math.min(...firstShadow) + epsilon;
      if (apart) return false;
    }
  }
  return true;
}
