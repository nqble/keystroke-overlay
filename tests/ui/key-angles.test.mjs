// Turning keys in the Keys tab (ui/settings/profiles.js: keyAngle, setKeyAngle; docs/proposals/key-rotation.md).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setLayouts, setSettings, settings } from '../../ui/settings/state.js';
import {
  editedCodes,
  forgetKeyEdits,
  keyAngle,
  setKeyAngle,
  setLayoutStyle,
  viewProf,
} from '../../ui/settings/profiles.js';

const W = { code: 'KeyW', x: 1, y: 0 };
const A = { code: 'KeyA', x: 0, y: 1, r: 10 }; // the layout file turns this one

beforeEach(() => {
  setLayouts([{ id: 'mine', name: 'Mine', keys: [W, A] }]);
  setSettings({ layout: { id: 'mine', profiles: {} } });
});

test('a turned key is saved, limited, rounded and counted as edited', () => {
  setKeyAngle(W, 15);
  assert.equal(keyAngle(W, viewProf()), 15);
  setKeyAngle(W, 400);
  assert.equal(keyAngle(W, viewProf()), 180);
  setKeyAngle(W, -37.26);
  assert.equal(keyAngle(W, viewProf()), -37.3);
  assert.ok(editedCodes(viewProf()).has('KeyW'));
});

test("back to the layout's own angle, nothing is saved", () => {
  setKeyAngle(W, 15);
  setKeyAngle(W, 0);
  assert.deepEqual(settings.layout.profiles, {}, 'the profile is gone');
  assert.equal(keyAngle(A, viewProf()), 10, "the layout file's angle");
  setKeyAngle(A, 0);
  assert.equal(viewProf().rotations.KeyA, 0, 'straightening a key the layout turns is kept');
});

test('Put back forgets the angle too', () => {
  setKeyAngle(W, 30);
  forgetKeyEdits(['KeyW']);
  assert.equal(keyAngle(W, viewProf()), 0);
  assert.equal(editedCodes(viewProf()).size, 0);
});

test('nothing turns in the even grid, and turning there does nothing', () => {
  setKeyAngle(W, 30);
  setLayoutStyle('grid');
  assert.equal(keyAngle(W, viewProf()), 0);
  assert.equal(keyAngle(A, viewProf()), 0);
  setKeyAngle(W, 45);
  setLayoutStyle('shape');
  assert.equal(keyAngle(W, viewProf()), 30, 'the shape style keeps its own angle');
});
