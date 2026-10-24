// Unit test for the order of the Animation and Style cards (ui/overlay/registry.js, byId). The animation and theme
// files load in parallel, so they register in a different order each run; the cards must not follow that.
// Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byId } from '../../ui/overlay/registry.js';

test('cards are listed by id (the file name), whatever order the files registered in', () => {
  const registered = new Map();
  for (const [id, name] of [
    ['pressdown', 'Press down'],
    ['none', 'None'],
    ['scale', 'Scale up'],
    ['bounce', 'Bounce'],
    ['glow', 'Glow'],
    ['fade', 'Fade'],
  ]) {
    registered.set(id, { id, name });
  }
  const names = byId(registered).map((item) => item.name);
  assert.deepEqual(names, ['Bounce', 'Fade', 'Glow', 'None', 'Press down', 'Scale up']);
});
