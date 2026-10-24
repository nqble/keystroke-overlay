// Sizes that must not change with the window: the Style tab's color boxes and (below) the cards. A browser is needed to
// see a squeezed box, so these tests read the style sheet as text and check the rule that keeps the size.
// Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tabsCss = readFileSync(new URL('../../ui/settings/tabs.css', import.meta.url), 'utf8');
const blocksCss = readFileSync(new URL('../../ui/settings/blocks.css', import.meta.url), 'utf8');
const settingsCss = readFileSync(new URL('../../ui/settings/settings.css', import.meta.url), 'utf8');

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

test('every gallery card has the one fixed height, even the \"+ New\" cards', () => {
  assert.match(settingsCss, /--gallery-card-height:\s*\d+px/);
  assert.match(rule(blocksCss, '.gallery-card'), /height:\s*var\(--gallery-card-height\)/);
  assert.doesNotMatch(rule(blocksCss, '.gallery-card.add'), /min-height/);
});

test('a long card name is cut with an ellipsis instead of growing the card', () => {
  const cut = rule(blocksCss, '.gallery-title');
  assert.match(cut, /text-overflow:\s*ellipsis/);
  assert.match(cut, /white-space:\s*nowrap/);
});
