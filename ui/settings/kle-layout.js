// =====================================================================================================================
//  A KLE file → a layout of ours: { name, keys, report }. kle.js reads the file; this file places each key (the main
//  rectangle only, a turned key at the same center with its angle as `r`, the layout moved to 0, 0), leaves out decorations,
//  ghosts and tiny keys, and picks each key's code and label from its legends with the tables in key-names.js. A key it
//  can't link keeps its place with a placeholder code (Unlinked1, Unlinked2, ...), which never lights up. The Rust side
//  cleans the keys again before saving (clean_layout_keys in src-tauri/src/sanitize.rs). Plain logic, tested by
//  tests/ui/kle-layout.test.mjs; the popup is kle-import-popup.js; the file format is in docs/FILE-FORMATS.md.
//
//  Not built yet (a later step of the plan): matching letters and punctuation to what the user's own keyboard prints
//  (a German file's "Z" to KeyY), and linking a key by hand on the Keys tab.
// =====================================================================================================================
import { readKle, KleFormatError } from './kle.js';
import { RANK, SIDED_KEYS, iconCode, isKnownKey, legendMatch } from './key-names.js';
import { MAX_POSITION, MIN_KEY_WIDTH, round2 } from './profiles.js';

const TEXT = {
  defaultName: 'Imported layout',
};

/** The most keys a layout may have. Keep in step with MAX_LAYOUT_KEYS in src-tauri/src/sanitize.rs. */
export const MAX_LAYOUT_KEYS = 300;
// A file with far more keys than a layout may hold is refused before any key is placed, so a huge file can't freeze the
// window. Keys left out (decals, ghosts) make the raw count larger than the placed one, hence the room to spare.
const MAX_RAW_KEYS = MAX_LAYOUT_KEYS * 4;
// Legends longer than this are cut before they are read: real legends are a few characters, and a cap keeps every
// regular expression below fast on hostile text.
const MAX_LEGEND_SOURCE = 200;
/** The longest key label. Keep in step with MAX_LABEL_LENGTH in src-tauri/src/sanitize.rs. */
export const MAX_LABEL_LENGTH = 16;
/** The longest layout name. Keep in step with create_layout and add_layout (src-tauri/src/commands/). */
export const MAX_NAME_LENGTH = 30;
/** The start of a placeholder code: a key that is drawn but linked to no key of the keyboard. */
export const PLACEHOLDER_PREFIX = 'Unlinked';

const EDGE_TOLERANCE = 0.05; // keys this close (in keys) count as touching
const LOWEST_ROW_TOLERANCE = 0.5; // keys whose tops are this close to the lowest top are in the lowest row
const SPACE_BAR_MIN_WIDTH = 3; // a blank key at least this wide in the lowest row is the space bar
const ISO_ENTER_MIN_HEIGHT = 1.5; // an Enter at least this tall and at most this wide is an ISO (or big) Enter
const ISO_ENTER_MAX_WIDTH = 1.5;

/** Keys that are number-pad keys when they sit in the number pad: their main-keyboard code → the number-pad code. */
export const NUMBER_PAD_CODES = {
  Digit0: 'Numpad0',
  Digit1: 'Numpad1',
  Digit2: 'Numpad2',
  Digit3: 'Numpad3',
  Digit4: 'Numpad4',
  Digit5: 'Numpad5',
  Digit6: 'Numpad6',
  Digit7: 'Numpad7',
  Digit8: 'Numpad8',
  Digit9: 'Numpad9',
  Enter: 'NumpadEnter',
  Minus: 'NumpadSubtract',
  Slash: 'NumpadDivide',
  Period: 'NumpadDecimal',
  // the second legends printed on number-pad keys ("7" over "Home"), so ".\nDel" (where Del outranks ".") ends up right
  Insert: 'Numpad0',
  End: 'Numpad1',
  ArrowDown: 'Numpad2',
  PageDown: 'Numpad3',
  ArrowLeft: 'Numpad4',
  ArrowRight: 'Numpad6',
  Home: 'Numpad7',
  ArrowUp: 'Numpad8',
  PageUp: 'Numpad9',
  Delete: 'NumpadDecimal',
};
/** Number-pad keys known by their symbol rather than their code: "*" is Digit8's shifted symbol, "+" Equal's. */
export const NUMBER_PAD_SYMBOLS = { '*': 'NumpadMultiply', '+': 'NumpadAdd' };

