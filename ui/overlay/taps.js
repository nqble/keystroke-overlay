// =====================================================================================================================
//  Taps: a key that is pressed and released within the same moment (a mouse wheel notch, and PrintScreen on Windows,
//  which only reports its release) would add and remove its `down` look in one frame, so nothing would show. A tap is
//  shown for at least MIN_TAP_MS after its press; every other key is released at once, as before. Plain logic with the
//  clock and the timer passed in, so it is tested without a browser (tests/ui/overlay-taps.test.mjs). A timer is
//  started only when an early release arrives, so nothing runs while the overlay is idle (CLAUDE.md).
// =====================================================================================================================

/**
 * How long a tap shows at least, in milliseconds. The same number as `MIN_TAP_MS` in src-tauri/src/mouse/wheel.rs, which
 * lets one wheel press through per direction in that time: keep the two in step (a test checks it).
 */
export const MIN_TAP_MS = 100;

/** How long to wait before showing a release: nothing once the key has been down for MIN_TAP_MS, else the rest of it. */
export function releaseDelay(pressedAt, now, minimum = MIN_TAP_MS) {
  if (pressedAt === undefined) return 0; // a release without a press we saw: just show it
  return Math.max(0, minimum - (now - pressedAt));
}

/**
 * Keeps a tap on screen long enough. `show(code, down)` paints one key (adds or removes its `down` look). Call `press`
 * and `release` as the keys come in, and `clear` when everything must go dark at once (pause, a lost connection).
 * `clock` is for tests: { now, later, cancel }.
 */
export function createTaps(show, clock = {}) {
  const { now = () => performance.now(), later = setTimeout, cancel = clearTimeout } = clock;
  const pressedAt = new Map(); // code -> when it went down
  const waiting = new Map(); // code -> the timer that will show its release

  function stopWaiting(code) {
    if (!waiting.has(code)) return;
    cancel(waiting.get(code));
    waiting.delete(code);
  }

  function finish(code) {
    waiting.delete(code);
    pressedAt.delete(code);
    show(code, false);
  }

  return {
    press(code) {
      stopWaiting(code); // pressed again while its release was waiting: it stays down
      pressedAt.set(code, now());
      show(code, true);
    },
    release(code) {
      const wait = releaseDelay(pressedAt.get(code), now());
      if (wait <= 0) {
        stopWaiting(code);
        finish(code);
      } else if (!waiting.has(code)) {
        const timer = later(() => finish(code), wait);
        waiting.set(code, timer);
      }
    },
    /** Forget everything waiting. The caller paints every key released. */
    clear() {
      for (const code of [...waiting.keys()]) stopWaiting(code);
      pressedAt.clear();
    },
    get waitingCount() {
      // how many releases are waiting (for tests)
      return waiting.size;
    },
  };
}
