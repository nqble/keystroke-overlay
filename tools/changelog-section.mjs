// Prints one version's entry from CHANGELOG.md, ready to use as GitHub release notes.
//   node tools/changelog-section.mjs 1.2.0            full notes ("**v1.2.0 — title**" + the bullets)
//   node tools/changelog-section.mjs 1.2.0 --title    just the title line text (used as the update manifest's short
//   note)
// Fails (exit 1) if the version has no entry, so a release can't go out without notes, or if the entry's sections
// break the release notes format (ui/settings/release-notes.js, docs/RELEASING.md), so every release reads the same.
import { readFileSync } from 'node:fs';
import { sectionProblems } from '../ui/settings/release-notes.js';

// Added under every release's notes, so the entries in CHANGELOG.md don't repeat it.
const KEPT_LINE = 'Your settings, layouts, presets and fonts are kept.';

const [version, flag] = process.argv.slice(2);
if (!version) {
  console.error('usage: node tools/changelog-section.mjs <version> [--title]');
  process.exit(1);
}
const lines = readFileSync('CHANGELOG.md', 'utf8').replace(/\r/g, '').split('\n');
const start = lines.findIndex((l) => l.startsWith(`## v${version} `) || l.trim() === `## v${version}`);
if (start < 0) {
  console.error(`CHANGELOG.md has no entry for v${version}. Add one first.`);
  process.exit(1);
}
let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
if (end < 0) end = lines.length;

// "## v1.2.0 — the first Stable release *(unreleased)*"  ->  "v1.2.0 — the first Stable release"
const title = lines[start]
  .replace(/^##\s*/, '')
  .replace(/\s*\*\(unreleased\)\*\s*$/, '')
  .trim();
if (flag === '--title') {
  console.log(title);
  process.exit(0);
}
const body = lines
  .slice(start + 1, end)
  .join('\n')
  .trim();
const problems = sectionProblems(body);
if (problems.length) {
  console.error(`CHANGELOG.md v${version}: the release notes format is not followed (docs/RELEASING.md):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`**${title}**\n\n${body}\n\n${KEPT_LINE}`);
