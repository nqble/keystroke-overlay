// The mouse trial's measurements (docs/proposals/mouse-input.md, work order step 1; how to read them: docs/DEBUGGING.md).
//   node tests/bench/mouse-trial.mjs [--seconds 30] [--rebuild]
// Builds an isolated test copy WITH the cargo feature `mouse` (the same throwaway identity and ports as the end-to-end
// tests; never the real app), starts it, and measures the app process while the Raw Input mouse capture is off, on and
// idle, on while fake mouse moves arrive at 1,000 a second, on while clicks and wheel notches arrive, and across 20
// on/off cycles. It needs the PC to itself: it moves the pointer one pixel back and forth, inside a small window it opens.
import { spawnSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { acquire } from '../lib/lock.mjs';
import { APP } from '../../tools/app-config.mjs';
import { connect, sleep, procStats, EXE_NAME } from '../e2e/lib/cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const SECONDS = +(args[args.indexOf('--seconds') + 1] || 30);
const WORK = process.env.BENCH_WORK ?? join(tmpdir(), 'keyoverlay-mouse-trial');
const DATA = join(process.env.APPDATA, APP.identifiers.test);
const EXE = join(WORK, `${EXE_NAME}.exe`);
const MOVES_PER_SECOND = 1000;
const CLICKS = 50;
const NOTCHES = 50;
const CYCLES = 20;
const INJECT = join(HERE, 'mouse-inject.ps1');

const kill = () => spawnSync('taskkill', ['/F', '/IM', `${EXE_NAME}.exe`], { stdio: 'ignore' });
const inject = (mode, a, b = 0) =>
  new Promise((done) => {
    let out = '';
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', INJECT, mode, a, b], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    child.stdout.on('data', (chunk) => (out += chunk));
    child.on('exit', () => done(Number(out.trim().split('\n').pop())));
  });

const lock = await acquire('mouse trial', { expectedMinutes: 15 });
mkdirSync(WORK, { recursive: true });
const config = join(WORK, 'cfg.json');
writeFileSync(config, JSON.stringify({ identifier: APP.identifiers.test }));

// ---------------------------------------------------------------- build the copy with the mouse feature
if (args.includes('--rebuild') || !existsSync(EXE)) {
  console.log('Building the test copy with the mouse feature (a few minutes the first time)');
  const build = spawnSync('npx', ['tauri', 'build', '--no-bundle', '--features', 'mouse', '--config', `"${config}"`], {
    shell: true,
    stdio: 'inherit',
    cwd: ROOT,
    env: { ...process.env, CARGO_TARGET_DIR: join(WORK, 'target') },
  });
  if (build.status !== 0) throw new Error('The build failed.');
  copyFileSync(join(WORK, 'target', 'release', 'keyoverlay.exe'), EXE);
}

// ---------------------------------------------------------------- start it with a fresh data folder
kill();
await sleep(1500);
rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });
writeFileSync(
  join(DATA, 'settings.json'),
  JSON.stringify({
    version: 2,
    general: { port: 7879, lastSeenVersion: '0.0.0', autoCheckUpdates: false },
    layout: { id: 'tkl', profiles: {} },
  }),
);
spawnSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'; Start-Process '${EXE}'`,
  ],
  { stdio: 'ignore' },
);
for (let i = 0; i < 80; i++) {
  const up = await fetch('http://localhost:7879/api/config').then(
    (r) => r.ok,
    () => false,
  );
  if (up) break;
  await sleep(250);
}
const page = await connect();
await sleep(5000); // let start-up settle
const trial = async (action) => {
  const answer = await page.invoke('debug_mouse_trial', { action });
  if (answer.err) throw new Error(answer.err);
  return answer.ok;
};

// ---------------------------------------------------------------- measuring
/** Runs `work` and reports the app's CPU use over it as a percentage of one core, plus threads before and after. */
async function measure(label, work) {
  const [threadsBefore, , , cpuBefore] = procStats();
  const started = Date.now();
  const extra = (await work()) ?? {};
  const seconds = (Date.now() - started) / 1000;
  const [threadsAfter, handlesAfter, memoryMb, cpuAfter] = procStats();
  const row = {
    label,
    seconds: +seconds.toFixed(1),
    cpuPercent: +(((cpuAfter - cpuBefore) / 1000 / seconds) * 100).toFixed(2),
    threadsBefore,
    threadsAfter,
    handles: handlesAfter,
    memoryMb,
    ...extra,
  };
  console.log(JSON.stringify(row));
  return row;
}
const rows = [];
const idle = (label) => measure(label, async () => void (await sleep(SECONDS * 1000)));

rows.push(await idle('1. capture off, idle'));

await trial('start');
rows.push(await idle('2. capture on, mouse not used'));

const movesSent = { value: 0 };
rows.push(
  await measure(`3. capture on, mouse moving at ${MOVES_PER_SECOND} a second`, async () => {
    movesSent.value = await inject('move', SECONDS, MOVES_PER_SECOND);
    const stats = await trial('stats');
    return { movesSent: movesSent.value, recordsSeen: stats.records, eventsSeen: stats.events };
  }),
);

await trial('stop');
await trial('start'); // zeroes the counts
rows.push(
  await measure(`4. capture on, ${CLICKS} clicks and ${NOTCHES} wheel notches`, async () => {
    const clicksSent = await inject('click', CLICKS);
    const notchesSent = await inject('wheel', NOTCHES);
    const stats = await trial('stats');
    // a click is a press and a release (two events); a notch is one event
    return { sent: clicksSent + notchesSent, eventsSeen: stats.events, expectedEvents: clicksSent + notchesSent };
  }),
);
await trial('stop');

rows.push(await idle('5. capture off again, idle'));

const [threadsStart, handlesStart] = procStats();
for (let i = 0; i < CYCLES; i++) {
  await trial('start');
  await sleep(150);
  await trial('stop');
  await sleep(150);
}
await sleep(1000);
const [threadsEnd, handlesEnd] = procStats();
const cycles = { label: `6. ${CYCLES} on/off cycles`, threadsStart, threadsEnd, handlesStart, handlesEnd };
console.log(JSON.stringify(cycles));

writeFileSync(join(WORK, 'results.json'), JSON.stringify({ rows, cycles }, null, 2));
console.log(`\nResults saved in ${join(WORK, 'results.json')}`);
page.close();
kill();
lock.release?.();
