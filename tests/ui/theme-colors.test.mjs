// The theme color formulas (ui/settings/theme-colors.js) must give back today's look for the default theme: every
// color they work out from the default base colors equals the value written in settings.css (:root). Run with:
// npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASE_TOKENS, themeColors } from '../../ui/settings/theme-colors.js';

const css = readFileSync(new URL('../../ui/settings/settings.css', import.meta.url), 'utf8');
const rootBlock = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));

/** A token's value in settings.css, expanded to '#rrggbb'. */
function cssValue(token) {
  const match = rootBlock.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{3,6})\\s*;`));
  assert.ok(match, `${token} is not a plain color in settings.css`);
  const hex = match[1].toLowerCase();
  return hex.length === 4 ? '#' + [...hex.slice(1)].map((digit) => digit + digit).join('') : hex;
}

const defaultBase = Object.fromEntries(Object.entries(BASE_TOKENS).map(([name, token]) => [name, cssValue(token)]));

test('the default theme gives back every color in settings.css exactly', () => {
  const colors = themeColors(defaultBase);
  for (const [token, value] of Object.entries(colors)) assert.equal(value, cssValue(token), token);
});

test('a light theme gets lines darker than its panels (they move toward its dark text)', () => {
  const light = {
    background: '#f4f5f8',
    panel: '#ffffff',
    text: '#1d2230',
    dim: '#5c6478',
    accent: '#2f6fe0',
    error: '#c8303f',
  };
  const colors = themeColors(light);
  const brightness = (hex) =>
    parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
  assert.ok(brightness(colors['--color-line']) < brightness(colors['--color-panel']));
  for (const value of Object.values(colors)) assert.match(value, /^#[0-9a-f]{6}$/);
});
