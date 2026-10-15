// Builds a DEVBUILD: a temporary installer for your own testing. It is never published and is not signed for updates.
//   npm run devbuild
//
// What makes it a devbuild:
//   * the file is named  Keystroke-Overlay_<version>-devbuild_x64-setup.exe   (in release/<version>-devbuild/)
//   * it uses the official devbuild logo: the normal logo in black and purple (installer, program icon, tray, window
//     and the logo in the settings header). Nothing in the project's own files changes; the recoloured copies live in TEMP.
//   * it installs over a normal install (same app identity), so your settings and layouts carry over.
// Everything temporary is deleted afterwards, and any older devbuild / test installer folders are removed.
import { spawnSync } from 'node:child_process';
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8')).version;
const WORK = join(tmpdir(), 'keyoverlay-devbuild');
const run = (cmd, args, opts = {}) => { const r = spawnSync(cmd, args, { cwd: ROOT, shell: true, stdio: 'inherit', ...opts }); if (r.status !== 0) throw new Error(`${cmd} ${args[0] ?? ''} failed`); };

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
try {
  // 1. the devbuild logo, as a full icon set
  console.log('> Drawing the devbuild logo');
  const src = join(WORK, 'icon-devbuild-source.png'), icons = join(WORK, 'icons');
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tools/make-icon.ps1', '-Devbuild', '-Out', `"${src}"`]);
  run('npx', ['tauri', 'icon', `"${src}"`, '-o', `"${icons}"`], { stdio: 'ignore' });

  // 2. a copy of the settings page with the purple logo in its header (the real files are not touched)
  const ui = join(WORK, 'ui-settings');
  cpSync(join(ROOT, 'ui/settings'), ui, { recursive: true });
  copyFileSync(join(icons, '64x64.png'), join(ui, 'logo.png'));

  // 3. build the installer with those icons and that page
  console.log('> Building the installer (about 5 minutes)');
  const cfg = join(WORK, 'cfg.json');
  writeFileSync(cfg, JSON.stringify({
    build: { frontendDist: ui.replace(/\\/g, '/') },
    bundle: { createUpdaterArtifacts: false, icon: [join(icons, '32x32.png'), join(icons, '128x128.png'), join(icons, 'icon.ico')].map(p => p.replace(/\\/g, '/')) },
  }));
  const target = join(WORK, 'target');
  run('npx', ['tauri', 'build', '--bundles', 'nsis', '--config', `"${cfg}"`], { env: { ...process.env, CARGO_TARGET_DIR: target, CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? '2' } });

  // 4. name it, put it in release/<version>-devbuild/, remove older temporary installers
  const nsis = join(target, 'release/bundle/nsis');
  const built = readdirSync(nsis).find(n => n.endsWith('-setup.exe'));
  const out = join(ROOT, 'release', `${version}-devbuild`);
  for (const old of ['release/' + version + '-test', 'release/' + version + '-devbuild']) rmSync(join(ROOT, old), { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const file = join(out, `Keystroke-Overlay_${version}-devbuild_x64-setup.exe`);
  copyFileSync(join(nsis, built), file);
  console.log(`\nDevbuild ready: ${file}`);
} finally {
  rmSync(WORK, { recursive: true, force: true });
}
