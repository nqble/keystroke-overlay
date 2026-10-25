// In the key editor, blue (the accent color) on a key means one thing: the key is selected. A blue border once marked
// moved keys too, so after Close gaps every key looked selected. The toolbar's "N moved" count says what moved instead.
// Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const settingsDir = new URL('../../ui/settings/', import.meta.url);

/** Every rule in the settings style sheets as { file, selector, body }, comments left out. */
function rules() {
  const found = [];
  for (const file of readdirSync(settingsDir).filter((entry) => entry.endsWith('.css'))) {
    const css = readFileSync(new URL(file, settingsDir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
      found.push({ file, selector: match[1].trim(), body: match[2] });
  }
  return found;
}

test('only a selected key is drawn in the accent color', () => {
  for (const { file, selector, body } of rules()) {
    if (!/\.kmk\b/.test(selector) || !body.includes('--color-accent')) continue;
    for (const part of selector.split(',')) {
      if (/\.kmk\b/.test(part)) assert.match(part, /\.kmk\.sel\b/, `${file}: ${part.trim()}`);
    }
  }
});
