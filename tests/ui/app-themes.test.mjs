// Every settings window theme (ui/settings/themes/*.json) must be complete and easy to read: six '#rrggbb' base
// colors, an id that matches its file name, and enough contrast (readabilityProblems in theme-colors.js: WCAG AA).
// Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { readabilityProblems } from '../../ui/settings/theme-colors.js';

const THEMES = new URL('../../ui/settings/themes/', import.meta.url);
const BASE_NAMES = ['background', 'panel', 'text', 'dim', 'accent', 'error'];

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
  for (const { file, theme } of themes) {
    for (const problem of readabilityProblems(theme.colors)) {
      problems.push(`${file}: ${problem.what} ${problem.ratio.toFixed(2)} : 1 (needs ${problem.needs})`);
    }
  }
  assert.deepEqual(problems, []);
});
