// The eye button's timing (ui/settings/eye-button.css). Its toggles must never show outside the pill: opening by
// keyboard or click, they wait for the pill; closing with the focus still inside (.shut), they fade at once, as the
// pill closes at once there. These rules only work when specific enough to beat the opening rule, so this test checks
// the selectors and the delays. Run with: node --test tests/ui/eye-button-css.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../ui/settings/eye-button.css', import.meta.url), 'utf8');

/** The declarations of the rule whose selector list is exactly `selector`, or null. */
function ruleFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`(?:^|\\n|})\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? null;
}

test('opening with the focus inside, the toggles wait for the pill (and the rule can beat the opening rule)', () => {
  const rule = ruleFor('.eye-box:not(.shut):focus-within .eye-options');
  assert.ok(rule, 'a :not(.shut):focus-within rule exists: a plain :focus-within one loses to the opening rule');
  assert.match(rule, /transition-delay:\s*180ms,\s*0ms/);
  const opening = css.indexOf('.eye-box.open .eye-options {');
  assert.ok(
    css.indexOf('.eye-box:not(.shut):focus-within .eye-options {') > opening,
    'it comes after the opening rule',
  );
});

test('closing with the focus still inside, the toggles fade out at once', () => {
  const rule = ruleFor('.eye-box.shut:focus-within .eye-options');
  assert.ok(rule, 'a .shut:focus-within rule exists');
  assert.match(rule, /transition-delay:\s*0ms,\s*0ms/);
});
