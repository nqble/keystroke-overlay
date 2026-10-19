// Unit tests for the theme cards' plain logic (ui/settings/themes.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themeKeyVars, themeMatches } from '../../ui/settings/themes.js';

const neon = { id: 'neon', style: { keyFill: '#000000ff', radius: 10 } };

test('a theme matches while every value it sets is unchanged', () => {
  assert.equal(themeMatches(neon, { keyFill: '#000000ff', radius: 10, fontSize: 18 }), true);
});

test('changing any value the theme sets means it no longer matches', () => {
  assert.equal(themeMatches(neon, { keyFill: '#000000ff', radius: 4 }), false);
  assert.equal(themeMatches(neon, null), false);
});

test('a sample key uses the theme colors, idle or pressed', () => {
  const style = {
    keyFill: 'a',
    keyFillPressed: 'b',
    borderColor: 'c',
    borderColorPressed: 'd',
    textColor: 'e',
    textColorPressed: 'f',
  };
  assert.equal(themeKeyVars(style, false)['--key-fill'], 'a');
  assert.equal(themeKeyVars(style, true)['--key-fill'], 'b');
  assert.equal(themeKeyVars(style, true)['--key-text'], 'f');
});

test('borders and corners are capped so a sample key stays readable at card size', () => {
  const vars = themeKeyVars({ borderWidth: 9, radius: 40 }, false);
  assert.equal(vars['--key-border-width'], '3px');
  assert.equal(vars['--key-radius'], '12px');
});
