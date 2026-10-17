// Writes release/THIRD-PARTY-NOTICES.html: the licence of every open-source library inside the app, which those
// licences ask us to pass on with the installer (docs/RELEASING.md, Third-party notices). The release workflow runs it;
// tools/release.mjs then puts the file in the installer. Settings and the accepted licences: src-tauri/about.toml; the
// page's look: src-tauri/about.hbs. Needs cargo-about: cargo install cargo-about --version 0.9.2 --locked --features cli
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const NOTICES = resolve('release', 'THIRD-PARTY-NOTICES.html');

mkdirSync(resolve('release'), { recursive: true });
// cargo-about stops with an error if a library uses a licence not accepted in about.toml, so nothing unchecked ships
execFileSync('cargo', ['about', 'generate', 'about.hbs', '-o', NOTICES], { cwd: 'src-tauri', stdio: 'inherit' });
console.log(`Wrote ${NOTICES}`);