/**
 * Turn the text of a file the user picked into a layout. Returns { name, keys, report } (report: the counts the popup
 * shows: keys, linked, notLinked, unlit, leftOut), or { problem } when the file can't be used: 'brokenFile' (not
 * JSON), 'notKle', 'noKeys', or 'tooManyKeys' (with `count`).
 */
export function layoutFromKle(text, fileName = '') {
  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    return { problem: 'brokenFile' };
  }
  let kle;
  try {
    kle = readKle(rows);
  } catch (error) {
    if (error instanceof KleFormatError) return { problem: 'notKle' };
    throw error;
  }
  if (kle.keys.length > MAX_RAW_KEYS) return { problem: 'tooManyKeys', count: kle.keys.length };
  const { placed, leftOut } = placeKeys(kle.keys);
  if (!placed.length) return { problem: 'noKeys' };
  if (placed.length > MAX_LAYOUT_KEYS) return { problem: 'tooManyKeys', count: placed.length };
  const keys = linkKeys(placed);
  const linked = keys.filter((key) => !key.code.startsWith(PLACEHOLDER_PREFIX)).length;
  const unlit = unlitNames(keys);
  const report = { keys: keys.length, linked, notLinked: keys.length - linked, unlit, leftOut };
  return { name: layoutName(kle.name, fileName), keys, report };
}

/** The labels of the keys that can't light up (Fn, macro keys), each once, in reading order; '' for a blank key. */
function unlitNames(keys) {
  const unlinked = keys.filter((key) => key.code.startsWith(PLACEHOLDER_PREFIX));
  const names = unlinked.map((key) => key.label ?? '');
  return [...new Set(names)];
}

/** The file's own name, else the file name without ".json", else "Imported layout"; at most MAX_NAME_LENGTH long. */
export function layoutName(kleName, fileName) {
  const fromFile = fileName.replace(/\.json$/i, '');
  const name = [kleName, fromFile].map(oneLine).find(Boolean) ?? TEXT.defaultName;
  return [...name].slice(0, MAX_NAME_LENGTH).join('');
}

const oneLine = (text) => cleanText(text ?? '');

// ---- Geometry -------------------------------------------------------------------------------------------------------
/**
 * The keys we keep, each { x, y, w, h, r, legends } in keys from the layout's top-left, in reading order (top to bottom,
 * then left to right); plus how many were left out.
 */
function placeKeys(kleKeys) {
  let leftOut = 0;
  const kept = [];
  for (const kleKey of kleKeys) {
    const shape = placeTurned(kleKey);
    const tiny = shape.w < MIN_KEY_WIDTH || shape.h < MIN_KEY_WIDTH;
    // a decal is a legend with no keycap and a ghost is drawn faint (usually another layout choice): nothing to draw
    if (kleKey.decal || kleKey.ghost || tiny) {
      leftOut += 1;
      continue;
    }
    kept.push({ ...shape, legends: kleKey.labels.map(cleanLegend) });
  }
  return { placed: inReadingOrder(moveToOrigin(kept)), leftOut };
}

/** An angle in -180..180 degrees. */
const normalAngle = (degrees) => ((((degrees + 180) % 360) + 360) % 360) - 180;

/**
 * A KLE key's main rectangle as we draw it: its own size, at the center the turned key has, turned by `r` around that
 * center (key rotation, docs/proposals/key-rotation.md). KLE turns the key by r degrees around (rx, ry), clockwise on
 * screen (y grows downwards); turning a rectangle around another point is the same as moving its center there and
 * turning it in place.
 */
export function placeTurned({ x, y, w, h, r, rx, ry }) {
  const angle = (r * Math.PI) / 180;
  const centerX = x + w / 2 - rx;
  const centerY = y + h / 2 - ry;
  const turnedX = rx + centerX * Math.cos(angle) - centerY * Math.sin(angle);
  const turnedY = ry + centerX * Math.sin(angle) + centerY * Math.cos(angle);
  return { x: turnedX - w / 2, y: turnedY - h / 2, w, h, r: Math.round(normalAngle(r) * 10) / 10 };
}

/** Move the keys so the layout's top-left is 0, 0 (like the built-in layouts), rounded to 2 decimals. */
function moveToOrigin(keys) {
  const left = smallest(keys.map((key) => key.x));
  const top = smallest(keys.map((key) => key.y));
  return keys.map((key) => ({
    ...key,
    x: round2(Math.min(key.x - left, MAX_POSITION)),
    y: round2(Math.min(key.y - top, MAX_POSITION)),
    w: round2(key.w),
    h: round2(key.h),
  }));
}

