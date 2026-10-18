// Unit tests for the per-system words (ui/settings/system-words.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectorTool, systemWord } from '../../ui/settings/system-words.js';

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
