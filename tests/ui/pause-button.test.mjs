// Unit tests for the pause button's wording (ui/settings/pause-button.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pauseButtonLook } from '../../ui/settings/pause-button.js';

test('running: offers to pause', () => {
  assert.deepEqual(pauseButtonLook(false), { word: 'Pause', icon: 'pause', name: 'Pause overlay' });
});

test('paused: offers to resume', () => {
  assert.deepEqual(pauseButtonLook(true), { word: 'Resume', icon: 'play', name: 'Resume overlay' });
});
