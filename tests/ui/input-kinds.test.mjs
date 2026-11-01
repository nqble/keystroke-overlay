// Which input a key belongs to, and the hidden inputs a profile saves (ui/overlay/input-kinds.js); the same rule as
// src-tauri/src/input_kinds.rs. Run with: node --test tests/ui/input-kinds.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_KINDS, hiddenInputsOf, inputKind } from '../../ui/overlay/input-kinds.js';
import { structureKey } from '../../ui/overlay/structure.js';

test('keys belong to the keyboard, mouse names to the mouse, Pad names to the controller', () => {
  for (const code of ['KeyA', 'Space', 'NumpadEnter', 'Unlinked3', 'MetaLeft'])
    assert.equal(inputKind(code), 'keyboard', code);
  for (const code of ['MouseLeft', 'MouseForward', 'WheelUp', 'Mouse']) assert.equal(inputKind(code), 'mouse', code);
  for (const code of ['PadA', 'PadStickL', 'PadLT', 'Controller']) assert.equal(inputKind(code), 'controller', code);
});

test('a profile hides only real input names', () => {
  assert.deepEqual([...hiddenInputsOf({ hiddenInputs: ['keyboard', 'toaster', 5, 'mouse'] })], ['keyboard', 'mouse']);
  assert.equal(hiddenInputsOf({}).size, 0);
  assert.equal(hiddenInputsOf(undefined).size, 0);
  assert.equal(hiddenInputsOf({ hiddenInputs: 'keyboard' }).size, 0);
  assert.deepEqual(INPUT_KINDS, ['keyboard', 'mouse', 'controller']);
});

test('hiding an input changes what the overlay rebuilds on', () => {
  const style = { keySize: 54, gap: 6, fontSize: 15, scale: 1, glowSize: 0 };
  const layout = { id: 'tkl', keys: [] };
  const before = structureKey(layout, { hiddenInputs: [] }, style);
  const after = structureKey(layout, { hiddenInputs: [...hiddenInputsOf({ hiddenInputs: ['keyboard'] })] }, style);
  assert.notEqual(before, after);
});
