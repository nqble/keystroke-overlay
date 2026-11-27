// =====================================================================================================================
//  A drawn device (a mouse, a controller) on the Keys tab's board, drawn as the device itself
//  (docs/proposals/mouse-shape.md). It shows the same file OBS shows, ui/overlay/devices/<id>.svg, which the Rust side
//  hands over (the device_drawing command), so the Keys tab and the overlay always agree. The block is still moved,
//  resized and turned like a key by editor.js; this file only fills it. The overlay's own copy of this is
//  ui/overlay/devices.js (the settings window can't import from the overlay): keep the fallbacks and the list of
//  removed elements in step with it.
// =====================================================================================================================
import { invoke } from '../helpers.js';

/** The drawing each block uses when it names none, or names one that doesn't exist (as in ui/overlay/devices.js). */
const DEFAULT_DRAWINGS = { Mouse: 'mouse', Controller: 'controller' };
/** Anything in a drawing that could load or run something; a drawing is only shapes (as in ui/overlay/devices.js). */
const UNSAFE_PARTS = 'script, foreignObject, image, use, a';

const drawings = new Map(); // drawing id -> Promise of its SVG text, or null when there is no such drawing

/** One drawing's text, asked for once. */
function drawingText(id) {
  if (!drawings.has(id)) {
    const text = invoke('device_drawing', { id }).catch(() => null); // no toast: a missing drawing falls back
    drawings.set(id, text);
  }
  return drawings.get(id);
}

/** The drawing as an element, with anything unsafe taken out; null when the text isn't a drawing. */
function parseDrawing(text) {
  const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
  if (svg.nodeName !== 'svg') return null;
  for (const unsafe of svg.querySelectorAll(UNSAFE_PARTS)) unsafe.remove();
  svg.setAttribute('class', 'device-drawing');
  svg.setAttribute('aria-hidden', 'true'); // the block carries the name
  return document.importNode(svg, true);
}

/**
 * Fill a device block with its drawing. Drawn once per drawing: a block that already shows it is left alone, so
 * redrawing the board after every change costs nothing.
 */
export async function paintDevice(node, key) {
  const fallback = DEFAULT_DRAWINGS[key.code] ?? 'mouse';
  const id = key.device || fallback;
  if (node.dataset.drawing === id) return;
  node.dataset.drawing = id;
  const text = (await drawingText(id)) ?? (await drawingText(fallback));
  const drawing = text ? parseDrawing(text) : null;
  if (!drawing || node.dataset.drawing !== id) return; // no drawing, or another one was asked for meanwhile
  node.replaceChildren(drawing);
}
