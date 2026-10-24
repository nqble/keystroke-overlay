// Sizes that must not change with the window: the Style tab's color boxes and (below) the cards. A browser is needed to
// see a squeezed box, so these tests read the style sheet as text and check the rule that keeps the size.
// Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tabsCss = readFileSync(new URL('../../ui/settings/tabs.css', import.meta.url), 'utf8');

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(css, selector) {
  const start = css.indexOf(selector + ' {');
  assert.ok(start >= 0, `no rule for ${selector}`);
  return css.slice(start, css.indexOf('}', start));
}

test('a color box keeps its width when the row is narrow (flex: none), or it shrinks to 8 px at a 560 px window', () => {
  const colorBox = rule(tabsCss, "input[type='color']");
  assert.match(colorBox, /flex:\s*none/);
  assert.match(colorBox, /width:\s*40px/);
});
