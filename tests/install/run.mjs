// Clean-install and upgrade test with REAL installers.
//   node tests/install/run.mjs [--keep]
// Builds the previous release (v1.1.2) and the current code as installers under a throwaway identity
// ("KOTest", com.keyoverlay.test, exe kotest-install.exe), so it can never touch an installed Keystroke Overlay. Then:
//   1. clean install of v1.1.2 -> first launch with no data folder at all
//   2. make some user data, quit
//   3. install the current version OVER it (what an upgrade does) -> settings, layouts and key edits must survive
//   4. use the new version, then uninstall -> program files and the uninstall entry are gone, your data folder stays
// Everything is deleted afterwards unless --keep.
import { spawnSync, spawn, execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  symlinkSync,
  readdirSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { byTest, connect, check, finish, sleep } from '../e2e/lib/cdp.mjs';
import { acquire } from '../lib/lock.mjs';
import { APP } from '../../tools/app-config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)),
  ROOT = resolve(HERE, '../..');
const keep = process.argv.includes('--keep');
const WORK = process.env.INSTALL_WORK ?? join(tmpdir(), 'keyoverlay-install-test');
const INSTALL = join(WORK, 'installed');
const DATA = join(process.env.APPDATA, APP.identifiers.test);
const EXE = join(INSTALL, `${APP.testApps.installExe}.exe`);
const VERSION = JSON.parse(readFileSync(join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8')).version;
// The previous release to upgrade FROM. Default v1.1.2. To test the newest published release:
// INSTALL_OLD=v1.2.0:9016efe:1.2.0  (name:commit:version)
const [oName, oRef, oVer] = (process.env.INSTALL_OLD ?? 'v1.1.2:45456a9:1.1.2').split(':');
const OLD = { name: oName, ref: oRef, version: oVer };
const sh = (cmd, a, o = {}) => spawnSync(cmd, a, { shell: true, stdio: 'inherit', ...o });
const uninstallEntries = () =>
  spawnSync(
    'reg',
    ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', '/s', '/f', APP.testApps.installProduct],
    {
      encoding: 'utf8',
    },
  )
    .stdout.split('\n')
    .filter((l) => l.includes(APP.testApps.installProduct)).length;
// only our uniquely named test exe
const killTest = () =>
  spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', `Stop-Process -Name ${APP.testApps.installExe} -Force -ErrorAction SilentlyContinue`],
    { stdio: 'ignore' },
  );
const alive = () =>
  execSync(
    `powershell.exe -NoProfile -Command "@(Get-Process -Name ${APP.testApps.installExe} -ErrorAction SilentlyContinue).Count"`,
  )
    .toString()
    .trim() !== '0';

function launch() {
  spawn(EXE, [], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222' },
  }).unref();
}
async function build(label, ref) {
  const out = join(WORK, `setup-${label}.exe`);
  if (existsSync(out)) return out;
  console.log(`\n> Building the ${label} installer`);
  let dir = ROOT;
  if (ref) {
    dir = join(WORK, 'src-' + label);
    sh('git', ['worktree', 'add', '--detach', `"${dir}"`, ref], { cwd: ROOT, stdio: 'ignore' });
    try {
      symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'junction');
    } catch {
      /* exists */
    }
  }
  const cfg = join(WORK, 'cfg.json');
  writeFileSync(
    cfg,
    JSON.stringify({
      identifier: APP.identifiers.test,
      productName: APP.testApps.installProduct,
      mainBinaryName: APP.testApps.installExe,
      bundle: { createUpdaterArtifacts: false },
    }),
  );
  const b = sh('npx', ['tauri', 'build', '--bundles', 'nsis', '--config', `"${cfg}"`], {
    cwd: dir,
    env: { ...process.env, CARGO_TARGET_DIR: join(WORK, 'target') },
  });
  if (b.status !== 0) throw new Error('installer build failed for ' + label);
  const nsis = join(WORK, 'target/release/bundle/nsis');
  const f = readdirSync(nsis).find((n) => n.endsWith('-setup.exe'));
  copyFileSync(join(nsis, f), out);
  rmSync(join(nsis, f), { force: true });
  if (ref) {
    rmSync(join(dir, 'node_modules'), { force: true });
    sh('git', ['worktree', 'remove', '--force', `"${dir}"`], { cwd: ROOT, stdio: 'ignore' });
  }
  return out;
}
const installer = (exe) => {
  const r = spawnSync(exe, ['/S', `/D=${INSTALL}`], { stdio: 'ignore' });
  return r.status;
};

