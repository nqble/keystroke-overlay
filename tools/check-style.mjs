// Basic code-style check (runs in CI): no tab characters, no trailing spaces, and every file ends with a newline.
// It checks only things every editor can get right, so it never fights with anyone's formatter.
//   node tools/check-style.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOTS = ['src-tauri/src', 'ui', 'tools', 'tests'];
const EXT = new Set(['.rs', '.js', '.mjs', '.css', '.html', '.ps1']);
const SKIP = new Set(['node_modules', 'target']);
const problems = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (EXT.has(extname(p))) check(p);
  }
}
function check(file) {
  const text = readFileSync(file, 'utf8');
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes('\t')) problems.push(`${file}:${i + 1}: tab character (use spaces)`);
    if (/\s$/.test(line)) problems.push(`${file}:${i + 1}: trailing whitespace`);
  });
  if (text.length && !text.endsWith('\n')) problems.push(`${file}: missing newline at end of file`);
}

for (const r of ROOTS) walk(r);
if (problems.length) {
  console.error(problems.slice(0, 40).join('\n') + (problems.length > 40 ? `\n... and ${problems.length - 40} more` : ''));
  console.error(`\nstyle check failed: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('style check passed: no tabs, no trailing whitespace, files end with a newline');
