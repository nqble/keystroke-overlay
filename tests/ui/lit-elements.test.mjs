// The overlay's register of what lights for each key code (ui/overlay/lit-elements.js): a key of the layout and a
// drawn mouse's extra button that follows the same key both light, and so do two extra buttons given one key.
// Run with: node --test tests/ui/lit-elements.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLitElements } from '../../ui/overlay/lit-elements.js';

/** A stand-in for an element: just its class list. */
function fakeElement() {
  const classes = new Set();
  return {
    classes,
    classList: {
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
      remove: (name) => classes.delete(name),
    },
  };
}

test('a key of the layout and an extra button with the same key both light', () => {
  const lit = createLitElements();
  const keyE = fakeElement();
  const sideButton = fakeElement();
  lit.add('KeyE', keyE);
  lit.add('KeyE', sideButton);
  lit.light('KeyE', true);
  assert.ok(keyE.classes.has('down'));
  assert.ok(sideButton.classes.has('down'));
  lit.light('KeyE', false);
  assert.ok(!sideButton.classes.has('down'));
});

test('two extra buttons given one key both light, and darkenAll turns everything off', () => {
  const lit = createLitElements();
  const side4 = fakeElement();
  const side5 = fakeElement();
  lit.add('F13', side4);
  lit.add('F13', side5);
  lit.light('F13', true);
  assert.ok(side4.classes.has('down') && side5.classes.has('down'));
  lit.darkenAll();
  assert.ok(!side4.classes.has('down') && !side5.classes.has('down'));
  lit.light('KeyQ', true); // a code with nothing to light is ignored
});
