// Writes release/THIRD-PARTY-NOTICES.html: the licence of every open-source library inside the app, which those
// licences ask us to pass on with the installer (docs/RELEASING.md, Third-party notices). The release workflow runs it;
// tools/release.mjs then puts the file in the installer. Settings and the accepted licences: src-tauri/about.toml; the
// page's look: src-tauri/about.hbs. For the Mac app: --target aarch64-apple-darwin lists the libraries in that build
// (about.toml's own target is the Windows one), and --out says where to write. Needs cargo-about: cargo install cargo-about --version 0.9.2 --locked --features cli
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const target = valueOf('--target'); // a Rust target triple; without it about.toml's own targets are used
const NOTICES = resolve(valueOf('--out') ?? 'release/THIRD-PARTY-NOTICES.html');

mkdirSync(dirname(NOTICES), { recursive: true });
// cargo-about stops with an error if a library uses a licence not accepted in about.toml, so nothing unchecked ships
const targetFlags = target ? ['--target', target] : [];
execFileSync('cargo', ['about', 'generate', ...targetFlags, 'about.hbs', '-o', NOTICES], {
  cwd: 'src-tauri',
  stdio: 'inherit',
});
console.log(`Wrote ${NOTICES}`);
