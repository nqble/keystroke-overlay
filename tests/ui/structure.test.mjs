// When the overlay rebuilds its keys (ui/overlay/structure.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { structureKey } from '../../ui/overlay/structure.js';

const style = { keySize: 48, gap: 6, fontSize: 18, scale: 1 };
const us = {
  id: 'tkl',
  keys: [
    { code: 'KeyQ', label: 'Q' },
    { code: 'KeyA', label: 'A' },
  ],
};
const french = {
  id: 'tkl',
  keys: [
    { code: 'KeyQ', label: 'A' },
    { code: 'KeyA', label: 'Q' },
  ],
};

test('the same layout, edits and sizes give the same key, so nothing is rebuilt', () => {
  const copy = structuredClone(us);
  assert.equal(structureKey(us, {}, style), structureKey(copy, {}, style));
});

test('switching to a French keyboard changes the letters, so the keys are rebuilt', () => {
  assert.notEqual(structureKey(us, {}, style), structureKey(french, {}, style));
});

test('a changed layout, edit or size rebuilds too', () => {
  const base = structureKey(us, {}, style);
  assert.notEqual(base, structureKey({ ...us, id: 'full' }, {}, style));
  assert.notEqual(base, structureKey(us, { disabledKeys: ['KeyQ'] }, style));
  assert.notEqual(base, structureKey(us, {}, { ...style, gap: 8 }));
});

test('a layout that is not there yet or has no keys does not break it', () => {
  assert.doesNotThrow(() => structureKey(undefined, {}, style));
  assert.doesNotThrow(() => structureKey({ id: 'x' }, {}, style));
});