// reduce instead of Math.min(...values): spreading thousands of values into one call can overflow the stack
const smallest = (values) => values.reduce((low, value) => Math.min(low, value), Infinity);
const largest = (values) => values.reduce((high, value) => Math.max(high, value), -Infinity);

const inReadingOrder = (keys) => [...keys].sort((a, b) => a.y - b.y || a.x - b.x);

// ---- Legends --------------------------------------------------------------------------------------------------------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"' };
const MAX_CODE_POINT = 0x10ffff;

/** One entity (&amp;, &#65;, &#x41;) as its character; an unknown or impossible one becomes nothing. */
function decodeEntity(entity, name) {
  if (name in ENTITIES) return ENTITIES[name];
  const number = name.startsWith('#x') || name.startsWith('#X') ? parseInt(name.slice(2), 16) : Number(name.slice(1));
  const possible = name.startsWith('#') && Number.isInteger(number) && number > 0 && number <= MAX_CODE_POINT;
  return possible ? String.fromCodePoint(number) : '';
}

/** Legend text as plain text: no HTML tags (KLE allows HTML), entities turned into characters, spaces collapsed. */
function cleanText(raw) {
  const withoutTags = raw.replace(/<[^>]*>/g, ' ');
  const decoded = withoutTags.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, decodeEntity);
  return decoded.replace(/\s+/g, ' ').trim();
}

/** The code a KLE icon in the legend names (<i class='kb kb-Arrows-Up'></i>), read before the tags go; or null. */
function iconIn(raw) {
  for (const [, classes] of raw.matchAll(/<i\b[^>]*\bclass\s*=\s*["']([^"']*)["']/gi)) {
    const found = classes.split(/\s+/).map(iconCode).find(Boolean);
    if (found) return found;
  }
  return null;
}

/** One legend: { text } as written (cleaned), and the code its icon names, if any. */
export function cleanLegend(raw) {
  const capped = raw.slice(0, MAX_LEGEND_SOURCE);
  return { text: cleanText(capped), icon: iconIn(capped) };
}

// ---- Picking each key's code ----------------------------------------------------------------------------------------
/** Every key gets its code and label: the legend steps, then the place steps, then only known codes, each once. */
function linkKeys(placed) {
  const keys = placed.map((key) => ({ ...key, ...bestMatch(key.legends) }));
  useNumberPad(keys);
  pickSides(keys);
  findSpaceBar(keys);
  useIsoPlaces(keys);
  return finishKeys(keys);
}

/**
 * The best legend of a key: { code, legend } from the one with the best rank; on a tie the first in reading order.
 * The legends read together come first ("Page" over "Up" is Page Up, not the up arrow). { code: null } when none.
 */
function bestMatch(legends) {
  const texts = legends.map((legend) => legend.text).filter(Boolean);
  const candidates = [texts.join(' '), ...texts].map((text) => ({ text, found: legendMatch(text.toLowerCase()) }));
  const icons = legends.filter((legend) => legend.icon).map((legend) => ({ text: '', found: iconMatch(legend.icon) }));
  let best = null;
  for (const candidate of [...icons, ...candidates]) {
    if (!candidate.found) continue;
    if (!best || candidate.found.rank < best.found.rank) best = candidate;
  }
  return best ? { code: best.found.code, legend: best.text } : { code: null, legend: '' };
}

const iconMatch = (code) => ({ code, rank: RANK.OWN_NAME });

/** Keys in the number pad get the number-pad codes (step 4 of the plan). */
function useNumberPad(keys) {
  const numLock = keys.find((key) => key.code === 'NumLock');
  const padCode = (key) => NUMBER_PAD_SYMBOLS[key.legend] ?? NUMBER_PAD_CODES[key.code];
  if (numLock) {
    // the number pad: at or right of Num Lock's left edge, from its row down
    const inPad = (key) =>
      key !== numLock && key.x >= numLock.x - EDGE_TOLERANCE && key.y >= numLock.y - EDGE_TOLERANCE;
    for (const key of keys.filter(inPad)) key.code = padCode(key) ?? key.code;
    return;
  }
  // no Num Lock: of two keys with the same code (two "7" keys, two "Del" keys), the second in reading order is the
  // pad's; a key whose code appears once (the arrows of a keyboard without a number pad) stays as it is
  const seen = new Set();
  for (const key of keys) {
    const code = padCode(key);
    if (!code) continue;
    if (seen.has(key.code)) key.code = code;
    else seen.add(key.code);
  }
}

