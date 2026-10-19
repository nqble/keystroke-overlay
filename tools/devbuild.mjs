// Builds a DEVBUILD: a temporary installer for your own testing. It is never published and is not signed for updates.
//   npm run devbuild                 build the installer
//   npm run devbuild -- --verify     also build a throwaway test copy with the same page and logo, start it, and check
//   that the
//                                    settings window really loads with the purple logo (takes about 4 extra minutes)
//
// What makes it a devbuild:
//   * the file is named  Keystroke-Overlay_<version>-devbuild_x64-setup.exe   (in release/<version>-devbuild/)
//   * it uses the official devbuild logo: the normal logo in black and purple (installer, program icon, tray, window
//     and the logo in the settings header). Nothing in the project's own files changes; the recolored copies are
//     temporary.
//   * it is a SEPARATE app (identity com.keyoverlay.devbuild, its own install folder, uninstall entry, settings folder
//   and
//     port 7881), so it runs happily beside an installed Keystroke Overlay. Your normal settings and layouts are not
//     shared.
//     Automatic update checks are off in a devbuild.
// Everything temporary is deleted afterwards, and any older devbuild / test installer folders are removed.
import { spawnSync, spawn } from 'node:child_process';
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { addDevbuildLabel } from './devbuild-title.mjs';
import { APP } from './app-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8')).version;
const verify = process.argv.includes('--verify');
const WORK = join(tmpdir(), 'keyoverlay-devbuild');
// The recolored copy of the settings page lives INSIDE the project folder (ignored by git) and is given to the build
// as a
// RELATIVE path. An absolute Windows path such as C:/... would be read as a web address and the app would open a blank
// "File not found" page instead of its settings.
const UI_TMP = join(ROOT, '.devbuild-tmp');
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, shell: true, stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args[0] ?? ''} failed`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fwd = (p) => p.replace(/\\/g, '/');

/**
 * Start a throwaway test copy built from the same page + icons and check its window really shows the settings and the
 * purple logo.
 */
/** Builds a throwaway test copy (own identity, own port) with the same page and logo as the devbuild; returns its path. */
function buildVerifyCopy(baseCfg, target, dir, exe) {
  console.log('> Verifying: building a throwaway test copy with the same page and logo');
  const cfg = join(WORK, 'cfg-verify.json');
  writeFileSync(
    cfg,
    JSON.stringify({
      ...baseCfg,
      identifier: APP.identifiers.test,
      bundle: { ...baseCfg.bundle, createUpdaterArtifacts: false },
    }),
  );
  run('npx', ['tauri', 'build', '--no-bundle', '--config', `"${cfg}"`], {
    env: { ...process.env, CARGO_TARGET_DIR: target, CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? '2' },
  });
  mkdirSync(dir, { recursive: true });
  // the program is renamed by mainBinaryName
  const built = [`${APP.devbuild.binary}.exe`, 'keyoverlay.exe']
    .map((n) => join(target, 'release', n))
    .find(existsSync);
  if (!built) throw new Error('could not find the built program in ' + join(target, 'release'));
  copyFileSync(built, exe);
}

/** Starts the test copy with fresh settings (port 7879, no update checks) and the browser inspector on port 9222. */
function startVerifyCopy(exe, dataDir) {
  spawnSync('taskkill', ['/F', '/IM', `${APP.testApps.e2eExe}.exe`], { stdio: 'ignore' });
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    join(dataDir, 'settings.json'),
    JSON.stringify({
      version: 2,
      general: { port: 7879, openOnLaunch: true, autoCheckUpdates: false, lastSeenVersion: version },
      layout: { id: 'tkl', profiles: {} },
    }),
  );
  spawn(exe, [], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222' },
  }).unref();
}

/** Waits (up to 20 seconds) for the test copy's settings window to show up in the inspector's list of pages. */
async function waitForWindow() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const page = (await (await fetch('http://127.0.0.1:9222/json')).json()).find((x) => x.type === 'page');
      if (page) return page;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('the devbuild window never appeared');
}

/** Asks the window whether it loaded: the logo is there and purple, the six tabs are there, and it says "devbuild". */
async function checkWindow(page) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));
  const ask = (expression) =>
    new Promise((resolve) => {
      ws.onmessage = (message) => resolve(JSON.parse(message.data));
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
    });
  const answer =
    await ask(`(async () => { const i = document.querySelector('.brand img'); if (!i || !i.complete || !i.naturalWidth) return { ok: false, why: 'logo missing', url: location.href };
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.drawImage(i, 0, 0, 64, 64); const [R, G, B] = x.getImageData(16, 18, 1, 1).data;
      return { ok: document.querySelectorAll('nav button').length === 6 && R > G && B > R && document.querySelector('.brand').textContent.includes('devbuild'), url: location.href, rgb: [R, G, B], tabs: document.querySelectorAll('nav button').length }; })()`);
  ws.close();
  return answer.result?.result?.value;
}

async function verifyBuild(baseCfg, target) {
  const { acquire } = await import('../tests/lib/lock.mjs');
  const lock = await acquire('devbuild verification (test copy)', { expectedMinutes: 6 });
  const dataDir = join(process.env.APPDATA, APP.identifiers.test);
  const dir = join(WORK, 'verify');
  const exe = join(dir, `${APP.testApps.e2eExe}.exe`);
  try {
    buildVerifyCopy(baseCfg, target, dir, exe);
    startVerifyCopy(exe, dataDir);
    const page = await waitForWindow();
    await sleep(2500);
    const result = await checkWindow(page);
    console.log('  window address:', result?.url, '| logo pixel:', result?.rgb, '| tabs:', result?.tabs);
    if (!result?.ok) throw new Error('VERIFICATION FAILED: ' + JSON.stringify(result));
    console.log('  OK: the settings window loads and the logo is purple');
  } finally {
    spawnSync('taskkill', ['/F', '/IM', `${APP.testApps.e2eExe}.exe`], { stdio: 'ignore' });
    rmSync(dataDir, { recursive: true, force: true });
    lock.release?.();
  }
}

rmSync(WORK, { recursive: true, force: true });
rmSync(UI_TMP, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
try {
  // 1. the devbuild logo, as a full icon set
  console.log('> Drawing the devbuild logo');
  const src = join(WORK, 'icon-devbuild-source.png'),
    icons = join(WORK, 'icons');
  run('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    'tools/make-icon.ps1',
    '-Devbuild',
    '-Out',
    `"${src}"`,
  ]);
  run('npx', ['tauri', 'icon', `"${src}"`, '-o', `"${icons}"`], { stdio: 'ignore' });

  // 2. a copy of the settings page with the purple logo in its header (the real files are not touched)
  const ui = join(UI_TMP, 'ui-settings');
  cpSync(join(ROOT, 'ui/settings'), ui, { recursive: true });
  copyFileSync(join(icons, '64x64.png'), join(ui, 'logo.png'));
  const page = join(ui, 'index.html');
  writeFileSync(page, addDevbuildLabel(readFileSync(page, 'utf8')));

  // 3. build the installer with those icons and that page
  console.log('> Building the installer (about 5 minutes)');
  const baseCfg = {
    identifier: APP.identifiers.devbuild,
    productName: APP.devbuild.productName,
    mainBinaryName: APP.devbuild.binary,
    build: { frontendDist: fwd(relative(join(ROOT, 'src-tauri'), ui)) }, // relative to src-tauri (see UI_TMP above)
    bundle: {
      createUpdaterArtifacts: false,
      icon: [join(icons, '32x32.png'), join(icons, '128x128.png'), join(icons, 'icon.ico')].map(fwd),
    },
  };
  const cfg = join(WORK, 'cfg.json');
  writeFileSync(cfg, JSON.stringify(baseCfg));
  const target = join(WORK, 'target');
  run('npx', ['tauri', 'build', '--bundles', 'nsis', '--config', `"${cfg}"`], {
    env: { ...process.env, CARGO_TARGET_DIR: target, CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? '2' },
  });

  // 4. name it, put it in release/<version>-devbuild/, remove older temporary installers
  const nsis = join(target, 'release/bundle/nsis');
  const built = readdirSync(nsis).find((n) => n.endsWith('-setup.exe'));
  if (verify) await verifyBuild(baseCfg, target);
  const out = join(ROOT, 'release', `${version}-devbuild`);
  for (const old of [`release/${version}-test`, `release/${version}-devbuild`])
    rmSync(join(ROOT, old), { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const file = join(out, `Keystroke-Overlay_${version}-devbuild_x64-setup.exe`);
  copyFileSync(join(nsis, built), file);
  console.log(`\nDevbuild ready: ${file}`);
} finally {
  rmSync(WORK, { recursive: true, force: true });
  rmSync(UI_TMP, { recursive: true, force: true });
}
