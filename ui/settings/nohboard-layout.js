// =====================================================================================================================
//  A NohBoard keyboard file (keyboard.json) → a layout of ours: { name, keys, report }, the same shape kle-layout.js
//  gives, so the review popup (kle-import-popup.js), add_layout and the Rust cleaning are shared. NohBoard draws keys as
//  polygons in pixels and names each by its Windows virtual key; this file turns pixels into keys (the most common key
//  width plus the most common gap is one key) and virtual keys into codes (key-names.js, with the typing keys asked
//  from Windows by the caller, because they depend on the keyboard language). Mouse buttons and wheel get the names
//  mouse support will use (docs/design/future-inputs.md), so they light up by themselves once it exists. Windows only;
//  the format and the plan are in docs/FILE-FORMATS.md. Plain logic, tested by tests/ui/nohboard-layout.test.mjs.
// =====================================================================================================================
import { parseLenientJson } from './json-lenient.js';
import { VIRTUAL_KEY_CODES, isKnownKey } from './key-names.js';
import { MAX_LABEL_LENGTH, MAX_LAYOUT_KEYS, PLACEHOLDER_PREFIX, layoutName, pickSides } from './kle-layout.js';
import { round2 } from './profiles.js';

const TEXT = {
  defaultName: 'NohBoard keyboard',
};

/** NohBoard's mouse elements, by their key code (0, 1, ...), → the names mouse support reserves. */
export const MOUSE_CODES = {
  MouseKey: ['MouseLeft', 'MouseRight', 'MouseMiddle', 'MouseBack', 'MouseForward'],
  MouseScroll: ['WheelUp', 'WheelDown', 'WheelRight', 'WheelLeft'],
};
const ALL_MOUSE_CODES = new Set(Object.values(MOUSE_CODES).flat());
/** True for a mouse button or wheel name: drawn now, lights up once the app sees the mouse. */
export const isMouseCode = (code) => ALL_MOUSE_CODES.has(code);

// A file with far more elements than a layout may hold is refused before any key is placed (as kle-layout.js does).
const MAX_RAW_ELEMENTS = MAX_LAYOUT_KEYS * 4;
const QUARTER = 0.25;
const SNAP_TOLERANCE = 0.05; // a size this close to a quarter key is put on it (hand-drawn files are a pixel off)

/**
 * Turn the text of a keyboard.json the user picked into a layout. `folderName` is the keyboard's folder (its name in
 * NohBoard); `typingKeys` is {virtualKey: code} for the typing keys on this PC's keyboard. Returns { name, keys, report }
 * (report: keys, linked, notLinked, unlit, leftOut, mouse) or { problem }: 'brokenFile', 'notNohBoard', 'ourFile',
 * 'noKeys' or 'tooManyKeys' (with `count`).
 */
export function layoutFromNohBoard(text, folderName = '', typingKeys = {}) {
  let file;
  try {
    file = parseLenientJson(text);
  } catch {
    return { problem: 'brokenFile' };
  }
  const problem = fileProblem(file);
  if (problem) return problem;
  const drawn = file.Elements.filter((element) => Object.hasOwn(DRAWN_TYPES, element?.__type ?? '') && boxOf(element));
  const leftOut = file.Elements.length - drawn.length;
  if (!drawn.length) return { problem: 'noKeys' };
  if (drawn.length > MAX_LAYOUT_KEYS) return { problem: 'tooManyKeys', count: drawn.length };
  const keys = finishKeys(placeKeys(drawn), { ...VIRTUAL_KEY_CODES, ...typingKeys });
  const name = layoutName(oneLine(folderName) || TEXT.defaultName, '');
  return { name, keys, report: reportOn(keys, leftOut) };
}

/** Why the parsed file isn't a NohBoard keyboard, as { problem }, or null when it is one. */
function fileProblem(file) {
  if (Array.isArray(file?.keys) || Array.isArray(file?.layouts)) return { problem: 'ourFile' };
  if (!Array.isArray(file?.Elements) || file.Version === undefined) return { problem: 'notNohBoard' };
  if (file.Elements.length > MAX_RAW_ELEMENTS) return { problem: 'tooManyKeys', count: file.Elements.length };
  return null;
}

/** What the review popup says: how many keys, how many light up now, which can't, and what was left out. */
function reportOn(keys, leftOut) {
  const mouse = keys.filter((key) => isMouseCode(key.code)).length;
  const unlinked = keys.filter((key) => key.code.startsWith(PLACEHOLDER_PREFIX));
  const unlit = [...new Set(unlinked.map((key) => key.label ?? ''))];
  const linked = keys.length - mouse - unlinked.length;
  return { keys: keys.length, linked, notLinked: unlinked.length, unlit, leftOut, mouse };
}

const oneLine = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();

// ---- Geometry: pixels to keys ---------------------------------------------------------------------------------------
// The element types that become keys; MouseSpeedIndicator (pointer movement, which the app never reads) is left out.
const DRAWN_TYPES = { KeyboardKey: true, MouseKey: true, MouseScroll: true };

/** The polygon's points as numbers, or [] when there aren't at least three. */
function pointsOf(element) {
  const raw = Array.isArray(element.Boundaries) ? element.Boundaries : [];
  const points = raw.map((point) => ({ x: Number(point?.X), y: Number(point?.Y) }));
  const usable = points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  return usable && points.length >= 3 ? points : [];
}