/** "Shift", "Ctrl", "Alt" and "Win" become their Left or Right key by place (step 5); explicit sides win. */
export function pickSides(keys) {
  const layoutWidth = largest(keys.map((key) => key.x + key.w));
  const centerX = (key) => key.x + key.w / 2;
  for (const [generic, [leftCode, rightCode]] of Object.entries(SIDED_KEYS)) {
    const unsided = keys.filter((key) => key.code === generic).sort((a, b) => centerX(a) - centerX(b));
    const taken = new Set(keys.map((key) => key.code));
    if (!unsided.length) continue;
    const first = unsided[0];
    const last = unsided[unsided.length - 1];
    if (unsided.length === 1) {
      // by its half of the layout, unless a key with an explicit side ("RShift") already has that one
      const [near, far] = centerX(first) < layoutWidth / 2 ? [leftCode, rightCode] : [rightCode, leftCode];
      if (!taken.has(near)) first.code = near;
      else if (!taken.has(far)) first.code = far;
      continue;
    }
    if (!taken.has(leftCode)) first.code = leftCode;
    if (!taken.has(rightCode)) last.code = rightCode;
  }
}

/** A blank key at least 3 keys wide in the lowest row is the space bar (KLE space bars are usually blank). */
function findSpaceBar(keys) {
  if (keys.some((key) => key.code === 'Space')) return;
  const lowestTop = largest(keys.map((key) => key.y));
  const isBlank = (key) => key.legends.every((legend) => !legend.text && !legend.icon);
  const spaceBar = keys.find(
    (key) => isBlank(key) && key.w >= SPACE_BAR_MIN_WIDTH && key.y >= lowestTop - LOWEST_ROW_TOLERANCE,
  );
  if (spaceBar) spaceBar.code = 'Space';
}

/**
 * On an ISO keyboard, two keys are known by place, whatever their legends say (UK, German and other legends differ):
 * the 1-key-wide key just left of the ISO Enter's lower half is Backslash, and the key between left Shift and Z is
 * IntlBackslash.
 */
function useIsoPlaces(keys) {
  const enter = keys.find((key) => key.code === 'Enter');
  if (!enter || enter.h < ISO_ENTER_MIN_HEIGHT || enter.w > ISO_ENTER_MAX_WIDTH) return;
  const touches = (a, b) => Math.abs(a - b) <= EDGE_TOLERANCE;
  const lowerHalfTop = enter.y + enter.h / 2;
  const backslash = keys.find(
    (key) =>
      touches(key.w, 1) &&
      touches(key.x + key.w, enter.x) &&
      key.y < enter.y + enter.h &&
      key.y + key.h > lowerHalfTop + EDGE_TOLERANCE,
  );
  if (backslash) backslash.code = 'Backslash';
  const shift = keys.find((key) => key.code === 'ShiftLeft');
  const keyZ = keys.find((key) => key.code === 'KeyZ');
  if (!shift || !keyZ) return;
  const between = keys.find(
    (key) =>
      touches(key.y, shift.y) &&
      key.x >= shift.x + shift.w - EDGE_TOLERANCE &&
      key.x + key.w <= keyZ.x + EDGE_TOLERANCE,
  );
  if (between) between.code = 'IntlBackslash';
}

/**
 * The last steps: a code the app can't see (F13, a media key, a "Shift" no side was found for) is not used, and a
 * code a key earlier in reading order already has isn't either; such keys get the next placeholder. Then each key gets
 * its label: the legend that matched, else its first legend, else none.
 */
function finishKeys(keys) {
  const used = new Set();
  let placeholders = 0;
  return keys.map((key) => {
    let code = key.code;
    if (!code || !isKnownKey(code) || used.has(code)) {
      placeholders += 1;
      code = `${PLACEHOLDER_PREFIX}${placeholders}`;
    }
    used.add(code);
    const firstLegend = key.legends.find((legend) => legend.text)?.text ?? '';
    const label = [...(key.legend || firstLegend)].slice(0, MAX_LABEL_LENGTH).join('');
    const layoutKey = withSize({ code, label, x: key.x, y: key.y }, key);
    if (key.r) layoutKey.r = key.r; // a layout file writes r only for a turned key
    return layoutKey;
  });
}

/** A layout file writes w and h only when they are not 1 (one key), like the built-in layouts. */
function withSize(layoutKey, { w, h }) {
  if (w !== 1) layoutKey.w = w;
  if (h !== 1) layoutKey.h = h;
  return layoutKey;
}
