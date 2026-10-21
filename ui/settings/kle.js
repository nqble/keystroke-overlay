// =====================================================================================================================
//  The KLE reader: turns a file saved by keyboard-layout-editor.com ("KLE", Download → Download JSON) into a flat list
//  of keys, each with its place and size in keys (absolute, from the top-left), its rotation, its flags and its 12
//  legends in reading order. Plain logic with no imports, so tests/ui/kle.test.mjs runs it with Node.
//  kle-layout.js turns these keys into a layout of ours; the popup is kle-import-popup.js. The format is described in
//  docs/FILE-FORMATS.md (layouts from a KLE file).
//
//  A port of `deserialize` from kle-serial 0.15.1 (https://github.com/ijprest/kle-serial), which says it is the same
//  code KLE itself uses, with one change: giving `rx` or `ry` also moves the cursor to (rx, ry), as KLE itself and
//  ergogen's fork of kle-serial do (kle-serial 0.15.1 keeps counting rows from above, which puts a second turned
//  cluster in the wrong place). Colors, fonts, profiles and switches are not read: the overlay's look comes from the
//  Style tab, and the file's `background` and `css` are never loaded.
//
//  kle-serial is under the MIT license:
//    Copyright (c) 2013-2019 Ian Prest
//
//    Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
//    documentation files (the "Software"), to deal in the Software without restriction, including without limitation
//    the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
//    to permit persons to whom the Software is furnished to do so, subject to the following conditions:
//
//    The above copyright notice and this permission notice shall be included in all copies or substantial portions of
//    the Software.
//
//    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
//    THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
//    CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
//    IN THE SOFTWARE.
// =====================================================================================================================

/** How many legend places a key has: 0 top-left, 1 top-center, 2 top-right, 3..5 the middle row, 6..8 the bottom row,
 *  9..11 the front (the side facing the typist). */
export const LEGEND_PLACES = 12;

/**
 * Where each line of a key's text goes, for each legend alignment `a` (0..7): line i goes to place LEGEND_ORDER[a][i],
 * and -1 drops it. This is kle-serial's own table; with the default alignment 4, "!\n1" puts "!" top-left and "1"
 * bottom-left.
 */
const LEGEND_ORDER = [
  [0, 6, 2, 8, 9, 11, 3, 5, 1, 4, 7, 10], // 0: no centering
  [1, 7, -1, -1, 9, 11, 4, -1, -1, -1, -1, 10], // 1: centered across
  [3, -1, 5, -1, 9, 11, -1, -1, 4, -1, -1, 10], // 2: centered down
  [4, -1, -1, -1, 9, 11, -1, -1, -1, -1, -1, 10], // 3: centered both ways
  [0, 6, 2, 8, 10, -1, 3, 5, 1, 4, 7, -1], // 4: front centered (KLE's default)
  [1, 7, -1, -1, 10, -1, 4, -1, -1, -1, -1, -1], // 5: front centered, centered across
  [3, -1, 5, -1, 10, -1, -1, -1, 4, -1, -1, -1], // 6: front centered, centered down
  [4, -1, -1, -1, 10, -1, -1, -1, -1, -1, -1, -1], // 7: front centered, centered both ways
];
const DEFAULT_ALIGNMENT = 4;

/** The properties that must be numbers when they are given (KLE writes them as numbers). */
const NUMBER_PROPERTIES = ['x', 'y', 'w', 'h', 'x2', 'y2', 'w2', 'h2', 'r', 'rx', 'ry', 'a'];

/** The file is JSON but not a KLE layout. The message is for developers; the popup shows its own words. */
export class KleFormatError extends Error {}

function fail(why) {
  throw new KleFormatError(why);
}

const isPlainObject = (item) => typeof item === 'object' && item !== null && !Array.isArray(item);

/**
 * Read a KLE file's rows (the parsed JSON). Returns { name, keys }: the keyboard's name from its metadata ('' when it
 * has none) and every key in reading order, each { x, y, w, h, x2, y2, w2, h2, r, rx, ry, labels, decal, ghost,
 * stepped, nub } in keys and degrees. Throws a KleFormatError when the rows are not a KLE layout.
 */
export function readKle(rows) {
  if (!Array.isArray(rows)) fail('a KLE file is a list of rows');
  const reader = { cursor: startingCursor(), alignment: DEFAULT_ALIGNMENT, keys: [], name: '' };
  rows.forEach((row, index) => {
    if (Array.isArray(row)) {
      readRow(reader, row);
      return;
    }
    if (!isPlainObject(row)) fail(`row ${index + 1} is not a list of keys`);
    if (index !== 0) fail('the keyboard metadata must be the first item');
    reader.name = typeof row.name === 'string' ? row.name : '';
  });
  return { name: reader.name, keys: reader.keys };
}

