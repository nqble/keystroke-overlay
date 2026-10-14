// End-to-end test runner.
//   npm run test:e2e                      build a throwaway test copy, run every suite, delete everything afterwards
//   npm run test:e2e -- --suite smoke     only one suite  (smoke | input-methods)
//   npm run test:e2e -- --keep            keep the build for fast re-runs (uses ~4 GB of disk until you delete it)
//
// SAFETY: the test copy has its own app identity (com.keyoverlay.test), its own data folder, port 7879 and a different
// exe name (kotest-e2e.exe), so it can never touch a real installed Keystroke Overlay. It builds into your TEMP folder
// and removes it (and the test data) when done unless you pass --keep.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const keep = args.includes('--keep');
const only = args.includes('--suite') ? args[args.indexOf('--suite') + 1] : 'all';
const SUITES = ['input-methods', 'secure-link', 'smoke'];          // smoke LAST: it ends by installing an update, which exits the app
const WORK = process.env.E2E_WORK ?? join(tmpdir(), 'keystroke-overlay-e2e');
const DATA = join(process.env.APPDATA, 'com.keyoverlay.test');
const EXE = join(WORK, 'kotest-e2e.exe');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8')).version;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log(`\n\x1b[36m▶ ${m}\x1b[0m`);

const portBusy = port => new Promise(res => { const s = net.createConnection(port, '127.0.0.1'); s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
const run = (cmd, cmdArgs, opts = {}) => spawnSync(cmd, cmdArgs, { cwd: ROOT, shell: true, stdio: 'inherit', ...opts });
const killApp = () => spawnSync('taskkill', ['/F', '/IM', 'kotest-e2e.exe'], { stdio: 'ignore' });
const dirSize = d => { let n = 0; try { for (const f of readdirSync(d, { withFileTypes: true })) n += f.isDirectory() ? dirSize(join(d, f.name)) : statSync(join(d, f.name)).size; } catch { /* ignore */ } return n; };

let mock;
async function main() {
  for (const port of [7879, 7999, 9222]) if (await portBusy(port)) throw new Error(`Port ${port} is busy. Close whatever uses it (a previous test run?) and try again.`);
  mkdirSync(WORK, { recursive: true });

  // ---- test signing key + a harmless fake installer, signed with it
  log('Preparing a throwaway signing key and fake installer');
  const key = join(WORK, 'test.key'), setup = join(WORK, 'setup-1.1.4.exe');
  if (!existsSync(key)) run('npx', ['tauri', 'signer', 'generate', '-w', `"${key}"`, '--ci', '-p', '""'], { stdio: 'ignore' });
  if (!existsSync(setup + '.sig')) {
    copyFileSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'whoami.exe'), setup);
    appendFileSync(setup, Buffer.alloc(3_000_000));
    run('npx', ['tauri', 'signer', 'sign', '-f', `"${key}"`, '-p', '""', `"${setup}"`], { stdio: 'ignore' });
  }
  writeFileSync(join(WORK, 'cfg.json'), JSON.stringify({
    identifier: 'com.keyoverlay.test', version: '1.1.0',      // pretend to be old so the mock's 1.1.4 counts as an update
    plugins: { updater: { pubkey: readFileSync(key + '.pub', 'utf8').trim(), endpoints: ['http://localhost:7999/latest.json'], dangerousInsecureTransportProtocol: true, windows: { installMode: 'passive' } } },
  }));

  // ---- build the isolated test copy (the slow part, ~3-4 min the first time)
  log(`Building the test copy of v${VERSION} (into ${WORK})`);
  const b = run('npx', ['tauri', 'build', '--no-bundle', '--config', `"${join(WORK, 'cfg.json')}"`], {
    env: { ...process.env, CARGO_TARGET_DIR: join(WORK, 'target'), KEYOVERLAY_TEST_UPDATE_BASE: 'http://localhost:7999' },
  });
  if (b.status !== 0) throw new Error('The test build failed.');
  copyFileSync(join(WORK, 'target', 'release', 'keyoverlay.exe'), EXE);

  mock = spawn(process.execPath, [join(HERE, 'lib', 'mock-updates.mjs'), WORK], { stdio: 'ignore' });

  // ---- run the suites
  const failed = [];
  for (const name of SUITES.filter(s => only === 'all' || only === s)) {
    log(`Suite: ${name}`);
    killApp(); await sleep(1500);
    rmSync(DATA, { recursive: true, force: true }); mkdirSync(DATA, { recursive: true });
    const autoCheck = name === 'smoke';     // the smoke suite needs the background update check; the key suite doesn't
    writeFileSync(join(DATA, 'settings.json'), JSON.stringify({ version: 2, general: { port: 7879, lastSeenVersion: VERSION, autoCheckUpdates: autoCheck }, layout: { id: 'tkl', profiles: {} } }));
    spawnSync('powershell.exe', ['-NoProfile', '-Command', `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'; Start-Process '${EXE}'`], { stdio: 'ignore' });
    for (let i = 0; i < 80; i++) { if (await fetch('http://localhost:7879/api/config').then(r => r.ok).catch(() => false)) break; await sleep(250); }
    const r = spawnSync(process.execPath, [join(HERE, 'suites', `${name}.mjs`)], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, E2E_VERSION: VERSION } });
    if (r.status !== 0) failed.push(name);
  }
  return failed;
}

let failed = [], error;
try { failed = await main(); } catch (e) { error = e; }
finally {
  log('Cleaning up');
  killApp(); mock?.kill();
  rmSync(DATA, { recursive: true, force: true });
  if (keep) console.log(`Kept the build in ${WORK} (${(dirSize(WORK) / 1e9).toFixed(1)} GB). Delete that folder when you're done.`);
  else { const gb = (dirSize(WORK) / 1e9).toFixed(1); rmSync(WORK, { recursive: true, force: true }); console.log(`Removed the test build and data (freed ${gb} GB).`); }
}
if (error) { console.error('\nE2E could not complete:', error.message); process.exit(2); }
console.log(failed.length ? `\n\x1b[31mFAILED suites: ${failed.join(', ')}\x1b[0m` : '\n\x1b[32mAll end-to-end suites passed.\x1b[0m');
process.exit(failed.length ? 1 : 0);
