// Key latency: how long after a real key press does the app's local WebSocket deliver it?
//
// A PowerShell script (latency-inject.ps1) presses real keys and notes the time just before each press. This file listens on
// the app's own WebSocket, exactly like the OBS overlay page does, and notes when each "key down" message arrives. The
// difference is the latency of: Windows keyboard hook -> the app -> the local server -> the WebSocket. It stops there: the
// browser then draws the key, which takes the same time whatever the app does, so it is left out.
//
// Used by tests/bench/run.mjs (one set of numbers per version, so two versions can be compared). Only talks to 127.0.0.1.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_WAIT_MS = 500; // a key that has not arrived this long after the press counts as missed
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The value below which `fraction` of the sorted numbers fall (0.5 = the median, 0.95 = the 95th percentile). */
export function percentile(sortedNumbers, fraction) {
  if (!sortedNumbers.length) return null;
  const index = Math.min(sortedNumbers.length - 1, Math.ceil(fraction * sortedNumbers.length) - 1);
  return sortedNumbers[Math.max(0, index)];
}

/** p50 / p95 / max of a list of latencies in milliseconds, rounded to 0.01. */
export function summarise(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const round = (n) => (n === null ? null : +n.toFixed(2));
  return {
    count: sorted.length,
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted.at(-1) ?? null),
  };
}

/** Listen on the app's WebSocket, press keys for real, and return { kind: [latency in ms, ...] } plus the number missed. */
export async function measureKeyLatency(port, presses = 120) {
  const arrivals = []; // { code, at } for every "key down" message
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.t === 'd') arrivals.push({ code: message.k, at: performance.timeOrigin + performance.now() });
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('could not open the app WebSocket'));
  });
  await sleep(300); // let the first "snap" message and the connection settle

  const output = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(HERE, 'latency-inject.ps1'),
      '-presses',
      String(presses),
    ],
    { encoding: 'utf8' },
  );
  await sleep(MAX_WAIT_MS);
  socket.close();

  const byKind = { single: [], fast: [], two: [] };
  let missed = 0;
  const used = new Set();
  for (const line of output.trim().split('\n')) {
    const [kind, code, pressedAt] = line.trim().split(' ');
    const pressed = Number(pressedAt);
    const index = arrivals.findIndex((a, i) => !used.has(i) && a.code === code && a.at >= pressed - 1);
    if (index < 0 || arrivals[index].at - pressed > MAX_WAIT_MS) {
      missed += 1;
      continue;
    }
    used.add(index);
    byKind[kind].push(arrivals[index].at - pressed);
  }
  return { byKind, missed };
}

/** Combine the results of several rounds into the numbers the benchmark prints. */
export function summariseRounds(rounds) {
  const pooled = { single: [], fast: [], two: [] };
  let missed = 0;
  for (const round of rounds) {
    missed += round.missed;
    for (const kind of Object.keys(pooled)) pooled[kind].push(...round.byKind[kind]);
  }
  const all = Object.values(pooled).flat();
  return {
    all: summarise(all),
    single: summarise(pooled.single),
    fast: summarise(pooled.fast),
    two: summarise(pooled.two),
    missed,
  };
}
