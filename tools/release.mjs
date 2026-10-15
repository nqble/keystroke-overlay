// Builds a signed installer and writes the files to upload to a GitHub Release.
//   npm run release -- "What changed in this version"          (installs in-app; x.y.0 versions also go to Stable)
//   npm run release -- --manual "What changed"                  (user must run the setup .exe)
// Output: release/<ver>/Keystroke-Overlay_<ver>_x64-setup.exe  +  release/<ver>/latest.json
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const REPO = 'nqble/keystroke-overlay';
const KEY = join(homedir(), '.keystroke-overlay-keys', 'updater.key'); // keep OUT of the project/OneDrive
// build output (large, not synced)
const TARGET = process.env.CARGO_TARGET_DIR ?? join(homedir(), 'keyoverlay-target');
// On GitHub the key comes from the TAURI_SIGNING_PRIVATE_KEY secret; on your PC it is read from the key file above.
const keyText = process.env.TAURI_SIGNING_PRIVATE_KEY || (existsSync(KEY) ? readFileSync(KEY, 'utf8') : null);
// --manual: this update can't be applied in-app; the app will send users to the GitHub installer instead.
// Stable/Latest is decided by the version number (see docs/RELEASING.md): x.y.0 -> also writes stable.json.
const args = process.argv.slice(2),
  manual = args.includes('--manual');
const notes = args.filter((a) => !a.startsWith('--')).join(' ') || 'Bug fixes and improvements.';

if (!keyText) {
  console.error('Signing key not found: set TAURI_SIGNING_PRIVATE_KEY or create ' + KEY);
  process.exit(1);
}
const version = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;
// Versioning rule: x.Y.0 releases (the middle number went up) are STABLE; x.y.Z patch releases are Latest-only.
// --stable / --latest-only override the rule for the rare exception.
const stable = args.includes('--stable') || (!args.includes('--latest-only') && /^\d+\.\d+\.0$/.test(version));

execSync('npx tauri build', {
  stdio: 'inherit',
  env: {
    ...process.env,
    CARGO_TARGET_DIR: TARGET,
    TAURI_SIGNING_PRIVATE_KEY: keyText,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '',
  },
});

const dir = join(TARGET, 'release', 'bundle', 'nsis');
const src = join(dir, `Keystroke Overlay_${version}_x64-setup.exe`);
const name = `Keystroke-Overlay_${version}_x64-setup.exe`; // no spaces: GitHub rewrites spaces in asset names
const out = join('release', version); // release/<version>/ so older versions are never overwritten
mkdirSync(out, { recursive: true });
copyFileSync(src, join(out, name));
const signature = readFileSync(src + '.sig', 'utf8').trim();
const manifest = JSON.stringify(
  {
    version,
    notes,
    ...(manual && { manual: true, manual_url: `https://github.com/${REPO}/releases/tag/v${version}` }),
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': { signature, url: `https://github.com/${REPO}/releases/download/v${version}/${name}` },
    },
  },
  null,
  2,
);
writeFileSync(join(out, 'latest.json'), manifest); // Latest channel: upload with every release
if (stable) writeFileSync(join(out, 'stable.json'), manifest); // Stable channel: only when promoting
console.log(
  `\nDone. Upload release/${version}/${name} and release/${version}/latest.json to a GitHub release tagged v${version}.` +
    (stable
      ? `
STABLE: also upload release/${version}/stable.json to the release tagged channel-stable (replace the old stable.json).`
      : '') +
    `
`,
);
