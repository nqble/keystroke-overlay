// Unit tests for the per-system font lists (ui/settings/system-fonts.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_FONT, systemFonts } from '../../ui/settings/system-fonts.js';

test('Windows keeps the Windows fonts, with the default first', () => {
  const { group, fonts } = systemFonts('windows');
  assert.equal(group, 'Windows fonts');
  assert.equal(fonts[0].value, DEFAULT_FONT);
  assert.equal(fonts[0].label, 'Segoe UI');
  assert.equal(fonts.length, 23);
});

test('a Mac gets Mac fonts, and its default shows as the system font', () => {
  const { group, fonts } = systemFonts('macos');
  assert.equal(group, 'Mac fonts');
  assert.deepEqual(fonts[0], { value: 'Segoe UI', label: 'System font (default)' });
  assert.ok(fonts.some((font) => font.value === 'Helvetica Neue'));
  assert.ok(fonts.some((font) => font.value === 'Menlo'));
  assert.ok(!fonts.slice(1).some((font) => font.value.startsWith('Segoe')), 'no Windows-only fonts');
});

test('no font appears twice in a list, and the saved default is always offered', () => {
  for (const platform of ['windows', 'macos', 'linux', undefined]) {
    const values = systemFonts(platform).fonts.map((font) => font.value);
    assert.equal(new Set(values).size, values.length, String(platform));
    assert.ok(values.includes(DEFAULT_FONT), String(platform));
  }
});

test('the default matches what the app saves and the overlay falls back from', () => {
  assert.equal(DEFAULT_FONT, 'Segoe UI');
});

test('the overlay falls back to the system font, so a Mac without Segoe UI still looks right', () => {
  const overlay = readFileSync('ui/overlay/overlay.js', 'utf8');
  const stack = overlay.match(/const FONT_FALLBACKS = '([^']+)'/)[1];
  assert.match(stack, /"Segoe UI", system-ui, -apple-system, sans-serif$/);
  assert.ok(overlay.includes('${FONT_FALLBACKS}'), 'the stack is used for the keys');
});
