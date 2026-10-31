// A REAL quiet in-app update: does the app update itself with no installer window, and reopen by itself on the new version?
//   node tests/install/quiet-update.mjs [--keep]      (or: npm run test:quiet-update)
// Builds two real installers of the current code under a throwaway identity ("KOTest", com.keyoverlay.test, exe
// kotest-install.exe), so an installed Keystroke Overlay is never touched: the current version, and a copy of it numbered
// 9.9.9 and signed with a throwaway key. A tiny fake "GitHub" (tests/e2e/lib/mock-updates.mjs) serves the 9.9.9 installer.
//   1. install the current version silently and open it
//   2. the app finds the 9.9.9 update and installs it from the inside (the "Update now" button's command)
//   3. while that happens, watch for ANY installer window: there must be none
//   4. the app must come back by itself, and it must be v9.9.9
// Needs ~4 GB temporarily in TEMP (deleted afterwards unless --keep) and about 10 to 15 minutes. Do not use the PC's
// mouse and keyboard while it runs: it opens and closes real windows.
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { connect, check, finish, sleep } from '../e2e/lib/cdp.mjs';
import { acquire } from '../lib/lock.mjs';
import { APP } from '../../tools/app-config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)),
  ROOT = resolve(HERE, '../..');
const keep = process.argv.includes('--keep');
const WORK = process.env.QUIET_WORK ?? join(tmpdir(), 'keyoverlay-quiet-update');
const INSTALL = join(WORK, 'installed');
const DATA = join(process.env.APPDATA, APP.identifiers.test);
const EXE = join(INSTALL, `${APP.testApps.installExe}.exe`);
const VERSION = JSON.parse(readFileSync(join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8')).version;
const NEW_VERSION = '9.9.9';
const sh = (cmd, a, o = {}) => spawnSync(cmd, a, { shell: true, stdio: 'inherit', ...o });
const ps = (script) =>
  spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).stdout?.trim() ?? '';
const killTest = () => ps(`Stop-Process -Name ${APP.testApps.installExe} -Force -ErrorAction SilentlyContinue`);
const alive = () => ps(`@(Get-Process -Name ${APP.testApps.installExe} -ErrorAction SilentlyContinue).Count`) !== '0';
const portBusy = (port) =>
  fetch(`http://127.0.0.1:${port}/`)
    .then(() => true)
    .catch(() => false);

function launch() {
  spawn(EXE, [], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222' },
  }).unref();
}

