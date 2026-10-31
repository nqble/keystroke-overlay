// End-to-end test runner.
//   npm run test:e2e                      build a throwaway test copy, run every suite, delete everything afterwards
//   npm run test:e2e -- --suite smoke     only one suite  (smoke | input-methods)
//   npm run test:e2e -- --keep            keep the build for fast re-runs (uses ~4 GB of disk until you delete it)
//
// SAFETY: the test copy has its own app identity (com.keyoverlay.test), its own data folder, port 7879 and a different
// exe name (kotest-e2e.exe), so it can never touch a real installed Keystroke Overlay. It builds into your TEMP folder
// and removes it (and the test data) when done unless you pass --keep.
import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const keep = args.includes('--keep');
const only = args.includes('--suite') ? args[args.indexOf('--suite') + 1] : 'all';
// Optional suites run only when asked for by name (never in "all"): the visual test's baselines are from one PC, not shared.
const OPTIONAL_SUITES = ['visual', 'tab-speed', 'overlay-speed'];
if (args.includes('--update')) process.env.VISUAL_UPDATE = '1';
// smoke LAST: it ends by installing an update, which exits the app
const SUITES = [
  'input-methods',
  'secure-link',
  'focus',
  'layouts',
  'layout-preview',
  'keys-editor',
  'keys-editor-snap',
  'keys-editor-board',
  'keys-editor-styles',
  'key-rotation',
  'accessibility',
  'ui-sweep',
  'csp',
  'soak',
  'whats-new',
  'debug',
  'smoke',
];
const WORK = process.env.E2E_WORK ?? join(tmpdir(), 'keystroke-overlay-e2e');
const DATA = join(process.env.APPDATA, APP.identifiers.test);
const EXE = join(WORK, `${APP.testApps.e2eExe}.exe`);
const VERSION = JSON.parse(readFileSync(join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8')).version;
import { acquire } from '../lib/lock.mjs';
import { APP } from '../../tools/app-config.mjs';
let lock; // the shared test lock (see tests/lib/lock.mjs)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`\n\x1b[36m▶ ${m}\x1b[0m`);

const portBusy = (port) =>
  new Promise((res) => {
    const s = net.createConnection(port, '127.0.0.1');
    s.on('connect', () => {
      s.destroy();
      res(true);
    });
    s.on('error', () => res(false));
  });
const run = (cmd, cmdArgs, opts = {}) => spawnSync(cmd, cmdArgs, { cwd: ROOT, shell: true, stdio: 'inherit', ...opts });
const killApp = () => spawnSync('taskkill', ['/F', '/IM', `${APP.testApps.e2eExe}.exe`], { stdio: 'ignore' });
const dirSize = (d) => {
  let n = 0;
  try {
    for (const f of readdirSync(d, { withFileTypes: true }))
      n += f.isDirectory() ? dirSize(join(d, f.name)) : statSync(join(d, f.name)).size;
  } catch {
    /* ignore */
  }
  return n;
};

let mock;

/** Stops with a clear message when a port the tests need is already in use (usually a previous run). */
async function checkPortsFree() {
  for (const port of [7879, 7999, 9222])
    if (await portBusy(port))
      throw new Error(`Port ${port} is busy. Close whatever uses it (a previous test run?) and try again.`);
}

/** A throwaway signing key, a harmless fake installer signed with it, and the config that makes the test copy look old. */
function prepareUpdateFixtures() {
  // ---- test signing key + a harmless fake installer, signed with it
  log('Preparing a throwaway signing key and fake installer');
  const key = join(WORK, 'test.key'),
    setup = join(WORK, 'setup-1.1.4.exe');
  if (!existsSync(key))
    run('npx', ['tauri', 'signer', 'generate', '-w', `"${key}"`, '--ci', '-p', '""'], { stdio: 'ignore' });
  if (!existsSync(setup + '.sig')) {
    copyFileSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'whoami.exe'), setup);
    appendFileSync(setup, Buffer.alloc(3_000_000));
    run('npx', ['tauri', 'signer', 'sign', '-f', `"${key}"`, '-p', '""', `"${setup}"`], { stdio: 'ignore' });
  }
  writeFileSync(
    join(WORK, 'cfg.json'),
    JSON.stringify({
      // pretend to be old so the mock's 1.1.4 counts as an update
      identifier: APP.identifiers.test,
      version: '1.1.0',
      plugins: {
        updater: {
          pubkey: readFileSync(key + '.pub', 'utf8').trim(),
          endpoints: ['http://localhost:7999/latest.json'],
          dangerousInsecureTransportProtocol: true,
          windows: { installMode: 'quiet' }, // the same as the real app (tauri.conf.json)
        },
      },
    }),
  );
}

