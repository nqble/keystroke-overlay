// Turned keys (key rotation: docs/proposals/key-rotation.md). A key may be turned around its own center, by a layout
// file's `r` or by the user (a profile's `rotations`, Keyboard shape only). The key keeps its straight place and size;
// overlay.js turns its face and glow, and uses the box below for the overlay's size. No imports, so the tests can load
// it on its own.

/** The angle a key is drawn at, in degrees clockwise: the user's turn, else the layout file's, and never in the grid. */
export function angleOf(code, layoutAngle, layoutStyle, rotations) {
  if (layoutStyle === 'grid') return 0;
  const angle = rotations?.[code] ?? layoutAngle ?? 0;
  return Number.isFinite(angle) ? angle : 0;
}

/**
 * The box a key covers once turned: { left, top, right, bottom }, for a key at (x, y) of `width` × `height`, turned by
 * `degrees` around its center. Not turned, it is the key's own rectangle.
 */
export function turnedBox(x, y, width, height, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const halfWidth = (width * cos + height * sin) / 2;
  const halfHeight = (width * sin + height * cos) / 2;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  return {
    left: centerX - halfWidth,
    top: centerY - halfHeight,
    right: centerX + halfWidth,
    bottom: centerY + halfHeight,
  };
}
