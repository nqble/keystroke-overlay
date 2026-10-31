// A NohBoard keyboard file → a layout of ours (ui/settings/nohboard-layout.js). Every file here is written by hand in
// NohBoard's shape (none is copied from NohBoard, whose files are GPL): the geometry (pixels to keys, an ISO Enter),
// virtual keys and the keyboard language, sides of modifiers, mouse elements, placeholders and the problems.
// Run with: node --test tests/ui/nohboard-layout.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boxOf, isMouseCode, layoutFromNohBoard } from '../../ui/settings/nohboard-layout.js';

const KEY_PIXELS = 43; // most NohBoard keys are 43 pixels wide, 1 pixel apart: one key is 44 pixels
const PITCH = 44;
const rectangle = (left, top, width = KEY_PIXELS, height = KEY_PIXELS) => [
  { X: left, Y: top },
  { X: left + width, Y: top },
  { X: left + width, Y: top + height },
  { X: left, Y: top + height },
];
/** A keyboard key at column, row (in keys), `wide` keys wide, with its virtual keys and text. */
const key = (column, row, keyCodes, text, wide = 1) => ({
  __type: 'KeyboardKey',
  Boundaries: rectangle(10 + column * PITCH, 20 + row * PITCH, wide * PITCH - 1),
  KeyCodes: keyCodes,
  Text: text,
});
const file = (elements) => JSON.stringify({ Version: 2, Width: 400, Height: 200, Elements: elements });
const read = (elements, typingKeys) => layoutFromNohBoard(file(elements), 'my-board', typingKeys);
const ARROWS = [key(1, 0, [38], '↑'), key(0, 1, [37], '←'), key(1, 1, [40], '↓'), key(2, 1, [39], '→')];

test('an arrow cluster comes out as the built-in arrows layout: places, sizes and codes', () => {
  const builtIn = JSON.parse(readFileSync(new URL('../../ui/overlay/layouts/arrows.json', import.meta.url), 'utf8'));
  const result = read(ARROWS);
  assert.equal(result.name, 'my-board');
  const placeOf = (keys) =>
    keys.map(({ code, x, y, w, h }) => ({ code, x, y, w, h })).sort((a, b) => (a.code < b.code ? -1 : 1));
  assert.deepEqual(placeOf(result.keys), placeOf(builtIn.keys));
  assert.deepEqual(result.report, { keys: 4, linked: 4, notLinked: 0, unlit: [], leftOut: 0, mouse: 0 });
});

test('wide keys snap to quarter keys; a pixel off still comes out right', () => {
  const tab = { ...key(0, 0, [9], 'Tab'), Boundaries: rectangle(10, 20, 1.5 * PITCH - 2) };
  const row = [key(1.5, 0, [81], 'Q'), key(2.5, 0, [87], 'W'), key(3.5, 0, [69], 'E'), key(4.5, 0, [82], 'R')];
  const result = read([tab, ...row, key(0, 1, [32], '', 6.25)]);
  assert.equal(result.keys.find((k) => k.code === 'Tab').w, 1.5);
  assert.equal(result.keys.find((k) => k.code === 'Space').w, 6.25);
});

test('an ISO Enter polygon becomes the 1.25 × 2 rectangle of its lower part', () => {
  const left = 10;
  const top = 20;
  const iso = {
    __type: 'KeyboardKey',
    KeyCodes: [13],
    Text: 'Enter',
    Boundaries: [
      { X: left, Y: top },
      { X: left + 1.5 * PITCH - 1, Y: top },
      { X: left + 1.5 * PITCH - 1, Y: top + 2 * PITCH - 1 },
      { X: left + 0.25 * PITCH, Y: top + 2 * PITCH - 1 },
      { X: left + 0.25 * PITCH, Y: top + KEY_PIXELS },
      { X: left, Y: top + KEY_PIXELS },
    ],
  };
  const box = boxOf(iso);
  assert.equal(box.left, left + 0.25 * PITCH);
  assert.equal(box.bottom - box.top, 2 * PITCH - 1);
  const enter = read([...ARROWS, iso]).keys.find((k) => k.code === 'Enter');
  assert.deepEqual([enter.w, enter.h], [1.25, 2]);
});

test('the typing keys follow the keyboard language Windows reports; the rest use the fixed table', () => {
  const azerty = { 65: 'KeyQ', 81: 'KeyA', 90: 'KeyW', 87: 'KeyZ' };
  const result = read([key(0, 0, [65], 'A'), key(1, 0, [90], 'Z'), key(2, 0, [36], 'Home')], azerty);
  assert.deepEqual(
    result.keys.map((k) => k.code),
    ['KeyQ', 'KeyW', 'Home'],
  );
  assert.equal(result.keys[0].label, 'A', 'the label stays what the keyboard prints');
  assert.equal(read([key(0, 0, [65], 'A')]).keys[0].code, 'KeyA', 'without Windows: the US keyboard');
});