/** Build a real NSIS installer of the current code, numbered `version`, that looks for updates on the fake server. */
function build(version, key) {
  const out = join(WORK, `setup-${version}.exe`);
  if (existsSync(out)) return out;
  console.log(`\n> Building the v${version} installer`);
  const cfg = join(WORK, `cfg-${version}.json`);
  writeFileSync(
    cfg,
    JSON.stringify({
      identifier: APP.identifiers.test,
      productName: APP.testApps.installProduct,
      mainBinaryName: APP.testApps.installExe,
      version,
      bundle: { createUpdaterArtifacts: false },
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
  const b = sh('npx', ['tauri', 'build', '--bundles', 'nsis', '--config', `"${cfg}"`], {
    cwd: ROOT,
    env: {
      ...process.env,
      CARGO_TARGET_DIR: join(WORK, 'target'),
      KEYOVERLAY_TEST_UPDATE_BASE: 'http://localhost:7999',
    },
  });
  if (b.status !== 0) throw new Error(`installer build failed for ${version}`);
  const nsis = join(WORK, 'target/release/bundle/nsis');
  const file = readdirSync(nsis).find((n) => n.endsWith('-setup.exe'));
  copyFileSync(join(nsis, file), out);
  rmSync(join(nsis, file), { force: true });
  return out;
}

const lock = await acquire('quiet in-app update test', { expectedMinutes: 15 });
mkdirSync(WORK, { recursive: true });
let failed = false,
  mock = null,
  watcher = null;
try {
  for (const port of [7879, 7999, 9222])
    if (await portBusy(port)) throw new Error(`Port ${port} is busy; close what uses it first.`);

  const key = join(WORK, 'test.key');
  if (!existsSync(key))
    sh('npx', ['tauri', 'signer', 'generate', '-w', `"${key}"`, '--ci', '-p', '""'], { stdio: 'ignore' });
  const setupNow = build(VERSION, key);
  const setupNew = build(NEW_VERSION, key);
  sh('npx', ['tauri', 'signer', 'sign', '-f', `"${key}"`, '-p', '""', `"${setupNew}"`], { stdio: 'ignore' });
  // the fake server serves setup-<MOCK_VERSION>.exe and setup-<MOCK_VERSION>.exe.sig from the work folder

  killTest();
  rmSync(DATA, { recursive: true, force: true });
  rmSync(INSTALL, { recursive: true, force: true });

  console.log(`\n== 1. install v${VERSION} silently and open it`);
  check(
    'installer ran silently and succeeded',
    spawnSync(setupNow, ['/S', `/D=${INSTALL}`], { stdio: 'ignore' }).status === 0,
  );
  await sleep(1500);
  mkdirSync(DATA, { recursive: true });
  writeFileSync(
    join(DATA, 'settings.json'),
    JSON.stringify({ version: 3, general: { port: 7879, autoCheckUpdates: false, updateChannel: 'latest' } }),
  );
  launch();
  let p = await connect();
  await sleep(2500);
  let state = (await p.invoke('get_state')).ok;
  check(`the installed app is v${VERSION}`, state.version === VERSION);

  console.log(`\n== 2. serve v${NEW_VERSION} and update from inside the app`);
  mock = spawn(process.execPath, [join(ROOT, 'tests/e2e/lib/mock-updates.mjs'), WORK], {
    stdio: 'ignore',
    env: { ...process.env, MOCK_VERSION: NEW_VERSION },
  });
  await sleep(800);
  const found = (await p.invoke('check_update')).ok;
  check(
    `the app finds v${NEW_VERSION} on the fake server`,
    JSON.stringify(found).includes(NEW_VERSION),
    JSON.stringify(found),
  );

  // Watch for any installer window while the update runs: every 100 ms, list visible windows that look like an installer
  // (a process or window title with Setup / Installing / KOTest in it, other than the app itself). A quiet install shows none.
  watcher = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `$end=(Get-Date).AddSeconds(75); $seen=@{}; while((Get-Date) -lt $end){ Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -ne '${APP.testApps.installExe}' -and ($_.ProcessName -match 'setup|nsis|KOTest|installer' -or $_.MainWindowTitle -match 'Setup|Installing|Installer|KOTest') } | ForEach-Object { $seen[$_.ProcessName + ' | ' + $_.MainWindowTitle]=1 }; Start-Sleep -Milliseconds 100 }; $seen.Keys | Sort-Object`,
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  let windows = '';
  watcher.stdout.on('data', (chunk) => (windows += chunk));
  const watcherDone = new Promise((done) => watcher.on('close', done)); // made now: it may finish before we look

  const snapshot = () =>
    ps(
      `$v=(Get-Item '${EXE}' -ErrorAction SilentlyContinue).VersionInfo.FileVersion; $p=@(Get-Process ${APP.testApps.installExe} -ErrorAction SilentlyContinue | ForEach-Object { $_.Id.ToString() + '@' + $_.StartTime.ToString('HH:mm:ss') }) -join ','; "file $v, running [$p]"`,
    );
  console.log(`  before: ${snapshot()}`);
  const idBefore = ps(`(Get-Process ${APP.testApps.installExe} -ErrorAction SilentlyContinue).Id`);
  p.invoke('install_update').catch(() => {}); // never answers: the app is replaced while it runs
  await sleep(1500); // let the message leave before the connection is closed
  p.close();
  console.log('  waiting for the update to install and the app to come back (up to 75 s)...');
  const started = Date.now();

  let back = null;
  const deadline = Date.now() + 75000;
  while (Date.now() < deadline && !back) {
    await sleep(2500);
    console.log(`  +${Math.round((Date.now() - started) / 1000)} s: ${snapshot()}`);
    try {
      const q = await connect();
      const now = ps(`(Get-Process ${APP.testApps.installExe} -ErrorAction SilentlyContinue).Id`);
      const onDisk = ps(`(Get-Item '${EXE}').VersionInfo.FileVersion`);
      // The app reports its version from Cargo.toml, which a test build does not change, so the new version is told apart
      // by the program file's own version number and by a new process id (the old one was closed and a new one started).
      if ((await q.invoke('get_state')).ok && now && now !== idBefore && onDisk === NEW_VERSION) back = q;
      else q.close();
    } catch {
      /* not back yet */
    }
  }

  console.log(`\n== 3. what happened`);
  check(`the app reopened by itself (a new process) and the installed program is v${NEW_VERSION}`, !!back);
  await watcherDone;
  check('no installer window appeared at any point', windows.trim() === '', JSON.stringify(windows.trim()));
  if (back) {
    const s = (await back.invoke('get_state')).ok;
    check(
      'the settings survived the update (port 7879, latest channel)',
      s.settings.general.port === 7879 && s.settings.general.updateChannel === 'latest',
    );
    back.close();
  }
  killTest();
  await sleep(1500);
  check('nothing is left running', !alive());
} catch (e) {
  console.error('\nQuiet-update test could not complete:', e.message);
  failed = true;
} finally {
  mock?.kill();
  watcher?.kill();
  killTest();
  const uninstall = join(INSTALL, 'uninstall.exe');
  if (existsSync(uninstall)) spawnSync(uninstall, ['/S', `_?=${INSTALL}`], { stdio: 'ignore' });
  rmSync(DATA, { recursive: true, force: true });
  if (!keep) rmSync(WORK, { recursive: true, force: true });
  else console.log('Kept', WORK);
  lock?.release?.();
}
if (failed) process.exit(2);
finish();
