// Only the app's settings window (and pages this computer serves itself) may act as the overlay's live preview
// (ui/overlay/preview-origin.js). Run with: node --test tests/ui/preview-origin.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSettingsWindow } from '../../ui/overlay/preview-origin.js';

test("the settings window on every system, and this computer's own pages, may", () => {
  for (const origin of ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']) {
    assert.ok(isSettingsWindow(origin), origin);
  }
  assert.ok(isSettingsWindow('http://127.0.0.1:7882'));
  assert.ok(isSettingsWindow('http://localhost:7880'));
});

test('a website that frames the overlay may not', () => {
  for (const origin of [
    'https://example.com',
    'http://127.0.0.1.example.com',
    'http://localhost.evil:80',
    'https://tauri.localhost.evil',
    'null',
    '',
  ]) {
    assert.ok(!isSettingsWindow(origin), origin);
  }
});
