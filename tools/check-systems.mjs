// Every-system check (runs with npm test): text in the settings window must not name Windows-only things (Windows,
// Ctrl, tray, Segoe) on its own, because the same window runs on a Mac and on Linux. Such words belong in
// ui/settings/system-words.js, which has each system's own word. A line that really is for one system only (a step in
// the Windows instructions, a saved value that is never shown) says so with a "// per-system: why" comment.
// Only text inside quotes is checked, so comments and code names don't count, and joined names like
// "minimize-to-tray" (a data-test hook) don't either. See CLAUDE.md §4 (Every system).
//   node tools/check-systems.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = 'ui/settings';
const SKIP = new Set(['vendor', 'system-words.js']); // vendor: copied libraries; system-words.js: where these words belong
const WINDOWS_WORDS = /(?<![-\w])(Windows|Ctrl|[Tt]ray|Segoe)(?!\w)/; // "-tray" at the end of a hook name is not text
const QUOTED = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
const PLACEHOLDER = /\$\{[^}]*\}/g;
const EXEMPT = /\/\/ per-system: /;
const COMMENT_LINE = /^\s*(\/\/|\/?\*)/;

// Waiting for a change already planned. Remove a line when that change lands (it then has to pass like the rest).
const PENDING = new Map([['ui/settings/controls.js', 'the Mac font list (macOS port, item 10, on mac/port)']]);

/** The Windows-only words in quoted text on one line of code, or [] when there are none or the line is exempt. */
export function windowsWordsIn(line) {
  if (COMMENT_LINE.test(line) || EXEMPT.test(line)) return [];
  const quoted = line.match(QUOTED) ?? [];
  const shown = quoted.map((text) => text.replace(PLACEHOLDER, '')); // ${name} is code, not text
  const found = shown.map((text) => text.match(WINDOWS_WORDS)?.[1]);
  return found.filter(Boolean);
}

function filesUnder(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) filesUnder(path, out);
    else if (path.endsWith('.js')) out.push(path);
  }
  return out;
}

function problemsIn(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const problems = [];
  lines.forEach((line, index) => {
    for (const word of windowsWordsIn(line)) problems.push(`${file}:${index + 1}  "${word}" is a Windows word`);
  });
  return problems;
}

function main() {
  const files = filesUnder(ROOT).filter((file) => !PENDING.has(file.replaceAll('\\', '/')));
  const problems = files.flatMap(problemsIn);
  if (problems.length) {
    console.error('EVERY-SYSTEM CHECK FAILED\n  ' + problems.join('\n  '));
    console.error('\nUse the word for each system from ui/settings/system-words.js, or mark a line that is truly');
    console.error('for one system with "// per-system: why".');
    process.exit(1);
  }
  console.log(`every-system check passed: no Windows-only words in the settings window (${PENDING.size} file pending)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