/** The "current key": where the next key goes and what it looks like. Every new key starts as a copy of it. */
function startingCursor() {
  return {
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    x2: 0,
    y2: 0,
    w2: 1,
    h2: 1,
    r: 0,
    rx: 0,
    ry: 0,
    decal: false,
    ghost: false,
    stepped: false,
    nub: false,
  };
}

/** One row: text items are keys, objects change the keys after them. After the row, the cursor goes down one key. */
function readRow(reader, row) {
  row.forEach((item, position) => {
    if (typeof item === 'string') addKey(reader, item);
    else if (isPlainObject(item)) applyProperties(reader, item, position);
    else fail('a row may hold only key texts and property objects');
  });
  reader.cursor.y += 1;
  reader.cursor.x = reader.cursor.rx;
}

/** A key with the cursor's place, size and flags; then the cursor moves right by its width and forgets the rest. */
function addKey(reader, text) {
  const cursor = reader.cursor;
  reader.keys.push({
    ...cursor,
    // the second rectangle (an ISO Enter's lower part, say) is as big as the key unless the file says otherwise
    w2: cursor.w2 === 0 ? cursor.w : cursor.w2,
    h2: cursor.h2 === 0 ? cursor.h : cursor.h2,
    labels: legendsInPlaces(text.split('\n'), reader.alignment),
  });
  cursor.x += cursor.w;
  cursor.w = 1;
  cursor.h = 1;
  cursor.x2 = 0;
  cursor.y2 = 0;
  cursor.w2 = 0;
  cursor.h2 = 0;
  cursor.nub = false;
  cursor.stepped = false;
  cursor.decal = false;
}

/** The key's lines put in their legend places (kle-serial's reorderLabelsIn); an empty place is ''. */
function legendsInPlaces(lines, alignment) {
  const places = Array(LEGEND_PLACES).fill('');
  lines.slice(0, LEGEND_PLACES).forEach((line, index) => {
    const place = LEGEND_ORDER[alignment][index];
    if (line && place >= 0) places[place] = line;
  });
  return places;
}

/** A property object: rotation (only first in a row), legend alignment, then place, size and flags. */
function applyProperties(reader, item, position) {
  checkNumbers(item);
  const cursor = reader.cursor;
  const turns = item.r != null || item.rx != null || item.ry != null;
  if (turns && position !== 0) fail('rotation can only be given on the first item of a row');
  if (item.r != null) cursor.r = item.r;
  if (item.rx != null) cursor.rx = item.rx;
  if (item.ry != null) cursor.ry = item.ry;
  // KLE starts a turned cluster at its own turning point: the rows' x and y offsets count from (rx, ry)
  if (item.rx != null || item.ry != null) {
    cursor.x = cursor.rx;
    cursor.y = cursor.ry;
  }
  if (item.a != null) reader.alignment = item.a;
  applyPlaceAndSize(cursor, item);
  applyFlags(cursor, item);
}

/** Numbers must be finite, and the alignment one of the eight KLE has; anything else is not a KLE file. */
function checkNumbers(item) {
  for (const name of NUMBER_PROPERTIES) {
    if (item[name] != null && !Number.isFinite(item[name])) fail(`"${name}" must be a number`);
  }
  if (item.a != null && !LEGEND_ORDER[item.a]) fail('"a" must be a whole number from 0 to 7');
}

// KLE skips a zero or missing value (a width of 0 keeps the current width), so these test for "truthy", as it does.
function applyPlaceAndSize(cursor, item) {
  if (item.x) cursor.x += item.x;
  if (item.y) cursor.y += item.y;
  if (item.w) {
    cursor.w = item.w;
    cursor.w2 = item.w;
  }
  if (item.h) {
    cursor.h = item.h;
    cursor.h2 = item.h;
  }
  if (item.x2) cursor.x2 = item.x2;
  if (item.y2) cursor.y2 = item.y2;
  if (item.w2) cursor.w2 = item.w2;
  if (item.h2) cursor.h2 = item.h2;
}

/** Homing nub, stepped key and decal last for the next key only; ghost lasts until it is changed. */
function applyFlags(cursor, item) {
  if (item.n) cursor.nub = true;
  if (item.l) cursor.stepped = true;
  if (item.d) cursor.decal = true;
  if (item.g != null) cursor.ghost = Boolean(item.g);
}
