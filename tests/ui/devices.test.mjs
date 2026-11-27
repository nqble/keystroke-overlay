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

// ---- Geometry: every part sits inside the body with a gap, so no border runs into the outline (mouse-shape.md)
/**
 * The smallest gap, in drawing units, between a part and the body's outline. With both outlines' line widths, the old
 * drawing's 2.5 read as touching on screen; 4 leaves a visible gap.
 */
const MIN_GAP = 4;
/** Points along a path made of M, L, H, V, C and Z (absolute, as the drawings are written). */
function pathPoints(d) {
  const tokens = d.match(/[MLHVCZ]|-?\d*\.?\d+/g);
  const points = [];
  let at = [0, 0];
  let command = '';
  const take = () => Number(tokens.shift());
  while (tokens.length) {
    if (/[MLHVCZ]/.test(tokens[0])) command = tokens.shift();
    if (command === 'Z') continue;
    if (command === 'M' || command === 'L') at = [take(), take()];
    else if (command === 'H') at = [take(), at[1]];
    else if (command === 'V') at = [at[0], take()];
    else if (command === 'C') {
      const [c1, c2, end] = [
        [take(), take()],
        [take(), take()],
        [take(), take()],
      ];
      for (let step = 1; step <= 12; step++) {
        const t = step / 12;
        const u = 1 - t;
        const point = (i) => u * u * u * at[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t * t * t * end[i];
        points.push([point(0), point(1)]);
      }
      at = end;
      continue;
    }
    points.push(at);
  }
  return points;
}
/** A rounded rectangle's outline points, its corners as arcs (an rx wider than half the box is capped, as SVG does). */
function rectPoints(attributes) {
  const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((name) => Number(attributes[name] ?? 0));
  const r = Math.min(Number(attributes.rx ?? 0), w / 2, h / 2);
  const corners = [
    [x + w - r, y + r, -Math.PI / 2],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, Math.PI / 2],
    [x + r, y + r, Math.PI],
  ];
  const points = [];
  for (const [cx, cy, start] of corners) {
    for (let step = 0; step <= 8; step++) {
      const angle = start + (step / 8) * (Math.PI / 2);
      points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
  }
  return points;
}
const attributesOf = (tag) => Object.fromEntries([...tag.matchAll(/([a-z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
function inside([px, py], polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
function distanceToEdge([px, py], polygon) {
  let nearest = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[j];
    const [bx, by] = polygon[i];
    const length = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / length));
    nearest = Math.min(nearest, Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))));
  }
  return nearest;
}

test('every mouse part sits inside the body, at least MIN_GAP from its outline', () => {
  for (const name of drawings.filter((file) => kindOf(file) === 'mouse')) {
    const text = readFileSync(new URL(name, FOLDER), 'utf8');
    const bodyTag = text.match(/<(path|rect) class="device-body"[^>]*>/)[0];
    const body = bodyTag.startsWith('<rect') ? rectPoints(attributesOf(bodyTag)) : pathPoints(attributesOf(bodyTag).d);
    for (const tag of text.match(/<(path|rect) data-(code|slot)="[^"]*"[^>]*>/g)) {
      const attributes = attributesOf(tag);
      const points = tag.startsWith('<rect') ? rectPoints(attributes) : pathPoints(attributes.d);
      const part = attributes['data-code'] ?? attributes['data-slot'];
      for (const point of points) {
        assert.ok(inside(point, body), `${name}: ${part} reaches outside the body at ${point}`);
        const gap = distanceToEdge(point, body);
        assert.ok(
          gap >= MIN_GAP,
          `${name}: ${part} is ${gap.toFixed(1)} from the outline at ${point.map((v) => v.toFixed(1))}`,
        );
      }
    }
  }
});