test('the number pad Enter (1025) and sides of Shift, Ctrl and Alt by place', () => {
  const keys = [
    key(0, 0, [16], 'Shift', 2),
    key(2, 0, [17], 'Ctrl'),
    key(10, 0, [16], 'Shift', 2),
    key(13, 0, [1025], 'Enter'),
  ];
  assert.deepEqual(
    read(keys).keys.map((k) => k.code),
    ['ShiftLeft', 'ControlLeft', 'ShiftRight', 'NumpadEnter'],
  );
});

test('a key with several codes takes the first that names a key; a repeated code becomes a placeholder', () => {
  const result = read([key(0, 0, [124, 160, 161], 'Shift'), key(1, 0, [160], 'Shift again'), key(2, 0, [255], 'Fn')]);
  assert.deepEqual(
    result.keys.map((k) => k.code),
    ['ShiftLeft', 'Unlinked1', 'Unlinked2'],
  );
  assert.deepEqual(result.report.unlit, ['Shift again', 'Fn']);
  assert.equal(result.report.notLinked, 2);
});

test('mouse buttons and wheel keep their names for mouse support; the speed indicator is left out', () => {
  const mouse = (type, keyCode, column) => ({
    __type: type,
    KeyCodes: [keyCode],
    Text: '',
    Boundaries: rectangle(10 + column * PITCH, 20),
  });
  const elements = [
    ...ARROWS,
    mouse('MouseKey', 0, 4),
    mouse('MouseKey', 4, 5),
    mouse('MouseScroll', 1, 6),
    { __type: 'MouseSpeedIndicator', Location: { X: 1, Y: 1 }, Radius: 20 },
  ];
  const result = read(elements);
  const codes = result.keys.map((k) => k.code);
  assert.ok(codes.includes('MouseLeft') && codes.includes('MouseForward') && codes.includes('WheelDown'));
  assert.ok(isMouseCode('MouseLeft') && !isMouseCode('KeyA'));
  assert.deepEqual(result.report, { keys: 7, linked: 4, notLinked: 0, unlit: [], leftOut: 1, mouse: 3 });
});

test('a byte-order mark and trailing commas are read', () => {
  const text = '﻿' + file(ARROWS).replace(']}', '],}');
  assert.equal(layoutFromNohBoard(text).keys.length, 4);
});

test('a file that cannot be used says why', () => {
  assert.deepEqual(layoutFromNohBoard('not json'), { problem: 'brokenFile' });
  assert.deepEqual(layoutFromNohBoard('[]'), { problem: 'notNohBoard' });
  assert.deepEqual(layoutFromNohBoard('{"Elements": []}'), { problem: 'notNohBoard' });
  assert.deepEqual(layoutFromNohBoard('{"id": "mine", "name": "Mine", "keys": []}'), { problem: 'ourFile' });
  assert.deepEqual(layoutFromNohBoard(file([])), { problem: 'noKeys' });
  assert.deepEqual(layoutFromNohBoard(file([{ __type: 'toString', Boundaries: rectangle(0, 0) }])), {
    problem: 'noKeys',
  });
  const many = Array.from({ length: 301 }, (_, index) => key(index % 20, Math.floor(index / 20), [65], 'A'));
  assert.deepEqual(layoutFromNohBoard(file(many)), { problem: 'tooManyKeys', count: 301 });
});

test('hostile values never throw and give clean keys', () => {
  const junk = [
    { __type: 'KeyboardKey', Boundaries: 'x', KeyCodes: [65] },
    { __type: 'KeyboardKey', Boundaries: [{ X: 'a', Y: 1 }, { X: 2 }, null], KeyCodes: [65] },
    {
      __type: 'KeyboardKey',
      Boundaries: rectangle(0, 0),
      KeyCodes: ['__proto__', 'constructor'],
      Text: 'x'.repeat(99),
    },
    { __type: 'MouseKey', Boundaries: rectangle(50, 0), KeyCodes: [99] },
  ];
  const result = layoutFromNohBoard(file(junk));
  assert.equal(result.keys.length, 2);
  assert.ok(result.keys.every((k) => k.code.startsWith('Unlinked') && k.label.length <= 16));
  assert.equal(result.report.leftOut, 2);
});
