// The rule that decides when one test run may take over another's lock (tests/lib/lock.mjs). A wrong answer either lets two
// runs fight over the same ports and keyboard, or makes a run wait for an owner that is long gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { staleReasonAt } from '../lib/lock.mjs';

const HOUR = 3600 * 1000;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const startedAgo = (ms) => ({ started: new Date(NOW - ms).toISOString(), pid: 4242 });
const alive = () => true;
const dead = () => false;

test('a lock file that could not be read counts as unusable', () => {
  assert.match(staleReasonAt(null, NOW, alive), /unreadable/);
});

test('a fresh lock with a live owner is respected', () => {
  assert.equal(staleReasonAt(startedAgo(5 * 60 * 1000), NOW, alive), null);
});

test('a lock older than 3 hours is taken over, even when its owner still runs', () => {
  assert.match(staleReasonAt(startedAgo(3 * HOUR + 1000), NOW, alive), /older than 3 hours/);
});

test('exactly 3 hours is still respected (the limit is "more than")', () => {
  assert.equal(staleReasonAt(startedAgo(3 * HOUR), NOW, alive), null);
});

test('a lock whose owner is gone is taken over, and the reason names the process', () => {
  assert.match(staleReasonAt(startedAgo(60 * 1000), NOW, dead), /process 4242\) is no longer running/);
});

test('age is checked before the owner: an old lock never asks whether the process lives', () => {
  let asked = false;
  const spy = () => {
    asked = true;
    return true;
  };
  staleReasonAt(startedAgo(4 * HOUR), NOW, spy);
  assert.equal(asked, false);
});

test("the owner check gets the lock holder's process id", () => {
  let seen = null;
  staleReasonAt(startedAgo(1000), NOW, (pid) => ((seen = pid), true));
  assert.equal(seen, 4242);
});
