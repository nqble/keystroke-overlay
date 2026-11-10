// `npm run translate -- <code>…`: translates the settings window's English texts (ui/settings/locales/en.js) into
// ui/settings/locales/<code>.js with the service tools/translate-engines.json names for that language. Only texts that
// are new, or whose English changed, are sent; a text a person corrected (`made.reviewed`) is never sent again. Run by
// hand on a computer with the services' keys, never by the app (the app's only network use stays the update check).
//   npm run translate -- de fr                       translate German and French
//   npm run translate -- de --dry-run                say what would be sent, send nothing
//   npm run translate -- de --all                    send every text again (not the reviewed ones)
//   npm run translate -- de --glossary <file.tbx>    with Microsoft's terminology (docs/TRANSLATIONS.md, "Glossary")
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ENGINES } from './translate-engines.mjs';
import {
  back,
  byGroup,
  completePlurals,
  contextFor,
  fingerprint,
  flatTexts,
  glossaryFromTbx,
  groupContexts,
  textNotes,
  languageFile,
  nest,
  protect,
  sameMarks,
  sourceTexts,
  termsIn,
  toTranslate,
} from './translate-text.mjs';

const LOCALES = resolve('ui/settings/locales');
const TABLE = JSON.parse(readFileSync(resolve('tools/translate-engines.json'), 'utf8'));

/** The command line: language codes, and the two options. */
function readArguments(/** @type {string[]} */ args) {
  const glossaryAt = args.indexOf('--glossary');
  const glossary = glossaryAt === -1 ? null : args[glossaryAt + 1];
  const glossaryFile = glossaryAt === -1 ? -1 : glossaryAt + 1; // the file named after --glossary is not a code
  const codes = args.filter((arg, index) => !arg.startsWith('--') && index !== glossaryFile);
  return { codes, glossary, dryRun: args.includes('--dry-run'), all: args.includes('--all') };
}

/** A module, loaded fresh (an earlier run in this process may have written it). */
const load = async (/** @type {string} */ file) => import(`${pathToFileURL(file).href}?read=${Date.now()}`);

/** The language file as it is now: its texts (flat ids) and what `made` says; empty for a new language. */
async function currentFile(/** @type {string} */ file) {
  if (!existsSync(file)) return { texts: new Map(), made: { reviewed: [], sources: {} } };
  const module = await load(file);
  return { texts: flatTexts(module.default ?? {}), made: { reviewed: [], sources: {}, ...module.made } };
}

/** Send the texts one group at a time, each with its context, and keep each translation that came back whole. */
async function translateTexts(/** @type {string[]} */ ids, /** @type {Map<string, string>} */ sources, setup) {
  const kept = new Map();
  const broken = [];
  for (const [requestIds, context] of requests(ids, setup)) {
    const result = await translateGroup(requestIds, sources, { ...setup, context });
    for (const [id, text] of result.kept) kept.set(id, text);
    broken.push(...result.broken);
  }
  return { kept, broken };
}

/**
 * The requests to send: each group's texts together with the group's context, and each text with its own note
 * (`// means:` in en.js) alone with that note, since a service takes one context per request.
 */
function requests(/** @type {string[]} */ ids, setup) {
  const list = [];
  for (const [group, groupIds] of byGroup(ids)) {
    const plain = groupIds.filter((id) => !setup.notes.has(id));
    const noted = groupIds.filter((id) => setup.notes.has(id));
    if (plain.length) list.push([plain, contextFor(group, setup.contexts)]);
    for (const id of noted) list.push([[id], contextFor(id, setup.contexts, setup.notes)]);
  }
  return list;
}

/** One request's texts, with its context. */
async function translateGroup(/** @type {string[]} */ ids, /** @type {Map<string, string>} */ sources, setup) {
  const sent = ids.map((id) => protect(/** @type {string} */ (sources.get(id))));
  const terms = setup.glossary
    ? termsIn(
        sent.map((one) => one.sent),
        setup.glossary,
      )
    : new Map();
  const answers = await ENGINES[setup.engine](
    sent.map((one) => one.sent),
    setup.target,
    terms,
    setup.context,
  );
  const kept = new Map();
  const broken = [];
  ids.forEach((id, index) => {
    const restored = back(answers[index], sent[index].names);
    if (restored && sameMarks(/** @type {string} */ (sources.get(id)), restored)) kept.set(id, restored);
    else broken.push(id);
  });
  return { kept, broken };
}

/** The file's new contents: English's ids in English's order, fingerprints only for texts English still has. */
function updatedFile(sources, current, kept, engine) {
  const texts = completePlurals(new Map([...current.texts, ...kept]), sources);
  const fingerprints = {};
  for (const [id, english] of sources) {
    if (!texts.has(id)) continue; // e.g. a plural left out whole
    if (kept.has(id)) fingerprints[id] = fingerprint(english);
    else if (current.made.sources[id]) fingerprints[id] = current.made.sources[id];
  }
  const made = { engine, reviewed: current.made.reviewed, sources: fingerprints };
  return languageFile(nest(texts, [...sources.keys()]), made);
}

/** One language, from its line in translate-engines.json to its file. */
async function translateLanguage(
  /** @type {string} */ code,
  /** @type {{ glossary: string | null, dryRun: boolean, all: boolean }} */ options,
) {
  const line = TABLE[code];
  if (!line) throw new Error(`${code} has no line in tools/translate-engines.json`);
  const englishFile = join(LOCALES, 'en.js');
  const sources = sourceTexts((await load(englishFile)).default, code);
  const file = join(LOCALES, `${code}.js`);
  const current = await currentFile(file);
  // --all: send every text again (but never a reviewed one), as if none had been translated
  const made = options.all ? { ...current.made, sources: {} } : current.made;
  const ids = toTranslate(sources, current.texts, made);
  console.log(`${code}: ${ids.length} of ${sources.size} texts to send to ${line.engine}`);
  if (options.dryRun || !ids.length) return;
  const glossary = options.glossary ? glossaryFromTbx(readFileSync(options.glossary, 'utf8'), line.glossary) : null;
  const englishSource = readFileSync(englishFile, 'utf8');
  const contexts = groupContexts(englishSource);
  const notes = textNotes(englishSource);
  const setup = { engine: line.engine, target: line.target, glossary, contexts, notes };
  const { kept, broken } = await translateTexts(ids, sources, setup);
  writeFileSync(file, updatedFile(sources, current, kept, line.engine));
  execFileSync(process.execPath, [resolve('node_modules/prettier/bin/prettier.cjs'), '--write', file], {
    stdio: 'ignore',
  });
  console.log(`${code}: ${kept.size} translated, written to ui/settings/locales/${code}.js`);
  if (broken.length)
    console.log(`${code}: kept in English (a placeholder or ** came back broken): ${broken.join(', ')}`);
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  if (!options.codes.length) throw new Error(`Which language? One of: ${Object.keys(TABLE).join(', ')}`);
  for (const code of options.codes) await translateLanguage(code, options);
}

main().catch((problem) => {
  console.error(problem instanceof Error ? problem.message : problem);
  process.exit(1);
});
