// The KLE reader (ui/settings/kle.js): kle-serial's own test layouts, KLE's rule for turned clusters (the Atreus
// fixture), and files that are not KLE layouts. The fixtures and their sources are in tests/ui/fixtures/kle/.
// Run with: node --test tests/ui/kle.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KleFormatError, LEGEND_PLACES, readKle } from '../../ui/settings/kle.js';

const FIXTURES = new URL('fixtures/kle/', import.meta.url);
const fixture = (name) => JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));
const snippets = fixture('kle-serial-snippets.json').cases;
const snippet = (name) => {
  const found = snippets.find((item) => item.name === name);
  assert.ok(found, `the snippet "${name}" is in kle-serial-snippets.json`);
  return found.layout;
};
/** Close enough for sums of KLE's decimal offsets (0.1 + 0.2 is not 0.3 in floating point). */
const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}`);

// ---- kle-serial's own cases, one test each ----------------------------------------------------------------------------
const CHECKS = {
  'x offset applies before the first key': ({ keys }) => {
    assert.deepEqual(
      keys.map((key) => key.x),
      [1, 2],
    );
  },
  'y offset then next row': ({ keys }) => {
    assert.deepEqual(
      keys.map((key) => key.y),
      [1, 2],
    );
  },
  'width resets to 1 after one key': ({ keys }) => {
    assert.deepEqual(
      keys.map((key) => key.w),
      [5, 1],
    );
  },
  'height resets to 1 after one key': ({ keys }) => {
    assert.deepEqual(
      keys.map((key) => key.h),
      [5, 1],
    );
  },
  'second rectangle defaults to the first': ({ keys }) => {
    assert.deepEqual([keys[0].w2, keys[0].h2], [2, 2]);
    assert.deepEqual([keys[1].w2, keys[1].h2], [4, 4]);
  },
  'decal, stepped and homing reset after one key': ({ keys }) => {
    assert.deepEqual([keys[0].decal, keys[0].stepped, keys[0].nub], [true, true, true]);
    assert.deepEqual([keys[1].decal, keys[1].stepped, keys[1].nub], [false, false, false]);
  },
  'ghost stays on until turned off': ({ keys }) => {
    assert.deepEqual(
      keys.map((key) => key.ghost),
      [false, true, true],
    );
  },
  'rotation only on the first item of a row (allowed)': ({ keys }) => {
    assert.deepEqual(
      keys.map((key) => key.r),
      [45, 45],
    );
  },
  'legend positions, alignment 4 (the default)': ({ keys }) => {
    assert.deepEqual(keys[0].labels, ['0', '8', '2', '6', '9', '7', '1', '10', '3', '', '4', '']);
  },
  'legend positions, alignment 7 (centered everything)': ({ keys }) => {
    assert.deepEqual(keys[0].labels, ['', '', '', '', '0', '', '', '', '', '', '4', '']);
  },
  'metadata first': ({ name, keys }) => {
    assert.equal(name, 'Sample');
    assert.equal(keys.length, 6);
  },
};
const REFUSED = ['rotation later in a row (refused)', 'metadata not first (refused)'];

test('every kle-serial case has a check here', () => {
  const covered = new Set([...Object.keys(CHECKS), ...REFUSED]);
  for (const item of snippets) assert.ok(covered.has(item.name), item.name);
});

for (const [name, check] of Object.entries(CHECKS)) {
  test(`kle-serial: ${name}`, () => check(readKle(snippet(name))));
}
for (const name of REFUSED) {
  test(`kle-serial: ${name}`, () => assert.throws(() => readKle(snippet(name)), KleFormatError));
}

// ---- every alignment, and the legends' shape --------------------------------------------------------------------------
test('every alignment gives 12 places, each line in at most one', () => {
  const twelveLines = Array.from({ length: LEGEND_PLACES }, (_, index) => String(index)).join('\n');
  for (let alignment = 0; alignment <= 7; alignment++) {
    const [key] = readKle([[{ a: alignment }, twelveLines]]).keys;
    assert.equal(key.labels.length, LEGEND_PLACES);
    const used = key.labels.filter(Boolean);
    assert.equal(new Set(used).size, used.length, `alignment ${alignment}`);
  }
  assert.deepEqual(readKle([[{ a: 0 }, twelveLines]]).keys[0].labels, [
    '0',
    '8',
    '2',
    '6',
    '9',
    '7',
    '1',
    '10',
    '3',
    '4',
    '11',
    '5',
  ]);
});

test('a key text with more than 12 lines keeps the first 12', () => {
  const [key] = readKle([[{ a: 0 }, Array(20).fill('x').join('\n')]]).keys;
  assert.equal(key.labels.filter(Boolean).length, LEGEND_PLACES);
});

test('the alignment lasts until it is changed, across rows', () => {
  const { keys } = readKle([[{ a: 7 }, 'A'], ['B']]);
  assert.equal(keys[1].labels[4], 'B');
});

// ---- turned clusters: KLE's rule, with the Atreus fixture -------------------------------------------------------------
test('a turned cluster counts its rows from its own turning point (rx, ry), as KLE does', () => {
  const { keys } = readKle(fixture('atreus-rotated.kle.json'));
  assert.equal(keys.length, 42);
  const byLegend = new Map(keys.map((key) => [key.labels[0], key]));
  // the left half: turned 10 degrees around (1, 0); its first row starts at x = rx = 1, not at 0
  const places = { E: [3, -0.1], W: [2, 0.25], R: [4, 0.25], Q: [1, 0.5], T: [5, 0.6] };
  for (const [legend, [x, y]] of Object.entries(places)) {
    near(byLegend.get(legend).x, x, `${legend} x`);
    near(byLegend.get(legend).y, y, `${legend} y`);
    assert.deepEqual([byLegend.get(legend).r, byLegend.get(legend).rx, byLegend.get(legend).ry], [10, 1, 0]);
  }
  // the right half: turned -10 degrees around (7, 0.965); its rows count from y = 0.965, not from the rows above
  const right = { I: [9, 0.765], U: [8, 1.115], O: [10, 1.115], P: [11, 1.365], Y: [7, 1.465] };
  for (const [legend, [x, y]] of Object.entries(right)) {
    near(byLegend.get(legend).x, x, `${legend} x`);
    near(byLegend.get(legend).y, y, `${legend} y`);
    assert.deepEqual([byLegend.get(legend).r, byLegend.get(legend).rx, byLegend.get(legend).ry], [-10, 7, 0.965]);
  }
});

test('after a row the cursor goes back to the cluster turning point, not to 0', () => {
  const { keys } = readKle([[{ r: 15, rx: 2, ry: 3 }, 'A'], ['B']]);
  assert.deepEqual([keys[0].x, keys[0].y], [2, 3]);
  assert.deepEqual([keys[1].x, keys[1].y], [2, 4]);
});

// ---- files that are not KLE layouts -----------------------------------------------------------------------------------
test('anything that is not a list of rows is refused with a clear error', () => {
  const notKle = [
    {},
    { layouts: [] },
    'text',
    42,
    null,
    ['a row as text'],
    [7],
    [null],
    [[], { name: 'metadata too late' }],
    [['A', 5]],
    [['A', null]],
    [['A', ['nested']]],
  ];
  for (const rows of notKle) assert.throws(() => readKle(rows), KleFormatError, JSON.stringify(rows));
});

test('numbers must be numbers: text, NaN and infinities are refused', () => {
  const bad = [{ x: '1' }, { w: NaN }, { y: Infinity }, { r: '45' }, { a: 9 }, { a: 1.5 }, { a: -1 }, { h2: {} }];
  for (const item of bad) assert.throws(() => readKle([[item, 'A']]), KleFormatError, JSON.stringify(item));
});

test('an empty file and a file with only metadata have no keys', () => {
  assert.deepEqual(readKle([]), { name: '', keys: [] });
  assert.deepEqual(readKle([{ name: 'Only a name' }]), { name: 'Only a name', keys: [] });
  assert.deepEqual(readKle([{ name: 12 }, ['A']]).name, '');
});

test('a 10 000-row file is read quickly, without a crash', () => {
  const rows = Array.from({ length: 10_000 }, () => ['A']);
  const started = Date.now();
  const { keys } = readKle(rows);
  assert.equal(keys.length, 10_000);
  assert.equal(keys.at(-1).y, 9_999);
  assert.ok(Date.now() - started < 2_000, 'in under 2 seconds');
});
