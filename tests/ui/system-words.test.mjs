// Unit tests for the per-system words (ui/settings/system-words.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasMinimizeSetting, inspectorTool, inputMethods, systemWord } from '../../ui/settings/system-words.js';

test('each system names starting with the computer in its own way', () => {
  assert.equal(systemWord('startup', 'windows'), 'start-with-Windows');
  assert.equal(systemWord('startup', 'macos'), 'open-at-login');
  assert.equal(systemWord('startup', 'linux'), 'start-at-login');
});

test('an unknown system gets the Windows word', () => {
  assert.equal(systemWord('startup', undefined), 'start-with-Windows');
  assert.equal(systemWord('startup', 'plan9'), 'start-with-Windows');
});

test('a Mac is inspected with Safari, everything else with Edge', () => {
  assert.equal(inspectorTool('macos'), 'safari');
  assert.equal(inspectorTool('windows'), 'edge');
  assert.equal(inspectorTool(undefined), 'edge');
});

test('only Windows offers the Compatibility input method', () => {
  assert.deepEqual(inputMethods('windows'), ['hook', 'rawinput']);
  assert.deepEqual(inputMethods('macos'), ['hook']);
  assert.deepEqual(inputMethods('linux'), ['hook']);
  assert.deepEqual(inputMethods(undefined), ['hook', 'rawinput'], 'unknown: the original behavior');
});

test("the Startup switches use each system's own words", () => {
  assert.equal(systemWord('autostart', 'macos'), 'Open at login');
  assert.equal(systemWord('autostart', 'windows'), 'Start with Windows');
  assert.equal(systemWord('minimize', 'linux'), 'Minimize to tray');
  assert.match(systemWord('standardDetail', 'macos'), /event tap/);
  assert.match(systemWord('standardDetail', 'windows'), /WH_KEYBOARD_LL/);
});

test('the pause shortcut hint names the right modifiers', () => {
  assert.equal(systemWord('modifiers', 'macos'), '⌘, ⌥ or ⌃');
  assert.equal(systemWord('modifiers', 'windows'), 'Ctrl, Alt or Win');
});

test('the Keys tab hint uses Command-click and "delete" on a Mac', () => {
  assert.match(systemWord('dragHint', 'macos'), /⌘-click/);
  assert.match(systemWord('dragHint', 'windows'), /Ctrl-click/);
  assert.equal(systemWord('deleteKey', 'macos'), 'delete');
  assert.equal(systemWord('deleteKey', 'windows'), 'Del');
  assert.match(systemWord('deleteKeyTip', 'macos'), /delete key/);
});

test('the Keys tab view hints say what pans and zooms on each system', () => {
  assert.equal(systemWord('zoomChip', 'macos'), 'Pinch');
  assert.equal(systemWord('panChip', 'macos'), 'Scroll');
  assert.equal(systemWord('zoomChip', 'windows'), 'Scroll');
  assert.equal(systemWord('panChip', 'windows'), 'Space-drag');
  assert.match(systemWord('panTip', 'macos'), /two fingers/);
  assert.match(systemWord('panTip', 'windows'), /middle mouse button/);
});

test('there is no Minimize switch on a Mac, where every close path leaves the window the same way', () => {
  assert.equal(hasMinimizeSetting('macos'), false);
  assert.equal(hasMinimizeSetting('windows'), true);
  assert.equal(hasMinimizeSetting('linux'), true);
  assert.equal(hasMinimizeSetting(undefined), true);
});
