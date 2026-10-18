// Unit tests for the keyboard access notice (ui/settings/access-notice.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessNotice } from '../../ui/settings/access-notice.js';

const allowed = { applies: true, allowed: true, secureInput: false };

test('nothing to show before the app has answered', () => {
  assert.equal(accessNotice({ access: null, inputError: null }), null);
});

test('capture failed and access is off: ask for access first', () => {
  const notice = accessNotice({ access: { applies: true, allowed: false, secureInput: true }, inputError: 'failed' });
  assert.equal(notice.kind, 'ask');
  assert.equal(notice.action, 'allow');
});

test('access given but capture not running: restart', () => {
  const notice = accessNotice({ access: allowed, inputError: 'macOS has not let the app read the keyboard' });
  assert.equal(notice.kind, 'restart');
  assert.equal(notice.action, 'restart');
});

test('Secure Input is a hint without a button', () => {
  const notice = accessNotice({ access: { applies: true, allowed: true, secureInput: true }, inputError: null });
  assert.equal(notice.kind, 'secure');
  assert.equal(notice.button, undefined);
});

test('everything fine: no notice', () => {
  assert.equal(accessNotice({ access: allowed, inputError: null }), null);
});

test('off macOS there is never a notice, whatever the capture says', () => {
  const access = { applies: false, allowed: true, secureInput: false };
  assert.equal(accessNotice({ access, inputError: 'capture failed' }), null);
});

test('a key that really arrived means no request, even when macOS says access is off', () => {
  const access = { applies: true, allowed: false, secureInput: false, captureSeen: true };
  assert.equal(accessNotice({ access, inputError: null }), null);
});

test('access off and no key seen yet: ask, even if the tap seems to run', () => {
  const access = { applies: true, allowed: false, secureInput: false, captureSeen: false };
  assert.equal(accessNotice({ access, inputError: null }).kind, 'ask');
});

test('off macOS there is never a notice, whatever the capture says', () => {
  const access = { applies: false, allowed: true, secureInput: false };
  assert.equal(accessNotice({ access, inputError: 'capture failed' }), null);
});
