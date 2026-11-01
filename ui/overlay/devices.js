// =====================================================================================================================
//  Drawn devices on the overlay (docs/proposals/drawn-devices.md): a layout entry with a `device` field, named Mouse or
//  Controller, is drawn as a picture of that device instead of a key. A drawing is one file, ui/overlay/devices/<id>.svg;
//  each part that lights up carries a data-code (MouseLeft, WheelUp, PadA), the body the class device-body. Adding a
//  drawing is adding that one file. overlay.js places the block like a key and lights the parts like keys ('down');
//  the looks are in overlay.css. Plain DOM, no library.
// =====================================================================================================================

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The drawing each block uses when its own is missing. */
const DEFAULT_DRAWINGS = { Mouse: 'mouse', Controller: 'controller' };
const drawings = new Map(); // drawing id -> Promise of its SVG text, or null when there is no such file

/** The drawing a device block asks for, as the path to fetch, and the one to fall back on. */
export function drawingPaths(layoutKey) {
  const fallback = DEFAULT_DRAWINGS[layoutKey.code] ?? 'mouse';
  const own = layoutKey.device || fallback;
  return [`/overlay/devices/${own}.svg`, `/overlay/devices/${fallback}.svg`];
}

/** One drawing's text, fetched once (`getText` is overlay.js's fetch, which adds the secure link's key). */
function drawingText(path, getText) {
  if (!drawings.has(path))
    drawings.set(
      path,
      getText(path).catch(() => null),
    );
  return drawings.get(path);
}

/** Each lit part becomes a group holding two copies, idle and pressed, so a press only fades opacity (CLAUDE.md). */
function wrapPart(part) {
  const group = part.ownerDocument.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'part');
  group.setAttribute('data-code', part.getAttribute('data-code'));
  part.replaceWith(group);
  const pressed = part.cloneNode(true);
  part.setAttribute('class', 'part-idle');
  pressed.setAttribute('class', 'part-on');
  part.removeAttribute('data-code');
  pressed.removeAttribute('data-code');
  group.append(part, pressed);
}

/** Puts the drawing in `shell` and returns its parts by code (the first part with a code wins). Scripts, outside
 *  pictures and anything that could run code are taken out first: a drawing is only shapes. */
function insertDrawing(shell, text) {
  const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
  if (svg.nodeName !== 'svg') return new Map();
  for (const unsafe of svg.querySelectorAll('script, foreignObject, image, use, a')) unsafe.remove();
  for (const part of svg.querySelectorAll('[data-code]')) wrapPart(part);
  shell.append(document.importNode(svg, true));
  const parts = new Map();
  for (const group of shell.querySelectorAll('g.part')) {
    const code = group.getAttribute('data-code');
    if (!parts.has(code)) parts.set(code, group);
  }
  return parts;
}

/**
 * Fills a device block with its drawing and calls `onParts(parts)` with its parts by code, once loaded. Nothing
 * happens when the block was replaced meanwhile (the overlay rebuilt its keys).
 */
export async function drawDevice(shell, layoutKey, getText, onParts) {
  const [own, fallback] = drawingPaths(layoutKey);
  const text = (await drawingText(own, getText)) ?? (await drawingText(fallback, getText));
  if (!text || !shell.isConnected) return;
  onParts(insertDrawing(shell, text));
}
