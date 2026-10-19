// Keeps the documentation tidy (runs in CI):
//   * every markdown file lives in a place the placement table in CLAUDE.md allows;
//   * every file in docs/ and docs/for-claude/ is listed in that folder's README;
//   * every relative link in a markdown file points at something that exists;
//   * the docs and the app's own text follow the wording rules in docs/DOCS-STYLE.md (tools/word-rules.mjs).
//   node tools/check-docs.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { wordProblems } from './word-rules.mjs';

const SKIP = new Set(['node_modules', 'target', '.git', 'release', 'vendor']); // vendor: copied libraries, kept as copied
const problems = [];

/** Every markdown file in the repository, as forward-slash paths relative to the root. */
function markdownFiles(dir = '.') {
  const found = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...markdownFiles(path));
    else if (name.endsWith('.md')) found.push(relative('.', path).split(sep).join('/'));
  }
  return found;
}

// Where a markdown file may live. Anything else is a new document in the wrong place: put it in docs/for-claude/.
const ROOT_FILES = new Set([
  'README.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'PRIVACY.md',
  'CODE_OF_CONDUCT.md',
  'CLAUDE.md',
]);
const allowed = (file) =>
  ROOT_FILES.has(file) ||
  file === 'tests/README.md' ||
  file === 'assets/logo/README.md' || // how the logo files are made, next to them
  file.startsWith('.github/') ||
  /^docs\/[^/]+\.md$/.test(file) ||
  file.startsWith('docs/decisions/') ||
  file.startsWith('docs/design/') ||
  file.startsWith('docs/for-claude/');

const files = markdownFiles();
for (const file of files)
  if (!allowed(file))
    problems.push(`${file}: a markdown file in the wrong place (new working documents go in docs/for-claude/)`);

// Every file in docs/ (and docs/for-claude/) must be named in that folder's README.
function mustBeListed(folder, readme, skip = () => false) {
  if (!existsSync(readme)) return problems.push(`${readme}: missing`);
  const index = readFileSync(readme, 'utf8');
  for (const file of files) {
    if (!file.startsWith(folder) || file === readme || skip(file)) continue;
    const local = file.slice(folder.length);
    if (!index.includes(`(${local})`) && !index.includes(`(${local.replace(/^\.\//, '')})`))
      problems.push(`${file}: not listed in ${readme}`);
  }
}
mustBeListed(
  'docs/',
  'docs/README.md',
  (file) =>
    file.startsWith('docs/for-claude/') || file.startsWith('docs/decisions/') || file.startsWith('docs/design/'),
);
mustBeListed('docs/for-claude/', 'docs/for-claude/README.md');

// Relative links must point at something that exists.
const link = /\]\(([^)\s#]+)(#[^)\s]*)?\)/g;
for (const file of files) {
  const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, ''); // links inside code blocks are examples
  for (const match of text.matchAll(link)) {
    const target = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) continue;
    const here = resolve(dirname(file), target);
    const outsideRepo = relative(resolve('.'), here).startsWith('..'); // GitHub web paths such as ../../releases
    // links written for GitHub issue text (the draft tickets) are relative to the repository root
    if (!outsideRepo && !existsSync(here) && !existsSync(resolve('.', target)))
      problems.push(`${file}: broken link to ${target}`);
  }
}

// The wording rules: every doc except the CHANGELOG's history and DOCS-STYLE.md (which names the words to avoid), and
// the text people see in the app.
const APP_TEXT = ['ui/settings/index.html', 'src-tauri/src/tray.rs'];
const appScripts = (dir) =>
  readdirSync(dir, { recursive: true })
    .map((name) => join(dir, name).split(sep).join('/'))
    .filter((path) => path.endsWith('.js') && !path.includes('/vendor/'));
const NOT_WORDED = new Set(['CHANGELOG.md', 'docs/DOCS-STYLE.md']);
const worded = [...files.filter((file) => !NOT_WORDED.has(file)), ...APP_TEXT, ...appScripts('ui')];
for (const file of worded) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      for (const problem of wordProblems(line)) problems.push(`${file}:${index + 1}: ${problem}`);
    });
}

if (problems.length) {
  console.error(
    problems.slice(0, 40).join('\n') + (problems.length > 40 ? `\n... and ${problems.length - 40} more` : ''),
  );
  console.error(`\ndocs check failed: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(
  `docs check passed: ${files.length} markdown files, all in the right place, listed and with working links; wording rules kept`,
);
