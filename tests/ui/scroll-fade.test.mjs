// Unit tests for the scroll fade's size (ui/settings/scroll-fade.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';

// scroll-fade.js adds its listener when loaded, so give it a tiny stand-in document.
globalThis.document ??= { addEventListener() {}, querySelectorAll: () => [] };
const { fadeAmount, FADE_MAX, FADE_RAMP } = await import('../../ui/settings/scroll-fade.js');

test('no fade at an edge with nothing more to scroll to', () => {
  assert.equal(fadeAmount(0), 0);
  assert.equal(fadeAmount(-3), 0);
});

test('the fade grows in gently near the edge', () => {
  assert.equal(fadeAmount(FADE_RAMP / 2), FADE_MAX / 2);
});

test('the fade never grows past its full size', () => {
  assert.equal(fadeAmount(FADE_RAMP), FADE_MAX);
  assert.equal(fadeAmount(5000), FADE_MAX);
});
