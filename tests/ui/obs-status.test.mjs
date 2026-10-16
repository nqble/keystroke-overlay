// Unit tests for the header's OBS status (ui/settings/obs-status.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { obsStatus, obsStatusDetail } from '../../ui/settings/obs-status.js';

test('live when OBS is connected and not paused', () => {
  assert.deepEqual(obsStatus({ paused: false, overlays: 1 }), { kind: 'live', text: '● Live in OBS' });
  assert.equal(obsStatus({ paused: false, overlays: 3 }).kind, 'live');
});

test('not connected when no OBS overlay is open', () => {
  assert.deepEqual(obsStatus({ paused: false, overlays: 0 }), { kind: 'off', text: '○ Not connected to OBS' });
});

test('paused wins, and still says when OBS is not connected', () => {
  assert.deepEqual(obsStatus({ paused: true, overlays: 2 }), { kind: 'paused', text: '⏸ Paused' });
  assert.deepEqual(obsStatus({ paused: true, overlays: 0 }), { kind: 'paused', text: '⏸ Paused · OBS not connected' });
});

test('a changed link is red until it is copied, but pause still wins', () => {
  assert.deepEqual(obsStatus({ paused: false, overlays: 0, linkChanged: true }), {
    kind: 'bad',
    text: 'OBS link changed: copy it again',
  });
  assert.equal(obsStatus({ paused: true, overlays: 0, linkChanged: true }).kind, 'paused');
});

test('a server that could not start wins over everything', () => {
  const status = obsStatus({
    paused: true,
    overlays: 0,
    serverError: 'Port 7878 is already in use',
    linkChanged: true,
  });
  assert.deepEqual(status, { kind: 'bad', text: '⚠ Port in use' });
});

test('debug detail gives the exact count', () => {
  assert.equal(obsStatusDetail(false, 1), '1 overlay client · paused: no');
  assert.equal(obsStatusDetail(true, 2), '2 overlay clients · paused: yes');
});
