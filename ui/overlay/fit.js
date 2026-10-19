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