/** Builds the isolated test copy and starts the fake update server. */
function buildTestCopy() {
  // ---- build the isolated test copy (the slow part, ~3-4 min the first time)
  log(`Building the test copy of v${VERSION} (into ${WORK})`);
  const b = run('npx', ['tauri', 'build', '--no-bundle', '--config', `"${join(WORK, 'cfg.json')}"`], {
    env: {
      ...process.env,
      CARGO_TARGET_DIR: join(WORK, 'target'),
      KEYOVERLAY_TEST_UPDATE_BASE: 'http://localhost:7999',
    },
  });
  if (b.status !== 0) throw new Error('The test build failed.');
  copyFileSync(join(WORK, 'target', 'release', 'keyoverlay.exe'), EXE);

  mock = spawn(process.execPath, [join(HERE, 'lib', 'mock-updates.mjs'), WORK], { stdio: 'ignore' });
}

/** A fresh, empty data folder with the few settings every suite starts from. */
function freshDataFolder(name) {
  rmSync(DATA, { recursive: true, force: true });
  mkdirSync(DATA, { recursive: true });
  const autoCheck = name === 'smoke'; // the smoke suite needs the background update check; the key suite doesn't
  writeFileSync(
    join(DATA, 'settings.json'),
    JSON.stringify({
      version: 2,
      general: { port: 7879, lastSeenVersion: VERSION, autoCheckUpdates: autoCheck },
      layout: { id: 'tkl', profiles: {} },
    }),
  );
}

/** Starts the test copy with its settings window open to the debugging connection, and waits for its server. */
async function startApp() {
  spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'; Start-Process '${EXE}'`,
    ],
    { stdio: 'ignore' },
  );
  const serverUp = () =>
    fetch('http://localhost:7879/api/config')
      .then((r) => r.ok)
      .catch(() => false);
  for (let i = 0; i < 80 && !(await serverUp()); i++) await sleep(250);
}

/** Runs one suite against a fresh app with a fresh data folder. Returns true when the suite passed. */
async function runSuite(name) {
  log(`Suite: ${name}`);
  lock?.stage(`suite ${name}`);
  killApp();
  await sleep(1500);
  freshDataFolder(name);
  await startApp();
  const r = spawnSync(
    process.execPath,
    [name === 'visual' ? join(ROOT, 'tests/visual/visual.mjs') : join(HERE, 'suites', `${name}.mjs`)],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, E2E_VERSION: VERSION, E2E_EXE: EXE, E2E_DATA: DATA },
    },
  );
  if (r.status !== 0) saveDiagnostics(name);
  return r.status === 0;
}

/** On GitHub's runner (E2E_DIAGNOSTICS set by .github/workflows/e2e.yml), saves why a suite failed: see lib/diagnose.ps1. */
function saveDiagnostics(name) {
  const outDir = process.env.E2E_DIAGNOSTICS;
  if (!outDir) return;
  const script = join(HERE, 'lib', 'diagnose.ps1');
  spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, name, APP.testApps.e2eExe, DATA, outDir],
    { stdio: 'inherit' },
  );
}

async function main() {
  await checkPortsFree();
  mkdirSync(WORK, { recursive: true });
  prepareUpdateFixtures();
  buildTestCopy();
  const failed = [];
  for (const name of [...SUITES, ...OPTIONAL_SUITES].filter(
    (s) => only === s || (only === 'all' && !OPTIONAL_SUITES.includes(s)),
  ))
    if (!(await runSuite(name))) failed.push(name);
  return failed;
}

let failed = [],
  error;
lock = await acquire(`end-to-end tests (${only === 'all' ? 'all suites' : 'suite ' + only})`, {
  expectedMinutes: only === 'all' ? 14 : 5,
});
lock.stage('building the test copy');
try {
  failed = await main();
} catch (e) {
  error = e;
} finally {
  log('Cleaning up');
  killApp();
  mock?.kill();
  rmSync(DATA, { recursive: true, force: true });
  if (keep)
    console.log(
      `Kept the build in ${WORK} (${(dirSize(WORK) / 1e9).toFixed(1)} GB). Delete that folder when you're done.`,
    );
  else {
    const gb = (dirSize(WORK) / 1e9).toFixed(1);
    rmSync(WORK, { recursive: true, force: true });
    console.log(`Removed the test build and data (freed ${gb} GB).`);
  }
}
if (error) {
  console.error('\nE2E could not complete:', error.message);
  process.exit(2);
}
console.log(
  failed.length
    ? `\n\x1b[31mFAILED suites: ${failed.join(', ')}\x1b[0m`
    : '\n\x1b[32mAll end-to-end suites passed.\x1b[0m',
);
process.exit(failed.length ? 1 : 0);
