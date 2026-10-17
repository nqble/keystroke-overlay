// Every built-in layout file (ui/overlay/layouts/*.json) must be usable: its id matches its file name, no key appears
// twice, no two keys overlap, and every key is one the app can actually see (a name from the key tables in
// src-tauri/src/keyboard/), so it can light up. Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const LAYOUTS = new URL('../../ui/overlay/layouts/', import.meta.url);
const KEYBOARD = new URL('../../src-tauri/src/keyboard/', import.meta.url);
const files = readdirSync(LAYOUTS).filter((name) => name.endsWith('.json'));
const layouts = files.map((file) => ({ file, layout: JSON.parse(readFileSync(new URL(file, LAYOUTS), 'utf8')) }));

/** Every key name the Windows table (keymap.rs) can produce: the quoted names after "=>", plus its two early returns. */
const knownKeys = new Set(
  [...readFileSync(new URL('keymap.rs', KEYBOARD), 'utf8').matchAll(/=> "(\w+)"|Some\("(\w+)"\)/g)].map(
    (match) => match[1] ?? match[2],
  ),
);

const overlap = (a, b) =>
  a.x < b.x + (b.w ?? 1) - 1e-9 &&
  b.x < a.x + (a.w ?? 1) - 1e-9 &&
  a.y < b.y + (b.h ?? 1) - 1e-9 &&
  b.y < a.y + (a.h ?? 1) - 1e-9;

test('there are the twelve built-in layouts', () => {
  assert.equal(files.length, 12);
});

for (const { file, layout } of layouts) {
  test(`${file}: id, name and keys`, () => {
    assert.equal(`${layout.id}.json`, file);
    assert.ok(layout.name?.trim());
    assert.ok(layout.keys.length > 0);
    for (const key of layout.keys) {
      assert.ok(Number.isFinite(key.x) && Number.isFinite(key.y) && key.x >= 0 && key.y >= 0, JSON.stringify(key));
      assert.equal(typeof key.label, 'string', key.code);
    }
  });
  test(`${file}: no key twice, none overlapping`, () => {
    const codes = layout.keys.map((key) => key.code);
    assert.equal(new Set(codes).size, codes.length);
    for (let i = 0; i < layout.keys.length; i++)
      for (let j = i + 1; j < layout.keys.length; j++)
        assert.ok(!overlap(layout.keys[i], layout.keys[j]), `${layout.keys[i].code} overlaps ${layout.keys[j].code}`);
  });
  test(`${file}: every key is one the app can see`, () => {
    for (const key of layout.keys) assert.ok(knownKeys.has(key.code), `${key.code} has no name in keymap.rs`);
  });
}
