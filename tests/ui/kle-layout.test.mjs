// A KLE file → a layout of ours (ui/settings/kle-layout.js): the round trips of the two fixtures made from our own
// layouts, the geometry (turned keys, decorations, tiny keys), each rule for picking a key's code, placeholders, labels
// and the problems the popup reports. The fixtures and their sources are in tests/ui/fixtures/kle/.
// Run with: node --test tests/ui/kle-layout.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isKnownKey } from '../../ui/settings/key-names.js';
import {
  MAX_LAYOUT_KEYS,
  NUMBER_PAD_CODES,
  NUMBER_PAD_SYMBOLS,
  cleanLegend,
  layoutFromKle,
  layoutName,
  straighten,
} from '../../ui/settings/kle-layout.js';

const read = (url) => readFileSync(url, 'utf8');
const fixture = (name) => read(new URL(`fixtures/kle/${name}`, import.meta.url));
const builtIn = (id) => JSON.parse(read(new URL(`../../ui/overlay/layouts/${id}.json`, import.meta.url)));
/** A layout from rows written in the test (JavaScript values, as KLE's JSON would hold them). */
const fromRows = (rows) => layoutFromKle(JSON.stringify(rows));
const codesOf = (result) => result.keys.map((key) => key.code);
/** Code, place and size of each key, sorted by code: what a round trip must give back. */
const shapes = (keys) =>
  keys
    .map((key) => ({ code: key.code, x: key.x, y: key.y, w: key.w ?? 1, h: key.h ?? 1 }))
    .sort((a, b) => a.code.localeCompare(b.code));

// ---- Round trips: files made from our own layouts give those layouts back -------------------------------------------
for (const [file, id] of [
  ['ansi-60.kle.json', 'compact-60'],
  ['iso-tkl.kle.json', 'tkl-iso'],
]) {
  test(`${file} imports as ${id}.json: the same codes, places and sizes`, () => {
    const result = layoutFromKle(fixture(file), file);
    const original = builtIn(id);
    assert.deepEqual(shapes(result.keys), shapes(original.keys));
    assert.deepEqual(result.report, {
      keys: original.keys.length,
      linked: original.keys.length,
      notLinked: 0,
      unlit: [],
      straightened: 0,
      leftOut: 0,
    });
  });
}

test("the layout is named after the file's own name, else the file, else 'Imported layout'", () => {
  assert.equal(
    layoutFromKle(fixture('ansi-60.kle.json'), 'x.json').name,
    '60% ANSI (Keystroke Overlay fi',
    '30 at most',
  );
  assert.equal(layoutName('', 'My board.JSON'), 'My board');
  assert.equal(layoutName('  <b>Bold</b>  ', 'file.json'), 'Bold');
  assert.equal(layoutName('', ''), 'Imported layout');
  assert.equal([...layoutName('n'.repeat(50), '')].length, 30);
});

// ---- Geometry -------------------------------------------------------------------------------------------------------
test('a turned key keeps its center, and swaps width and height near a quarter turn', () => {
  const center = ({ x, y, w, h }) => [x + w / 2, y + h / 2];
  const turned = { x: 1, y: 0, w: 2, h: 1, r: 90, rx: 1, ry: 0 };
  const straight = straighten(turned);
  // the center (2, 0.5), turned 90 degrees clockwise around (1, 0), is at (0.5, 1)
  center(straight).forEach((value, index) => assert.ok(Math.abs(value - [0.5, 1][index]) < 1e-9));
  assert.deepEqual([straight.w, straight.h], [1, 2]);
  const slightly = straighten({ ...turned, r: 30 });
  assert.deepEqual([slightly.w, slightly.h], [2, 1]);
  assert.deepEqual([straighten({ ...turned, r: -100 }).w, straighten({ ...turned, r: 270 }).w], [1, 1]);
  const unturned = straighten({ ...turned, r: 0 });
  assert.deepEqual([unturned.x, unturned.y], [1, 0]);
});

test('the Atreus: every key is placed straight, the layout starts at 0, 0, Fn is a placeholder', () => {
  const result = layoutFromKle(fixture('atreus-rotated.kle.json'), 'atreus.json');
  assert.equal(result.report.keys, 42);
  assert.equal(result.report.straightened, 42);
  assert.equal(Math.min(...result.keys.map((key) => key.x)), 0);
  assert.equal(Math.min(...result.keys.map((key) => key.y)), 0);
  const byLabel = new Map(result.keys.map((key) => [key.label, key.code]));
  assert.equal(byLabel.get('Q'), 'KeyQ');
  assert.equal(byLabel.get('fn'), 'Unlinked1');
  assert.equal(byLabel.get('super'), 'MetaLeft');
  assert.equal(byLabel.get('Alt'), 'AltRight', 'a single Alt in the right half');
  assert.equal(result.report.notLinked, 1);
  for (const key of result.keys) assert.equal(key.x, Math.round(key.x * 100) / 100, 'rounded to 2 decimals');
});