/**
 * The key's rectangle in pixels { left, top, right, bottom }, or null. For a polygon that isn't a rectangle (an ISO
 * Enter), the part that runs the key's full height: the narrowest left-to-right span over every horizontal band.
 */
export function boxOf(element) {
  const points = pointsOf(element);
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const whole = { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  if (whole.right <= whole.left || whole.bottom <= whole.top) return null;
  const bandEdges = [...new Set(ys)].sort((a, b) => a - b);
  let { left, right } = whole;
  for (let index = 1; index < bandEdges.length; index += 1) {
    const span = spanAt(points, (bandEdges[index - 1] + bandEdges[index]) / 2);
    if (!span) continue;
    left = Math.max(left, span.left);
    right = Math.min(right, span.right);
  }
  return right > left ? { ...whole, left, right } : whole;
}

/** Where a horizontal line at `y` enters and leaves the polygon, or null when it misses. */
function spanAt(points, y) {
  const crossings = [];
  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length];
    const crosses = (start.y <= y && end.y > y) || (end.y <= y && start.y > y);
    if (crosses) crossings.push(start.x + ((y - start.y) / (end.y - start.y)) * (end.x - start.x));
  });
  return crossings.length ? { left: Math.min(...crossings), right: Math.max(...crossings) } : null;
}

/** The value seen most often (the first of equals), or `fallback` for an empty list. */
function mostCommon(values, fallback) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = fallback;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count <= bestCount) continue;
    best = value;
    bestCount = count;
  }
  return best;
}

/** One key's width in pixels and the gap between keys: the most common of each among the keyboard keys. */
function keySpacing(boxes) {
  const widths = boxes.map((box) => Math.round(box.right - box.left));
  const width = mostCommon(widths, 1);
  const gaps = [];
  for (const box of boxes) {
    const sameRow = boxes.filter((other) => Math.round(other.top) === Math.round(box.top) && other.left >= box.right);
    const nextLeft = Math.min(...sameRow.map((other) => other.left));
    const gap = Math.round(nextLeft - box.right);
    if (gap >= 0 && gap < width / 2) gaps.push(gap);
  }
  return { width, gap: mostCommon(gaps, 0) };
}

/** Pixels → keys: on a quarter key when within SNAP_TOLERANCE of one, else to 2 decimals. */
function inKeys(pixels, pitch) {
  const keys = pixels / pitch;
  const quarter = Math.round(keys / QUARTER) * QUARTER;
  return Math.abs(keys - quarter) <= SNAP_TOLERANCE ? quarter : round2(keys);
}

/** Every drawn element as { element, x, y, w, h } in keys, from the layout's top-left, in reading order. */
function placeKeys(drawn) {
  const placed = drawn.map((element) => ({ element, box: boxOf(element) }));
  const keyboardBoxes = placed.filter(({ element }) => element.__type === 'KeyboardKey').map(({ box }) => box);
  const { width, gap } = keySpacing(keyboardBoxes.length ? keyboardBoxes : placed.map(({ box }) => box));
  const pitch = width + gap;
  const left = Math.min(...placed.map(({ box }) => box.left));
  const top = Math.min(...placed.map(({ box }) => box.top));
  const keys = placed.map(({ element, box }) => ({
    element,
    x: inKeys(box.left - left, pitch),
    y: inKeys(box.top - top, pitch),
    w: inKeys(box.right - box.left + gap, pitch),
    h: inKeys(box.bottom - box.top + gap, pitch),
  }));
  return keys.sort((a, b) => a.y - b.y || a.x - b.x);
}

// ---- Codes and labels -----------------------------------------------------------------------------------------------
/** The code a NohBoard element stands for (first of its key codes that names a key), or '' when none does. */
function codeOf(element, codeByVirtualKey) {
  const keyCodes = Array.isArray(element.KeyCodes) ? element.KeyCodes : [element.KeyCode];
  const mouseNames = MOUSE_CODES[element.__type];
  for (const keyCode of keyCodes) {
    const code = mouseNames ? mouseNames[keyCode] : codeByVirtualKey[keyCode];
    if (typeof code === 'string') return code;
  }
  return '';
}

/**
 * Codes, then labels: a modifier without a side gets one by place; a code the app can't see (and isn't a mouse name),
 * or one an earlier key already has, becomes the next placeholder, which keeps its place but never lights up.
 */
function finishKeys(placed, codeByVirtualKey) {
  for (const key of placed) key.code = codeOf(key.element, codeByVirtualKey);
  pickSides(placed);
  const used = new Set();
  let placeholders = 0;
  return placed.map((key) => {
    let code = key.code;
    if (!(isKnownKey(code) || isMouseCode(code)) || used.has(code)) {
      placeholders += 1;
      code = `${PLACEHOLDER_PREFIX}${placeholders}`;
    }
    used.add(code);
    const label = [...oneLine(key.element.Text)].slice(0, MAX_LABEL_LENGTH).join('');
    const layoutKey = { code, label, x: key.x, y: key.y };
    if (key.w !== 1) layoutKey.w = key.w;
    if (key.h !== 1) layoutKey.h = key.h;
    return layoutKey;
  });
}
