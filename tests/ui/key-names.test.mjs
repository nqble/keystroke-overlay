// The keys the app can see (ui/settings/key-names.js) must be exactly the ones src-tauri/src/keyboard/keymap.rs names,
// read the same way tests/ui/layouts.test.mjs reads it, so the two can't drift apart. Also: every key has a friendly
// name and a group, and the legend table names each legend once. Run with: node --test tests/ui/key-names.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ICON_CODES,
  KEY_GROUPS,
  KNOWN_KEYS,
  LEGEND_ENTRIES,
  RANK,
  SIDED_KEYS,
  groupName,
  iconCode,
  isKnownKey,
  keyName,
  legendMatch,
} from '../../ui/settings/key-names.js';

const KEYMAP = new URL('../../src-tauri/src/keyboard/keymap.rs', import.meta.url);
/** Every key name the Windows table (keymap.rs) can produce: the quoted names after "=>", plus its early returns. */
const keymapCodes = new Set(
  [...readFileSync(KEYMAP, 'utf8').matchAll(/=> "(\w+)"|Some\("(\w+)"\)/g)].map((match) => match[1] ?? match[2]),
);
const SYSTEMS = ['windows', 'macos', 'linux'];
/** A code from a table: a key the app can see, or a modifier whose side is picked by place. */
const isTableCode = (code) => keymapCodes.has(code) || code in SIDED_KEYS;

test('the known keys are exactly the keys keymap.rs names', () => {
  assert.ok(keymapCodes.size > 100, 'keymap.rs was read');
  const known = KNOWN_KEYS.map((key) => key.code);
  assert.equal(new Set(known).size, known.length, 'no code twice');
  assert.deepEqual(new Set(known), keymapCodes);
  for (const code of keymapCodes) assert.ok(isKnownKey(code), code);
  assert.equal(isKnownKey('F13'), false);
  assert.equal(isKnownKey('Unlinked1'), false);
});

test('every known key has a friendly name on every system, and a group', () => {
  for (const key of KNOWN_KEYS) {
    assert.ok(KEY_GROUPS.includes(key.group), `${key.code}: group ${key.group}`);
    for (const system of SYSTEMS) assert.ok(keyName(key.code, system)?.trim(), `${key.code} on ${system}`);
  }
  for (const group of KEY_GROUPS) assert.ok(groupName(group).trim(), group);
  assert.equal(keyName('Unlinked1', 'windows'), null);
});

test('modifier names follow the system', () => {
  assert.equal(keyName('ControlLeft', 'windows'), 'Left Ctrl');
  assert.equal(keyName('MetaRight', 'windows'), 'Right Win');
  assert.equal(keyName('MetaLeft', 'macos'), 'Left ⌘ Command');
  assert.equal(keyName('AltRight', 'macos'), 'Right ⌥ Option');
  assert.equal(keyName('MetaLeft', 'linux'), 'Left Super');
  assert.equal(keyName('ShiftLeft', 'macos'), 'Left Shift');
  assert.equal(keyName('KeyW', 'macos'), 'W');
});

test('every code in the legend and icon tables is one keymap.rs names (or a modifier picked by side)', () => {
  for (const entry of LEGEND_ENTRIES) assert.ok(isTableCode(entry.code), `${entry.legend} → ${entry.code}`);
  for (const code of ICON_CODES) assert.ok(isTableCode(code), code);
  for (const sides of Object.values(SIDED_KEYS)) for (const code of sides) assert.ok(keymapCodes.has(code), code);
});

test('no legend is listed twice, and every legend is lower case and trimmed', () => {
  const legends = LEGEND_ENTRIES.map((entry) => entry.legend);
  const repeated = legends.filter((legend, index) => legends.indexOf(legend) !== index);
  assert.deepEqual(repeated, []);
  for (const legend of legends) assert.equal(legend, legend.toLowerCase().trim(), legend);
  for (const entry of LEGEND_ENTRIES) assert.ok(Object.values(RANK).includes(entry.rank), entry.legend);
});

test('the legend table names keys as the plan says', () => {
  assert.deepEqual(legendMatch('q'), { code: 'KeyQ', rank: RANK.OWN_NAME });
  assert.deepEqual(legendMatch('!'), { code: 'Digit1', rank: RANK.SHIFTED });
  assert.deepEqual(legendMatch(','), { code: 'Comma', rank: RANK.UNSHIFTED });
  assert.deepEqual(legendMatch('<'), { code: 'Comma', rank: RANK.SHIFTED });
  assert.deepEqual(legendMatch('\\'), { code: 'Backslash', rank: RANK.UNSHIFTED });
  assert.equal(legendMatch('shift').code, 'Shift');
  assert.equal(legendMatch('rshift').code, 'ShiftRight');
  assert.equal(legendMatch('left ctrl').code, 'ControlLeft');
  assert.equal(legendMatch('cmd').code, 'Meta');
  assert.equal(legendMatch('altgr').code, 'AltRight');
  assert.equal(legendMatch('pgdn').code, 'PageDown');
  assert.equal(legendMatch('num lock').code, 'NumLock');
  assert.equal(legendMatch('fn'), null, 'Fn is never a key the computer sees');
  assert.equal(legendMatch('f13'), null);
  assert.equal(legendMatch('vol+'), null);
});

test('KLE icon classes name their keys', () => {
  assert.equal(iconCode('kb-Arrows-Up'), 'ArrowUp');
  assert.equal(iconCode('kb-Unicode-BackSpace-DeleteLeft-Big'), 'Backspace');
  assert.equal(iconCode('kb-logo-windows-8'), 'Meta');
  assert.equal(iconCode('kb-Unknown-Thing'), null);
});
