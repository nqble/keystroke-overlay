// Builds a signed installer and writes the files to upload to a GitHub Release.
//   npm run release -- "What changed in this version"          (normal, installs in-app)
//   npm run release -- --manual "What changed"                  (user must run the setup .exe)
// Output: release/Keystroke-Overlay_<ver>_x64-setup.exe  +  release/latest.json
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const REPO = 'nqble/keystroke-overlay';
const KEY = join(homedir(), '.keystroke-overlay-keys', 'updater.key');   // keep OUT of the project/OneDrive
const TARGET = join(homedir(), 'keyoverlay-target');                    // build output (large, not synced)
// --manual: this update can't be applied in-app; the app will send users to the GitHub installer instead.
const args = process.argv.slice(2), manual = args.includes('--manual');
const notes = args.filter(a => a !== '--manual').join(' ') || 'Bug fixes and improvements.';

if (!existsSync(KEY)) { console.error('Signing key not found at ' + KEY); process.exit(1); }
const version = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;

execSync('npx tauri build', {
  stdio: 'inherit',
  env: { ...process.env, CARGO_TARGET_DIR: TARGET, TAURI_SIGNING_PRIVATE_KEY: readFileSync(KEY, 'utf8'), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' },
});

const dir = join(TARGET, 'release', 'bundle', 'nsis');
const src = join(dir, `Keystroke Overlay_${version}_x64-setup.exe`);
const name = `Keystroke-Overlay_${version}_x64-setup.exe`;   // no spaces: GitHub rewrites spaces in asset names
mkdirSync('release', { recursive: true });
copyFileSync(src, join('release', name));
const signature = readFileSync(src + '.sig', 'utf8').trim();
writeFileSync(join('release', 'latest.json'), JSON.stringify({
  version, notes, ...(manual && { manual: true, manual_url: `https://github.com/${REPO}/releases/tag/v${version}` }), pub_date: new Date().toISOString(),
  platforms: { 'windows-x86_64': { signature, url: `https://github.com/${REPO}/releases/download/v${version}/${name}` } },
}, null, 2));
console.log(`\nDone. Upload release/${name} and release/latest.json to a GitHub release tagged v${version}.`);
