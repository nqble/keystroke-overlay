// Every settings window theme (ui/settings/themes/*.json) must be complete and easy to read: six '#rrggbb' base
// colors, an id that matches its file name, and enough contrast (WCAG AA): 4.5 : 1 for text and dim text on the
// window and panels, and for the text on accent fills (app-themes.js picks white or black); 3 : 1 for the borders of
// controls. Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { contrastRatio, themeColors } from '../../ui/settings/theme-colors.js';

const THEMES = new URL('../../ui/settings/themes/', import.meta.url);
const BASE_NAMES = ['background', 'panel', 'text', 'dim', 'accent', 'error'];
const TEXT_CONTRAST = 4.5;
const CONTROL_LINE_CONTRAST = 3;

const files = readdirSync(THEMES).filter((name) => name.endsWith('.json'));
const themes = files.map((file) => ({ file, theme: JSON.parse(readFileSync(new URL(file, THEMES), 'utf8')) }));

test('there is a default theme, and every theme file is complete', () => {
  assert.ok(files.includes('default.json'));
  for (const { file, theme } of themes) {
    assert.equal(`${theme.id}.json`, file, `${file}: its id must match its file name`);
    assert.equal(typeof theme.name, 'string', `${file}: name`);
    assert.equal(typeof theme.order, 'number', `${file}: order`);
    for (const name of BASE_NAMES) assert.match(theme.colors[name] ?? '', /^#[0-9a-f]{6}$/, `${file}: ${name}`);
  }
});

test('every theme has its own place in the gallery', () => {
  const orders = themes.map(({ theme }) => theme.order);
  assert.equal(new Set(orders).size, orders.length);
});

test('every theme is easy to read', () => {
  const problems = [];
  const need = (file, what, one, other, minimum) => {
    const ratio = contrastRatio(one, other);
    if (ratio < minimum) problems.push(`${file}: ${what} ${ratio.toFixed(2)} : 1 (needs ${minimum})`);
  };
  for (const { file, theme } of themes) {
    const { background, panel, text, dim } = theme.colors;
    const colors = themeColors(theme.colors);
    for (const [surface, color] of [
      ['window', background],
      ['panel', panel],
    ]) {
      need(file, `text on ${surface}`, text, color, TEXT_CONTRAST);
      need(file, `dim text on ${surface}`, dim, color, TEXT_CONTRAST);
    }
    const onFill = contrastRatio('#ffffff', colors['--color-accent-strong']) >= TEXT_CONTRAST ? '#ffffff' : '#000000';
    need(file, 'text on accent fills', onFill, colors['--color-accent-strong'], TEXT_CONTRAST);
    need(file, 'control borders on panel', colors['--color-control-line'], panel, CONTROL_LINE_CONTRAST);
  }
  assert.deepEqual(problems, []);
});
