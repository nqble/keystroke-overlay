// Drawn devices (ui/overlay/devices.js, ui/overlay/devices/*.svg): every drawing is plain shapes with a body and parts
// named by input (docs/design/future-inputs.md §2), the mouse has all its buttons and wheel, and a block falls back to
// its own drawing. Run with: node --test tests/ui/devices.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { drawingPaths } from '../../ui/overlay/devices.js';
import { inputKind } from '../../ui/overlay/input-kinds.js';

const FOLDER = new URL('../../ui/overlay/devices/', import.meta.url);
const drawings = readdirSync(FOLDER).filter((name) => name.endsWith('.svg'));
const codesIn = (text) => [...text.matchAll(/data-code="([^"]*)"/g)].map((match) => match[1]);
/** Which input each drawing is for, by its file name: controller-xbox.svg is a controller. */
const kindOf = (name) => (name.startsWith('controller') ? 'controller' : 'mouse');

test('every drawing is plain shapes: an svg with a body and named parts, nothing that runs or loads', () => {
  assert.ok(drawings.includes('mouse.svg'));
  for (const name of drawings) {
    const text = readFileSync(new URL(name, FOLDER), 'utf8');
    assert.match(text.trim(), /^<svg [^>]*viewBox="[^"]+"/, name);
    assert.match(text, /class="device-body"/, name);
    assert.doesNotMatch(text, /<script|<foreignObject|<image|<use|href=|on[a-z]+=/i, name);
    const codes = codesIn(text);
    assert.equal(new Set(codes).size, codes.length, `${name}: each part once`);
    for (const code of codes) assert.equal(inputKind(code), kindOf(name), `${name}: ${code}`);
  }
});

test('the mouse has every button and both wheel directions', () => {
  const codes = codesIn(readFileSync(new URL('mouse.svg', FOLDER), 'utf8'));
  for (const code of ['MouseLeft', 'MouseRight', 'MouseMiddle', 'MouseBack', 'MouseForward', 'WheelUp', 'WheelDown']) {
    assert.ok(codes.includes(code), code);
  }
});

test('the controller has the standard gamepad buttons, and its sticks and triggers are marked to move', () => {
  const text = readFileSync(new URL('controller.svg', FOLDER), 'utf8');
  const codes = codesIn(text);
  const standard = [
    'A',
    'B',
    'X',
    'Y',
    'LB',
    'RB',
    'LT',
    'RT',
    'Back',
    'Start',
    'LS',
    'RS',
    'Up',
    'Down',
    'Left',
    'Right',
    'Home',
  ];
  for (const name of standard) assert.ok(codes.includes(`Pad${name}`), `Pad${name}`);
  for (const stick of ['PadStickL', 'PadStickR']) assert.match(text, new RegExp(`data-stick="${stick}"`));
  for (const trigger of ['PadLT', 'PadRT']) assert.match(text, new RegExp(`data-trigger="${trigger}"`));
});

test('a block asks for its own drawing and falls back on its device', () => {
  assert.deepEqual(drawingPaths({ code: 'Mouse', device: 'mouse' }), [
    '/overlay/devices/mouse.svg',
    '/overlay/devices/mouse.svg',
  ]);
  assert.deepEqual(drawingPaths({ code: 'Mouse', device: 'mouse-ergonomic' }), [
    '/overlay/devices/mouse-ergonomic.svg',
    '/overlay/devices/mouse.svg',
  ]);
  assert.equal(drawingPaths({ code: 'Controller' })[1], '/overlay/devices/controller.svg');
});