await acquire('install and upgrade test', { expectedMinutes: 12 });
mkdirSync(WORK, { recursive: true });
let failed = false;
try {
  for (const port of [7878, 7879, 9222]) {
    /* 7878 may legitimately be the user's real app; only the test ports must be free */ if (port !== 7878) {
      const busy = await fetch(`http://127.0.0.1:${port}/json`)
        .then(() => true)
        .catch(() => false);
      if (busy) throw new Error(`Port ${port} is busy; close what uses it first.`);
    }
  }
  const setupOld = await build('old', OLD.ref);
  const setupNew = await build('new', null);
  killTest();
  rmSync(DATA, { recursive: true, force: true });
  rmSync(INSTALL, { recursive: true, force: true });
  const entriesBefore = uninstallEntries();

  // ---------------------------------------------------------------- 1. clean install of the old version
  console.log(`\n== 1. clean install of ${OLD.name}`);
  check('installer ran silently and succeeded', installer(setupOld) === 0);
  await sleep(1500);
  check('program installed (exe and uninstaller exist)', existsSync(EXE) && existsSync(join(INSTALL, 'uninstall.exe')));
  check('an uninstall entry was registered', uninstallEntries() > entriesBefore);
  check('no data folder exists before the first launch', !existsSync(DATA));
  launch();
  let p = await connect();
  await sleep(2500);
  check(
    'first launch: settings window opens with its tabs',
    (await p.q(`document.querySelectorAll('nav button').length`)) === 6,
  );
  check(
    'first launch created the data folder with settings.json and defaults',
    existsSync(join(DATA, 'settings.json')) &&
      JSON.parse(readFileSync(join(DATA, 'settings.json'), 'utf8')).version === 2,
  );
  const st0 = (await p.invoke('get_state')).ok;
  check(
    `first launch: version is ${OLD.name}, Tenkeyless selected, secure link not present/off`,
    st0.version === OLD.version && st0.settings.layout.id === 'tkl' && !st0.settings.general.secureLink,
  );
  p.close();
  killTest();
  await sleep(1500);

  // ---------------------------------------------------------------- 2. user data made with the old version
  console.log(`\n== 2. user data made with ${OLD.name}`);
  const sj = JSON.parse(readFileSync(join(DATA, 'settings.json'), 'utf8'));
  sj.general.port = 7879;
  sj.general.autoCheckUpdates = false;
  sj.general.openOnLaunch = true;
  sj.style.radius = 21;
  sj.style.keyFill = '#336699ff';
  sj.layout.id = 'mine';
  sj.layout.profiles = { mine: { disabledKeys: ['KeyW'], labels: { Space: 'Jump' } } };
  writeFileSync(join(DATA, 'settings.json'), JSON.stringify(sj));
  mkdirSync(join(DATA, 'layouts'), { recursive: true });
  writeFileSync(
    join(DATA, 'layouts', 'mine.json'),
    JSON.stringify({
      id: 'mine',
      name: 'Mine',
      keys: [
        { code: 'KeyW', label: 'W', x: 1, y: 0 },
        { code: 'KeyA', label: 'A', x: 0, y: 1 },
        { code: 'Space', label: '', x: 0, y: 2, w: 3 },
      ],
    }),
  );
  launch();
  p = await connect();
  await sleep(2500);
  let st = (await p.invoke('get_state')).ok;
  check(
    `${OLD.name} loads the user data`,
    st.settings.layout.id === 'mine' &&
      st.settings.style.radius === 21 &&
      (await p.invoke('list_layouts')).ok.some((l) => l.id === 'mine'),
  );
  p.close();
  killTest();
  await sleep(1500);
  check('the old app is fully stopped before upgrading', !alive());

  // ---------------------------------------------------------------- 3. upgrade over the top
  console.log(`\n== 3. upgrade ${OLD.name} -> v${VERSION}`);
  check('upgrade installer ran silently and succeeded', installer(setupNew) === 0);
  await sleep(1500);
  launch();
  p = await connect();
  await sleep(3000);
  st = (await p.invoke('get_state')).ok;
  check(`the app is now v${VERSION}`, st.version === VERSION);
  check(
    'settings survived (style, selected layout, port)',
    st.settings.style.radius === 21 &&
      st.settings.style.keyFill === '#336699ff' &&
      st.settings.layout.id === 'mine' &&
      st.settings.general.port === 7879,
  );
  check(
    'key edits survived (hidden key + label)',
    JSON.stringify(st.settings.layout.profiles.mine) ===
      JSON.stringify({ disabledKeys: ['KeyW'], labels: { Space: 'Jump' } }),
  );
  check(
    'the layout you made survived and is marked as yours',
    (await p.invoke('list_layouts')).ok.some((l) => l.id === 'mine' && l.user === true),
  );
  check(
    'new settings were filled in with defaults (input method, update channel)',
    st.settings.general.inputMethod === 'hook' && st.settings.general.updateChannel === 'stable',
  );
  check(
    '"What\'s new" popped up after the upgrade with this version\'s notes, then was marked as seen',
    (await p.q(
      `!document.getElementById('modal').hidden && document.getElementById('mTitle').textContent.includes('${VERSION}')`,
    )) && st.settings.general.lastSeenVersion === VERSION,
  );
  check(
    'the overlay page and stream work',
    await fetch('http://localhost:7879/api/config')
      .then((r) => r.ok)
      .catch(() => false),
  );

  // ---------------------------------------------------------------- 4. use it, then uninstall
  console.log('\n== 4. use the new version, then uninstall');
  const made = await p.invoke('create_layout', { name: 'After upgrade' });
  check('new features work on the upgraded install (create layout)', typeof made.ok === 'string');
  check(
    'settings window shows the current UI (dashed + card, General sections)',
    (await p.q(`!!document.querySelector('nav button') && (document.querySelector('nav button').click(), true)`)) &&
      (await p.q(`!!document.querySelector('${byTest('layout-add')}')`)), // the dashed + card on the Layout tab
  );
  p.close();
  killTest();
  await sleep(1500);
  // _?= makes the uninstaller wait for itself
  const un = spawnSync(join(INSTALL, 'uninstall.exe'), ['/S', `_?=${INSTALL}`], { stdio: 'ignore' });
  await sleep(2000);
  check('uninstaller ran silently and succeeded', un.status === 0);
  check('program exe removed', !existsSync(EXE));
  check('uninstall entry removed', uninstallEntries() <= entriesBefore);
  check(
    'your data folder is left alone (settings and layouts are not deleted)',
    existsSync(join(DATA, 'settings.json')) && existsSync(join(DATA, 'layouts', 'mine.json')),
  );
  check('nothing is left running', !alive());
} catch (e) {
  console.error('\nInstall test could not complete:', e.message);
  failed = true;
} finally {
  killTest();
  sh('git', ['worktree', 'prune'], { cwd: ROOT, stdio: 'ignore' });
  rmSync(DATA, { recursive: true, force: true });
  if (!keep) rmSync(WORK, { recursive: true, force: true });
  else console.log('Kept', WORK);
}
if (failed) process.exit(2);
finish();
