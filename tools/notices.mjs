// Writes release/THIRD-PARTY-NOTICES.html: the license of every open-source library inside the app, which those
// licenses ask us to pass on with the installer (docs/RELEASING.md, Third-party notices). The release workflow runs it;
// tools/release.mjs then puts the file in the installer. Settings and the accepted licenses: src-tauri/about.toml; the
// page's look: src-tauri/about.hbs. For the Mac app: --target aarch64-apple-darwin lists the libraries in that build
// (about.toml's own target is the Windows one), and --out says where to write. Needs cargo-about: cargo install cargo-about --version 0.9.2 --locked --features cli
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const target = valueOf('--target'); // a Rust target triple; without it about.toml's own targets are used
const NOTICES = resolve(valueOf('--out') ?? 'release/THIRD-PARTY-NOTICES.html');

mkdirSync(dirname(NOTICES), { recursive: true });
// cargo-about stops with an error if a library uses a license not accepted in about.toml, so nothing unchecked ships
const targetFlags = target ? ['--target', target] : [];
execFileSync('cargo', ['about', 'generate', ...targetFlags, 'about.hbs', '-o', NOTICES], {
  cwd: 'src-tauri',
  stdio: 'inherit',
});
// The Linux AppImage also carries AppImage's start-up program (tools/linux/AppRun-x86_64, MIT), which is not a Rust
// library, so cargo-about doesn't know it: its notice is added here, word for word from tools/linux/AppRun.LICENSE.txt.
if (target?.includes('linux')) addAppRunNotice();
console.log(`Wrote ${NOTICES}`);

function addAppRunNotice() {
  const escape = (/** @type {string} */ text) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const license = readFileSync(resolve('tools/linux/AppRun.LICENSE.txt'), 'utf8');
  const section =
    "<h2 id='apprun'>AppRun (the AppImage's start-up program)</h2>\n" +
    "<p>From the AppImage project (<a href='https://github.com/AppImage/AppImageKit'>AppImageKit</a>), in the Linux " +
    'AppImage only.</p>\n' +
    `<pre>${escape(license)}</pre>\n`;
  const page = readFileSync(NOTICES, 'utf8');
  writeFileSync(NOTICES, page.replace('</body>', `${section}</body>`));
}
