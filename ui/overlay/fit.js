// Fitting the keyboard into the OBS source's box (used by overlay.js). OBS gives the overlay a fixed width and
// height; when that box isn't exactly the size the app suggests (it changes with each layout), the keys are scaled to
// fit inside it, keeping their shape, and centered. No imports, so the tests can load it on its own.

/**
 * How to place a keyboard of `size` ({ w, h } pixels, padding included) in a box of `box` ({ w, h } pixels):
 * { fit, x, y }, where `fit` multiplies the keyboard's size and x, y are its top-left corner. A box with no size yet
 * (a page that is still loading) leaves the keyboard as it is.
 */
export function fitInBox(size, box) {
  if (size.w <= 0 || size.h <= 0 || box.w <= 0 || box.h <= 0) return { fit: 1, x: 0, y: 0 };
  const fit = Math.min(box.w / size.w, box.h / size.h);
  return { fit, x: (box.w - size.w * fit) / 2, y: (box.h - size.h * fit) / 2 };
}

const MIN_PAD = 16; // room around the keys even with no glow, in pixels
const GLOW_SPREAD_DIVISOR = 3; // the glow's box-shadow spread is its size / 3 (overlay.css .glow): keep both in step

/**
 * Room to leave around the keys so the glow reaches its full size: its blur plus its spread, at the key scale, and never
 * less than MIN_PAD. Without it a glow is cut off at the edge of the box (OBS's page, or the settings preview).
 */
export function stagePad(glowSize, scale) {
  const glowReach = Math.ceil(glowSize * (1 + 1 / GLOW_SPREAD_DIVISOR) * scale);
  return Math.max(MIN_PAD, glowReach);
}
