// =====================================================================================================================
//  Checks the settings window's language files (ui/settings/locales/<code>.js) against English (en.js): every text a
//  language has must exist in English, keep the same {placeholders}, and be text; a language may leave texts out
//  (they show in English), and the check prints how much each language has. Run by `npm test` and CI.
//  The plan: docs/proposals/interface-languages.md. Exits 1 on a problem.
// =====================================================================================================================

import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { placeholders } from '../ui/settings/words.js';

const DIR = resolve('ui/settings/locales');
const SOURCE = 'en.js';

/** Every text of a language file, flattened to "group.id" → text. @param {Record<string, any>} texts */
export function flatten(texts, prefix = '', out = new Map()) {
  for (const [id, value] of Object.entries(texts)) {
    const path = prefix ? `${prefix}.${id}` : id;
    if (value && typeof value === 'object') flatten(value, path, out);
    else out.set(path, value);
  }
  return out;
}

/** The problems of one language against English. @param {Map<string, any>} english @param {Map<string, any>} language */
export function problemsOf(english, language) {
  const problems = [];
  for (const [path, value] of language) {
    if (!english.has(path)) {
      problems.push(`${path}: not in English (renamed or removed there?)`);
      continue;
    }
    if (typeof value !== 'string') {
      problems.push(`${path}: not a text`);
      continue;
    }
    const wanted = placeholders(english.get(path)).sort().join(', ');
    const got = placeholders(value).sort().join(', ');
    if (wanted !== got) problems.push(`${path}: placeholders {${got}} but English has {${wanted}}`);
  }
  return problems;
}

async function main() {
  const load = async (/** @type {string} */ name) =>
    flatten((await import(pathToFileURL(join(DIR, name)).href)).default);
  const english = await load(SOURCE);
  const problems = [];
  for (const name of readdirSync(DIR).filter((file) => file.endsWith('.js') && file !== SOURCE)) {
    const language = await load(name);
    for (const problem of problemsOf(english, language)) problems.push(`${name}: ${problem}`);
    console.log(`${name}: ${language.size} of ${english.size} texts`);
  }
  if (problems.length) {
    console.error(`Language files: ${problems.length} problem(s)\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log(`language check passed: ${english.size} English texts`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
