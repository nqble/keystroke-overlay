// Enforces the promises in PRIVACY.md. Fails (exit 1) if the code ever:
//   * uses the network anywhere except src-tauri/src/commands/updates.rs
//   * listens on anything but 127.0.0.1, or listens outside server.rs
//   * writes files from the keyboard hook or the overlay server
//   * logs/prints anything (a log line is how keystrokes usually leak)
//   * makes the UI call an external address
// Run:  node tools/check-privacy.mjs      (also runs in CI)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { LOG, NET, WRITE, joinSplitPaths, withoutTestModules } from './privacy-patterns.mjs';

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
// The patterns (NET, WRITE, LOG) are in tools/privacy-patterns.mjs, with tests. This is a tripwire, not a proof.
for (const f of walk('src-tauri/src', ['.rs'])) {
  // test modules may use the disk
  const file = rel(f),
    text = joinSplitPaths(strip(withoutTestModules(readFileSync(f, 'utf8'))));
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

// ------------------------------------------------------------------ the local dev tools (npm run preview, npm run ui-sandbox)
// tools/ is not scanned like the app, so these files get their own narrow rules: they may only listen, and only on
// 127.0.0.1, and they may only use Node's own modules (no network client, no downloads, no packages).
const LOCAL_TOOLS = ['tools/preview.mjs', 'tools/ui-sandbox.mjs'];
const PREVIEW_NETWORK_CLIENT =
  /\b(fetch|XMLHttpRequest|node:https|node:net|node:dgram)\b|https?\.(get|request)\(|new WebSocket\(/;
const PREVIEW_OUTSIDE_IMPORT = /^\s*import\b.*\bfrom\s+['"](?!node:)/;
for (const toolFile of LOCAL_TOOLS) {
  const toolText = strip(readFileSync(toolFile, 'utf8'));
  scan(toolFile, toolText, PREVIEW_NETWORK_CLIENT, (n) =>
    bad(toolFile, n, 'a local dev tool must not make network requests'),
  );
  scan(toolFile, toolText, PREVIEW_OUTSIDE_IMPORT, (n) =>
    bad(toolFile, n, 'a local dev tool may only import Node built-in modules (node:...)'),
  );
  scan(toolFile, toolText, /\.listen\(/, (n, l) => {
    if (!/HOST/.test(l)) bad(toolFile, n, 'a local dev tool must listen on HOST, which must be 127.0.0.1');
  });
  if (!/const HOST = '127\.0\.0\.1';/.test(toolText)) bad(toolFile, 1, "HOST must be exactly '127.0.0.1'");
}
// The sandbox's fake app runs in the browser: it may only ask its own sandbox server (relative addresses).
const fakeAppFile = 'tools/sandbox/fake-app.js';
scan(fakeAppFile, strip(readFileSync(fakeAppFile, 'utf8')), /\bfetch\(\s*['"`](?!\/__sandbox__\/)/, (n) =>
  bad(fakeAppFile, n, 'the sandbox may only fetch its own /__sandbox__/ files'),
);

if (problems.length) {
  console.error(
    'PRIVACY CHECK FAILED\n' +
      problems.map((p) => '  ' + p).join('\n') +
      '\n\nSee PRIVACY.md. If a change is intentional, update PRIVACY.md and this script together.',
  );
  process.exit(1);
}
console.log(
  'privacy check passed: network only in commands/updates.rs, server bound to 127.0.0.1, no file writes in keyboard/server code, no logging, no external UI requests, and local dev tools (preview, UI sandbox) that only listen on 127.0.0.1',
);
