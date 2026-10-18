// Unit tests for the Keys tab's Mac note (ui/settings/tabs/keys-mac.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { macFnHintText } from '../../ui/settings/tabs/keys-mac.js';

test('a Mac is told the F row needs Fn', () => {
  assert.match(macFnHintText('macos'), /hold Fn/);
});

test('other systems get no note', () => {
  assert.equal(macFnHintText('windows'), null);
  assert.equal(macFnHintText('linux'), null);
  assert.equal(macFnHintText(undefined), null);
});
