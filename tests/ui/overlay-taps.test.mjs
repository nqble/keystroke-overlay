// A tap (a wheel notch, PrintScreen) shows on the overlay for at least MIN_TAP_MS; every other key is released at once
// (ui/overlay/taps.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MIN_TAP_MS, createTaps, releaseDelay } from '../../ui/overlay/taps.js';

/** A fake clock and timer: `advance(ms)` moves time on and runs the timers that came due. */
function fakeClock() {
  let time = 0;
  let nextId = 1;
  const timers = new Map();
  const started = [];
  return {
    now: () => time,
    later: (run, wait) => {
      const id = nextId++;
      timers.set(id, { run, at: time + wait });
      started.push(wait);
      return id;
    },
    cancel: (id) => timers.delete(id),
    advance(ms) {
      time += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= time) {
          timers.delete(id);
          timer.run();
        }
      }
    },
    started,
    get pending() {
      return timers.size;
    },
  };
}

/** Taps over a fake clock, and the list of what was painted: 'KeyW down', 'KeyW up'. */
function setup() {
  const clock = fakeClock();
  const painted = [];
  const taps = createTaps((code, down) => painted.push(`${code} ${down ? 'down' : 'up'}`), clock);
  return { clock, painted, taps };
}

test('the minimum is a tenth of a second, the same as the wheel code lets one press through', () => {
  assert.equal(MIN_TAP_MS, 100);
  const wheel = readFileSync(new URL('../../src-tauri/src/mouse/wheel.rs', import.meta.url), 'utf8');
  assert.equal(Number(wheel.match(/pub const MIN_TAP_MS: u64 = (\d+);/)?.[1]), MIN_TAP_MS);
});

test('a release 5 ms after its press waits out the rest of the minimum', () => {
  assert.equal(releaseDelay(0, 5), 95);
  assert.equal(releaseDelay(0, 0), MIN_TAP_MS);
});

test('a key held for the minimum or longer is released at once', () => {
  assert.equal(releaseDelay(0, 100), 0);
  assert.equal(releaseDelay(0, 300), 0);
  assert.equal(releaseDelay(0, 99.5), 0.5);
});

test('a release without a press we saw is shown at once', () => {
  assert.equal(releaseDelay(undefined, 1000), 0);
});

test('a tap released 5 ms after its press stays down for the minimum, then goes up', () => {
  const { clock, painted, taps } = setup();
  taps.press('WheelUp');
  clock.advance(5);
  taps.release('WheelUp');
  assert.deepEqual(painted, ['WheelUp down']); // still down
  assert.equal(taps.waitingCount, 1);
  clock.advance(94);
  assert.deepEqual(painted, ['WheelUp down']);
  clock.advance(1); // 100 ms after the press
  assert.deepEqual(painted, ['WheelUp down', 'WheelUp up']);
  assert.equal(taps.waitingCount, 0);
});

test('PrintScreen, whose press and release arrive in the same moment, is seen', () => {
  const { clock, painted, taps } = setup();
  taps.press('PrintScreen');
  taps.release('PrintScreen');
  assert.deepEqual(painted, ['PrintScreen down']);
  clock.advance(MIN_TAP_MS);
  assert.deepEqual(painted, ['PrintScreen down', 'PrintScreen up']);
});

test('a key held for 300 ms is released at once, and no timer is started for it', () => {
  const { clock, painted, taps } = setup();
  taps.press('KeyW');
  clock.advance(300);
  taps.release('KeyW');
  assert.deepEqual(painted, ['KeyW down', 'KeyW up']);
  assert.deepEqual(clock.started, []);
  assert.equal(clock.pending, 0);
});

test('a second release while the first waits starts no second timer', () => {
  const { clock, taps } = setup();
  taps.press('WheelDown');
  taps.release('WheelDown');
  taps.release('WheelDown');
  assert.deepEqual(clock.started, [MIN_TAP_MS]);
  assert.equal(clock.pending, 1);
});

test('pressed again while its release waits, a key stays down and is not shown up', () => {
  const { clock, painted, taps } = setup();
  taps.press('WheelUp');
  clock.advance(10);
  taps.release('WheelUp');
  clock.advance(10);
  taps.press('WheelUp'); // the next notch
  assert.equal(taps.waitingCount, 0);
  clock.advance(500);
  assert.deepEqual(painted, ['WheelUp down', 'WheelUp down']); // nothing came up in between
  clock.advance(0);
  taps.release('WheelUp'); // held for 500 ms: released at once
  assert.equal(painted.at(-1), 'WheelUp up');
});

test('clear forgets every waiting release, so nothing is shown up later', () => {
  const { clock, painted, taps } = setup();
  taps.press('WheelUp');
  taps.press('PrintScreen');
  taps.release('WheelUp');
  taps.release('PrintScreen');
  taps.clear();
  assert.equal(clock.pending, 0);
  clock.advance(1000);
  assert.deepEqual(painted, ['WheelUp down', 'PrintScreen down']); // the caller paints everything dark itself
  taps.release('WheelUp'); // a release after the clear is a release we never saw the press of: shown at once
  assert.equal(painted.at(-1), 'WheelUp up');
});

test('different keys have their own clocks', () => {
  const { clock, painted, taps } = setup();
  taps.press('WheelUp');
  clock.advance(60);
  taps.press('WheelDown');
  taps.release('WheelUp');
  taps.release('WheelDown');
  clock.advance(40); // WheelUp is 100 ms old, WheelDown 40
  assert.deepEqual(painted, ['WheelUp down', 'WheelDown down', 'WheelUp up']);
  clock.advance(60);
  assert.deepEqual(painted, ['WheelUp down', 'WheelDown down', 'WheelUp up', 'WheelDown up']);
});
