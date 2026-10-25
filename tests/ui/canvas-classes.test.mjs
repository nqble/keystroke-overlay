// The classes the key editor puts on its canvas (ui/settings/editor/) must not share a name with a rule elsewhere in the
// settings window. The Grid switch once used "dots", the name of the loading animation in popups.css, so showing the
// grid gave the canvas that rule's margin and font: the board jumped and the key font changed.
// Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const editorDir = new URL('../../ui/settings/editor/', import.meta.url);
const settingsDir = new URL('../../ui/settings/', import.meta.url);

/** Every class name the editor adds to or toggles on ctx.canvas. */
function canvasClasses() {
  const names = new Set();
  for (const file of readdirSync(editorDir).filter((name) => name.endsWith('.js'))) {
    const source = readFileSync(new URL(file, editorDir), 'utf8');
    for (const match of source.matchAll(/ctx\.canvas\.classList\.(?:add|toggle)\('([\w-]+)'/g)) names.add(match[1]);
  }
  return names;
}

/** The selectors in every settings style sheet that use `.name` without `.keymap-canvas` right before it. */
function strayRules(name) {
  const stray = [];
  const bare = new RegExp(`(?<!\\.keymap-canvas)\\.${name}(?![\\w-])`);
  for (const file of readdirSync(settingsDir).filter((entry) => entry.endsWith('.css'))) {
    const css = readFileSync(new URL(file, settingsDir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const selector of css.match(/[^{}]+(?=\{)/g) ?? [])
      if (bare.test(selector)) stray.push(`${file}: ${selector.trim()}`);
  }
  return stray;
}

test('the editor puts at least the grid and holding classes on the canvas', () => {
  const names = canvasClasses();
  assert.ok(names.has('holding'), [...names].join(', '));
  assert.ok(names.size >= 2, [...names].join(', '));
});

test('no style sheet styles a canvas class on its own, so no other rule can reach the canvas', () => {
  for (const name of canvasClasses()) assert.deepEqual(strayRules(name), [], name);
});
