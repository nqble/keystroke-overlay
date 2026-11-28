// How wide a key is before the user resizes it (ui/settings/profiles.js baseWidth): the layout file's width, or one
// key in Even grid; a drawn device keeps its own width in the grid, as the overlay draws it (overlay.js placedKey).
// Run with: node --test tests/ui/profiles-width.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseWidth } from '../../ui/settings/profiles.js';

test('a drawn device keeps its own base width in Even grid; a key is one wide', () => {
  assert.equal(baseWidth({ code: 'Mouse', device: 'mouse', w: 1.875 }, 'grid'), 1.875);
  assert.equal(baseWidth({ code: 'KeyW', w: 1.5 }, 'grid'), 1);
  assert.equal(baseWidth({ code: 'KeyW', w: 1.5 }, 'shape'), 1.5);
});
