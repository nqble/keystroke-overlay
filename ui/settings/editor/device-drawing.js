// =====================================================================================================================
//  A drawn device (a mouse, a controller) on the Keys tab's board, drawn as the device itself
//  (docs/design/future-inputs.md §2). It shows the same file OBS shows, ui/overlay/devices/<id>.svg, which the Rust side
//  hands over (the device_drawing command), so the Keys tab and the overlay always agree. The block is still moved,
//  resized and turned like a key by editor.js; this file only fills it. The overlay's own copy of this is
//  ui/overlay/devices.js (the settings window can't import from the overlay): keep the fallbacks and the list of
//  removed elements in step with it.
//
//  Extra buttons (parts with a data-slot) are shown here even before they have a key, dashed, so they can be found
//  and assigned (tabs/keys-device.js); the overlay leaves an unassigned one out.
// =====================================================================================================================
import { invoke } from '../helpers.js';

/** The drawing each block uses when it names none, or names one that doesn't exist (as in ui/overlay/devices.js). */
const DEFAULT_DRAWINGS = { Mouse: 'mouse', Controller: 'controller' };
/** Anything in a drawing that could load or run something; a drawing is only shapes (as in ui/overlay/devices.js). */
const UNSAFE_PARTS = 'script, foreignObject, image, use, a';
/**
 * The shapes the Keys tab offers for each device, in order: each is a file in ui/overlay/devices/ (a test checks that
 * every drawing there is listed). Their names are the keysDevice.shapes words.
 */
export const DEVICE_SHAPES = { Mouse: ['mouse', 'mouse-gaming'], Controller: ['controller'] };

const drawings = new Map(); // drawing id -> Promise of its SVG text, or null when there is no such drawing

/** One drawing's text, asked for once. */
function drawingText(id) {
  if (!drawings.has(id)) {
    const text = invoke('device_drawing', { id }).catch(() => null); // no toast: a missing drawing falls back
    drawings.set(id, text);
  }
  return drawings.get(id);
}

/** The drawing a device block shows: the one chosen for this layout, else the layout file's, else its device's own. */
export function drawingId(key, profile) {
  return profile.deviceDrawings[key.code] ?? key.device ?? DEFAULT_DRAWINGS[key.code] ?? 'mouse';
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

/** The extra buttons (data-slot names) of a drawing, in the order the drawing lists them; none when it has none. */
export async function extraButtonsOf(id) {
  const text = await drawingText(id);
  if (!text) return [];
  const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
  return [...svg.querySelectorAll('[data-slot]')].map((part) => part.getAttribute('data-slot'));
}

/** Marks each extra button as assigned (solid) or not yet (dashed, tabs.css). */
function markExtraButtons(drawing, deviceKeys) {
  for (const extra of drawing.querySelectorAll('[data-slot]')) {
    const assigned = Boolean(deviceKeys[extra.getAttribute('data-slot')]);
    extra.classList.toggle('slot-free', !assigned);
  }
}

/**
 * Fill a device block with its drawing. Drawn once per drawing and set of assigned keys: a block that already shows
 * them is left alone, so redrawing the board after every change costs nothing.
 */
export async function paintDevice(node, key, profile) {
  const id = drawingId(key, profile);
  const shown = `${id} ${JSON.stringify(profile.deviceKeys)}`;
  if (node.dataset.drawing === shown) return;
  node.dataset.drawing = shown;
  const fallback = DEFAULT_DRAWINGS[key.code] ?? 'mouse';
  const text = (await drawingText(id)) ?? (await drawingText(fallback));
  const drawing = text ? parseDrawing(text) : null;
  if (!drawing || node.dataset.drawing !== shown) return; // no drawing, or another one was asked for meanwhile
  markExtraButtons(drawing, profile.deviceKeys);
  node.replaceChildren(drawing);
}