test('decorations, ghosts and keys smaller than a quarter key are left out and counted', () => {
  const result = fromRows([['A', { d: true }, 'decal', { g: true }, 'ghost', { g: false, w: 0.2 }, 'tiny', 'B']]);
  assert.deepEqual(codesOf(result), ['KeyA', 'KeyB']);
  assert.equal(result.report.leftOut, 3);
});

// ---- Picking codes --------------------------------------------------------------------------------------------------
test('unknown legends and second copies become placeholders, numbered in reading order', () => {
  const result = fromRows([
    ['Fn', 'Q', 'Vol+'],
    ['Q', 'F13'],
  ]);
  assert.deepEqual(codesOf(result), ['Unlinked1', 'KeyQ', 'Unlinked2', 'Unlinked3', 'Unlinked4']);
  assert.deepEqual(
    result.keys.map((key) => key.label),
    ['Fn', 'Q', 'Vol+', 'Q', 'F13'],
  );
  assert.deepEqual([result.report.linked, result.report.notLinked], [1, 4]);
  assert.deepEqual(result.report.unlit, ['Fn', 'Vol+', 'Q', 'F13']);
});

test('the best-ranked legend wins; on a tie, the first in reading order', () => {
  assert.deepEqual(codesOf(fromRows([['!\n1', '<\n,', '~\n`', 'Page\nUp']])), [
    'Digit1',
    'Comma',
    'Backquote',
    'PageUp',
  ]);
});

test('KLE icons name their keys', () => {
  const result = fromRows([["<i class='kb kb-Arrows-Up'></i>", '<i class="kb kb-Unicode-Escape-1"></i>']]);
  assert.deepEqual(codesOf(result), ['ArrowUp', 'Escape']);
});

test('Shift, Ctrl, Alt and Win get their side by place; explicit sides win', () => {
  assert.deepEqual(codesOf(fromRows([['Shift', 'A', 'B', 'Shift']])), ['ShiftLeft', 'KeyA', 'KeyB', 'ShiftRight']);
  assert.deepEqual(codesOf(fromRows([['Ctrl', 'A', 'B', 'C']])), ['ControlLeft', 'KeyA', 'KeyB', 'KeyC']);
  assert.deepEqual(codesOf(fromRows([['A', 'B', 'C', '⌘']])), ['KeyA', 'KeyB', 'KeyC', 'MetaRight']);
  assert.deepEqual(codesOf(fromRows([['RShift', 'A', 'Shift']])), ['ShiftRight', 'KeyA', 'ShiftLeft']);
  assert.deepEqual(codesOf(fromRows([['LShift', 'Shift', 'A']])), ['ShiftLeft', 'ShiftRight', 'KeyA']);
  assert.deepEqual(codesOf(fromRows([['LShift', 'Shift', 'RShift']])), ['ShiftLeft', 'Unlinked1', 'ShiftRight']);
  assert.deepEqual(codesOf(fromRows([['AltGr', 'A', 'Alt']])), ['AltRight', 'KeyA', 'AltLeft']);
});

test('a blank key at least 3 keys wide in the lowest row is the space bar, and only one', () => {
  assert.deepEqual(codesOf(fromRows([['A'], [{ w: 6.25 }, '', { w: 3 }, '']])), ['KeyA', 'Space', 'Unlinked1']);
  assert.deepEqual(codesOf(fromRows([[{ w: 6.25 }, ''], ['A']])), ['Unlinked1', 'KeyA'], 'not in the lowest row');
  assert.deepEqual(codesOf(fromRows([['A'], [{ w: 2 }, '']])), ['KeyA', 'Unlinked1'], 'too narrow');
});

test('with a Num Lock key, the keys below and right of it are number-pad keys', () => {
  // the numpad sample is KLE "Raw data" (no outer brackets, unquoted names): the test turns it into JSON
  const raw = fixture('numpad-raw-data.txt');
  const json = `[${raw.replace(/([{,])(\w+):/g, '$1"$2":')}]`;
  const result = layoutFromKle(json, 'numpad.json');
  assert.deepEqual(codesOf(result), [
    'NumLock',
    'NumpadDivide',
    'NumpadMultiply',
    'NumpadSubtract',
    'Numpad7',
    'Numpad8',
    'Numpad9',
    'NumpadAdd',
    'Numpad4',
    'Numpad5',
    'Numpad6',
    'Numpad1',
    'Numpad2',
    'Numpad3',
    'NumpadEnter',
    'Numpad0',
    'NumpadDecimal',
  ]);
  assert.equal(result.keys.find((key) => key.code === 'NumpadDecimal').label, 'Del');
});

