// What a wheel, pinch or press over the key editor's board means (ui/settings/tabs/keys-gestures.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PINCH_MAX_DELTA,
  gestureFactor,
  isTypingTarget,
  startsPan,
  wheelAction,
} from '../../ui/settings/tabs/keys-gestures.js';

const wheel = (props) => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, ...props });

test('on a Mac a two-finger scroll pans in any direction (content follows the fingers)', () => {
  assert.deepEqual(wheelAction(wheel({ deltaX: 10, deltaY: -25 }), 'macos'), { type: 'pan', dx: -10, dy: 25 });
});

test('on a Mac a pinch zooms around the pointer, in and out', () => {
  const out = wheelAction(wheel({ ctrlKey: true, deltaY: 4 }), 'macos');
  const into = wheelAction(wheel({ ctrlKey: true, deltaY: -4 }), 'macos');
  assert.equal(out.type, 'zoom');
  assert.ok(out.factor < 1 && into.factor > 1);
});

test('on a Mac Command + scroll zooms, for a Mac with a mouse', () => {
  const action = wheelAction(wheel({ metaKey: true, deltaY: -100 }), 'macos');
  assert.equal(action.type, 'zoom');
  assert.ok(action.factor > 1);
});

test('on Windows and Linux the plain wheel still zooms, and does not pan', () => {
  for (const system of ['windows', 'linux', undefined]) {
    const zoomIn = wheelAction(wheel({ deltaY: -100 }), system);
    const zoomOut = wheelAction(wheel({ deltaY: 100 }), system);
    assert.equal(zoomIn.type, 'zoom', String(system));
    assert.ok(zoomIn.factor > 1 && zoomOut.factor < 1, String(system));
  }
});

test('a trackpad pinch zooms on every system', () => {
  for (const system of ['windows', 'macos', 'linux']) {
    assert.equal(wheelAction(wheel({ ctrlKey: true, deltaY: -3 }), system).type, 'zoom', system);
  }
});

test('Ctrl + a mouse wheel notch zooms like a plain wheel, not like a pinch', () => {
  const notch = wheelAction(wheel({ ctrlKey: true, deltaY: -(PINCH_MAX_DELTA + 70) }), 'windows');
  const plain = wheelAction(wheel({ deltaY: -(PINCH_MAX_DELTA + 70) }), 'windows');
  assert.deepEqual(notch, plain);
});

test('a wheel counted in lines is turned into pixels', () => {
  const pixels = wheelAction(wheel({ deltaY: 32 }), 'macos');
  const lines = wheelAction(wheel({ deltaY: 2, deltaMode: 1 }), 'macos');
  assert.deepEqual(lines, pixels);
});

test("Safari's pinch events zoom by how much the pinch grew since the last event", () => {
  assert.equal(gestureFactor(1.2, 1), 1.2);
  assert.equal(gestureFactor(1.5, 1.2), 1.25);
  assert.equal(gestureFactor(0.8, 1), 0.8);
  assert.equal(gestureFactor(0, 1), 1, 'a broken value changes nothing');
});

test('the middle button always pans, the main button only while Space is held', () => {
  assert.equal(startsPan({ button: 1 }, false), true);
  assert.equal(startsPan({ button: 0 }, true), true);
  assert.equal(startsPan({ button: 0 }, false), false, 'a plain click still selects');
  assert.equal(startsPan({ button: 2 }, true), false);
});

test('Space typed into a text box or dropdown is typing, not a pan', () => {
  assert.equal(isTypingTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTypingTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTypingTarget({ tagName: 'SELECT' }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: 'BUTTON' }), false);
  assert.equal(isTypingTarget(null), false);
});

test('a pan and a pinch are streams that must not slide; a single wheel notch may', () => {
  assert.equal(wheelAction(wheel({ deltaX: 3, deltaY: 4 }), 'macos').type, 'pan');
  assert.equal(wheelAction(wheel({ ctrlKey: true, deltaY: 3 }), 'macos').continuous, true);
  assert.equal(wheelAction(wheel({ deltaY: -100 }), 'windows').continuous, undefined);
  assert.equal(wheelAction(wheel({ metaKey: true, deltaY: -100 }), 'macos').continuous, undefined);
});
