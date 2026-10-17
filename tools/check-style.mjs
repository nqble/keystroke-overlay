// Basic code-style check (runs in CI): no tab characters, no trailing spaces, and every file ends with a newline.
// Also: the settings window's stylesheet may only write colours inside its :root block (the design tokens).
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
  if (/^ui[\\/]settings[\\/][^\\/]+\.css$/.test(file)) checkTokens(file, text);
  if (
    /^ui[\\/]settings[\\/]((tabs|editor)[\\/])?[^\\/]+\.js$/.test(file) &&
    !JS_STYLE_EXEMPT.has(file.replace(/\\/g, '/'))
  )
    checkJsStyles(file, text);
}

// Files still allowed to set inline styles from JavaScript: debug.js, the developer tab.
const JS_STYLE_EXEMPT = new Set(['ui/settings/debug.js']);

/** In the settings window's scripts, looks live in CSS. JavaScript may only hand CSS a variable: el.style.setProperty('--x', ...). */
function checkJsStyles(file, text) {
  text.split(/\r?\n/).forEach((line, i) => {
    const direct = line.match(/(?<!settings|\bprofile)\.style\.(?!setProperty)\w+\s*=[^=]/);
    const attribute = line.match(/\bstyle:\s*['"`]/);
    const assigned = line.match(/Object\.assign\((?!settings\.|profile)[\w.]*\.style\b/);
    const found = direct ?? attribute ?? assigned;
    if (found)
      problems.push(
        `${file}:${i + 1}: inline style from JavaScript (${found[0].trim()}); use a CSS class or el.style.setProperty('--name', value)`,
      );
  });
}

/** In the settings stylesheet a colour (#hex, rgb(), rgba()) is allowed only inside the :root block of design tokens. */
function checkTokens(file, text) {
  // blank out comments (keeping the line breaks, so line numbers stay right) and the :root block
  const blank = (part) => part.replace(/[^\n]/g, ' ');
  const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  const rootStart = withoutComments.indexOf(':root');
  const rootEnd = rootStart < 0 ? 0 : withoutComments.indexOf('}', rootStart) + 1;
  const outside =
    withoutComments.slice(0, Math.max(rootStart, 0)) +
    blank(withoutComments.slice(Math.max(rootStart, 0), rootEnd)) +
    withoutComments.slice(rootEnd);
  outside.split('\n').forEach((line, i) => {
    const colour = line.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    if (colour) problems.push(`${file}:${i + 1}: raw colour ${colour[0]} outside :root (use a design token)`);
  });
}

for (const r of ROOTS) walk(r);
if (problems.length) {
  console.error(
    problems.slice(0, 40).join('\n') + (problems.length > 40 ? `\n... and ${problems.length - 40} more` : ''),
  );
  console.error(`\nstyle check failed: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('style check passed: no tabs, no trailing whitespace, files end with a newline');
