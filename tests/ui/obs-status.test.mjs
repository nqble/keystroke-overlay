// Unit tests for the header's OBS status (ui/settings/obs-status.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { obsStatus, obsStatusDetail } from '../../ui/settings/obs-status.js';

test('live when OBS is connected and not paused', () => {
  assert.deepEqual(obsStatus(false, 1), { kind: 'live', text: '● Live in OBS' });
  assert.equal(obsStatus(false, 3).kind, 'live');
});

test('not connected when no OBS overlay is open', () => {
  assert.deepEqual(obsStatus(false, 0), { kind: 'off', text: '○ Not connected to OBS' });
});

test('paused wins, and still says when OBS is not connected', () => {
  assert.deepEqual(obsStatus(true, 2), { kind: 'paused', text: '⏸ Paused' });
  assert.deepEqual(obsStatus(true, 0), { kind: 'paused', text: '⏸ Paused · OBS not connected' });
});

test('debug detail gives the exact count', () => {
  assert.equal(obsStatusDetail(false, 1), '1 overlay client · paused: no');
  assert.equal(obsStatusDetail(true, 2), '2 overlay clients · paused: yes');
});