test('without Num Lock, only the second key with a code becomes the number-pad one', () => {
  const result = fromRows([
    ['7', '8', 'Del', '↑'],
    [{ x: 5 }, '7\nHome', '8\nUp', '.\nDel'],
  ]);
  assert.deepEqual(codesOf(result), ['Digit7', 'Digit8', 'Delete', 'ArrowUp', 'Numpad7', 'Numpad8', 'NumpadDecimal']);
});

test('ISO keys are known by place: the key left of Enter is Backslash, the one after left Shift IntlBackslash', () => {
  const rows = [
    [{ x: 13.75, w: 1.25, h: 2, w2: 1.5, h2: 1, x2: -0.25 }, 'Enter'],
    [{ x: 12.75 }, '#\n~'],
    [{ w: 1.25 }, 'Shift', '<\n>', 'Z'],
  ];
  const codes = codesOf(fromRows(rows));
  assert.deepEqual(codes, ['Enter', 'Backslash', 'ShiftLeft', 'IntlBackslash', 'KeyZ']);
  // an ANSI Enter (wide, one key tall) leaves those keys to their legends
  assert.deepEqual(
    codesOf(
      fromRows([
        [{ w: 2.25 }, 'Enter'],
        [{ w: 2.25 }, 'Shift', '<\n>', 'Z'],
      ]),
    ),
    ['Enter', 'ShiftLeft', 'Comma', 'KeyZ'],
  );
});

test('every code the import gives is one the app can see, or a placeholder of at most 40 characters', () => {
  for (const file of ['ansi-60.kle.json', 'iso-tkl.kle.json', 'atreus-rotated.kle.json']) {
    for (const { code } of layoutFromKle(fixture(file)).keys) {
      assert.ok(isKnownKey(code) || /^Unlinked\d{1,3}$/.test(code), `${file}: ${code}`);
    }
  }
  for (const code of [...Object.values(NUMBER_PAD_CODES), ...Object.values(NUMBER_PAD_SYMBOLS)])
    assert.ok(isKnownKey(code), code);
  for (const code of Object.keys(NUMBER_PAD_CODES)) assert.ok(isKnownKey(code), code);
});

// ---- Labels ---------------------------------------------------------------------------------------------------------
test('labels are plain text: no HTML, entities turned into characters, at most 16 characters', () => {
  assert.deepEqual(cleanLegend('<b>Caps</b><br>Lock'), { text: 'Caps Lock', icon: null });
  assert.equal(cleanLegend('&lt;&amp;&gt; &quot;x&quot; &#65;&#x42; &bogus; &#0;').text, '<&> "x" AB');
  const result = fromRows([['<script>alert(1)</script>Q', 'A really long legend for a key']]);
  assert.deepEqual(
    result.keys.map((key) => key.label),
    ['alert(1) Q', 'A really long le'],
  );
  assert.equal(result.keys[0].code, 'Unlinked1', 'the joined text names no key');
  assert.equal(fromRows([['', { w: 6 }, '']]).keys[0].label, '');
});

// ---- Problems -------------------------------------------------------------------------------------------------------
test('a file that is not JSON, not KLE, empty or too big says so', () => {
  assert.deepEqual(layoutFromKle('{ not json'), { problem: 'brokenFile' });
  assert.deepEqual(layoutFromKle('{"format": "keystroke-overlay-layouts", "layouts": []}'), { problem: 'notKle' });
  assert.deepEqual(layoutFromKle('[["A", 5]]'), { problem: 'notKle' });
  assert.deepEqual(layoutFromKle('[{"name": "Empty"}]'), { problem: 'noKeys' });
  assert.deepEqual(fromRows([[{ d: true }, 'only a decal']]), { problem: 'noKeys' });
  const rows = Array.from({ length: MAX_LAYOUT_KEYS + 1 }, () => ['A']);
  assert.deepEqual(fromRows(rows), { problem: 'tooManyKeys', count: MAX_LAYOUT_KEYS + 1 });
  assert.equal(fromRows(rows.slice(1)).keys.length, MAX_LAYOUT_KEYS);
});

test('a huge file is refused before its keys are placed, without overflowing the stack', () => {
  const row = Array.from({ length: 300_000 }, () => 'A');
  const result = fromRows([row]);
  assert.equal(result.problem, 'tooManyKeys');
  assert.equal(result.count, 300_000);
});

test('a long hostile legend is read quickly', () => {
  const legend = '<i class '.repeat(20_000);
  const started = Date.now();
  fromRows([[legend]]);
  assert.ok(Date.now() - started < 1000);
});

test('keys far from the origin are moved no further than a layout may hold them', () => {
  const result = fromRows([['A'], [{ x: 500, y: 500 }, 'B']]);
  for (const key of result.keys) {
    assert.ok(key.x <= 100 && key.y <= 100);
  }
});
