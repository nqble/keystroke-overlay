// Enforces the promises in PRIVACY.md. Fails (exit 1) if the code ever:
//   * uses the network anywhere except src-tauri/src/commands/updates.rs
//   * listens on anything but 127.0.0.1, or listens outside server.rs
//   * writes files from the keyboard hook or the overlay server
//   * logs/prints anything (a log line is how keystrokes usually leak)
//   * makes the UI call an external address
// Run:  node tools/check-privacy.mjs      (also runs in CI)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const walk = (dir, exts, out = []) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => f.endsWith(e))) out.push(p);
  }
  return out;
};
const rel = (p) => relative('.', p).split(sep).join('/');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // ignore comments (they may mention these words)
const problems = [];
const bad = (file, line, msg) => problems.push(`${file}:${line}  ${msg}`);
const scan = (file, text, re, test) =>
  text.split('\n').forEach((l, i) => {
    if (re.test(l)) test(i + 1, l);
  });

// ------------------------------------------------------------------ Rust
const NET = /\b(reqwest|TcpStream|UdpSocket|updater_builder|hyper::client|ureq|isahc|surf)\b|\.updater\(\)/;
const WRITE = /\b(fs::write|fs::copy|fs::rename|File::create|OpenOptions)\b/;
const LOG = /\b(println!|eprintln!|print!|eprint!|dbg!|log::|tracing::|env_logger)/;
for (const f of walk('src-tauri/src', ['.rs'])) {
  // test modules may use the disk
  const file = rel(f),
    text = strip(readFileSync(f, 'utf8').split('#[cfg(test)]')[0]);
  scan(file, text, NET, (n) => {
    if (file !== 'src-tauri/src/commands/updates.rs') bad(file, n, 'network code outside commands/updates.rs');
  });
  scan(file, text, /\b(bind|listen)\(|TcpListener/, (n, l) => {
    if (file !== 'src-tauri/src/server.rs') bad(file, n, 'listening socket outside server.rs');
    else if (/bind\(/.test(l) && !/127\.0\.0\.1/.test(l)) bad(file, n, 'server must bind 127.0.0.1 only');
  });
  scan(file, text, WRITE, (n) => {
    if (/\/keyboard\/|\/server\.rs$/.test(file)) bad(file, n, 'keyboard/server code must never write files');
  });
  scan(file, text, LOG, (n) => bad(file, n, 'logging/printing is not allowed (keystrokes could leak)'));
}

// ------------------------------------------------------------------ front end
for (const f of walk('ui', ['.js', '.html'])) {
  const file = rel(f),
    text = readFileSync(f, 'utf8');
  scan(file, text, /https?:\/\/(?!localhost|127\.0\.0\.1|www\.w3\.org)/, (n, l) => {
    if (!/^\s*(\/\/|\*|<!--)/.test(l)) bad(file, n, 'external address in the UI: ' + l.trim().slice(0, 80));
  });
  scan(file, text, /\b(sendBeacon|XMLHttpRequest|navigator\.sendBeacon|gtag|analytics)\b/i, (n) =>
    bad(file, n, 'tracking/XHR API in the UI'),
  );
  scan(file, text, /\bfetch\(\s*['"`]https?:/, (n) => bad(file, n, 'fetch() to an absolute address'));
}

// ------------------------------------------------------------------ the preview tool (npm run preview)
// tools/ is not scanned like the app, so this one file gets its own narrow rules: it may only listen, and only on
// 127.0.0.1, and it may only use Node's own modules (no network client, no downloads, no packages).
const previewFile = 'tools/preview.mjs';
const previewText = strip(readFileSync(previewFile, 'utf8'));
const PREVIEW_NETWORK_CLIENT =
  /\b(fetch|XMLHttpRequest|node:https|node:net|node:dgram)\b|https?\.(get|request)\(|new WebSocket\(/;
const PREVIEW_OUTSIDE_IMPORT = /^\s*import\b.*\bfrom\s+['"](?!node:)/;
scan(previewFile, previewText, PREVIEW_NETWORK_CLIENT, (n) =>
  bad(previewFile, n, 'the preview tool must not make network requests'),
);
scan(previewFile, previewText, PREVIEW_OUTSIDE_IMPORT, (n) =>
  bad(previewFile, n, 'the preview tool may only import Node built-in modules (node:...)'),
);
scan(previewFile, previewText, /\.listen\(/, (n, l) => {
  if (!/HOST/.test(l)) bad(previewFile, n, 'the preview tool must listen on HOST, which must be 127.0.0.1');
});
if (!/const HOST = '127\.0\.0\.1';/.test(previewText)) bad(previewFile, 1, "HOST must be exactly '127.0.0.1'");

if (problems.length) {
  console.error(
    'PRIVACY CHECK FAILED\n' +
      problems.map((p) => '  ' + p).join('\n') +
      '\n\nSee PRIVACY.md. If a change is intentional, update PRIVACY.md and this script together.',
  );
  process.exit(1);
}
console.log(
  'privacy check passed: network only in commands/updates.rs, server bound to 127.0.0.1, no file writes in keyboard/server code, no logging, no external UI requests, and a preview tool that only listens on 127.0.0.1',
);
