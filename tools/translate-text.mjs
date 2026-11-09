// The parts of `npm run translate` (tools/translate.mjs) that need no network: what to translate, keeping placeholders
// safe while a service translates, plural forms, the glossary, and writing the language file. Plain functions, tested
// by tests/ui/translate.test.mjs. How translations work: docs/TRANSLATIONS.md.
import { createHash } from 'node:crypto';
import { isPlural, placeholders } from '../ui/settings/words.js';

/** A placeholder while a service translates: `{name}` becomes ⟦0⟧, which every service tested leaves alone. */
const TOKEN = (/** @type {number} */ index) => `⟦${index}⟧`;
const TOKENS = /⟦(\d+)⟧/g;

/** A short fingerprint of an English text, saved with its translation so a changed English text is noticed. */
export function fingerprint(/** @type {string} */ text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 8);
}

/** `{name}` → ⟦0⟧ before sending; `back` puts the names back. @param {string} text */
export function protect(text) {
  const names = placeholders(text);
  const sent = text.replace(/\{([A-Za-z]+)\}/g, (_, name) => TOKEN(names.indexOf(name)));
  return { sent, names };
}

/** The translation with its placeholders back, or null when a service lost, added or broke one. */
export function back(/** @type {string} */ translated, /** @type {string[]} */ names) {
  const found = [...translated.matchAll(TOKENS)].map((match) => Number(match[1]));
  const allThere = names.every((_, index) => found.includes(index));
  if (!allThere || found.some((index) => index >= names.length)) return null;
  return translated.replace(TOKENS, (_, index) => `{${names[Number(index)]}}`);
}

/** Bold (`**…**`) must come back as many times as it went: an odd number breaks the text around it. */
export function sameMarks(/** @type {string} */ english, /** @type {string} */ translated) {
  const count = (/** @type {string} */ text) => text.split('**').length;
  return count(english) === count(translated);
}

/**
 * Every English text by id (`shared.noKeySelected`), a plural text as one entry per form the language needs
 * (`generalObsScenes.count.one`): `one` from the English `one`, any other form from the English `other`, and `none`
 * when English has one. Languages with forms English lacks (Polish `few`) get `other`'s wording: those need a person.
 * @param {Record<string, any>} english @param {string} code
 */
export function sourceTexts(english, code, prefix = '', out = new Map()) {
  const forms = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
  for (const [id, value] of Object.entries(english)) {
    const path = prefix ? `${prefix}.${id}` : id;
    if (typeof value === 'string') out.set(path, value);
    else if (isPlural(value)) {
      if (value.none !== undefined) out.set(`${path}.none`, value.none);
      for (const form of forms) out.set(`${path}.${form}`, form === 'one' && value.one ? value.one : value.other);
    } else sourceTexts(value, code, path, out);
  }
  return out;
}

/**
 * The ids to send: missing, or translated from an English text that has changed since. A text a person reviewed is
 * never sent again (`reviewed`), whatever its English.
 * @param {Map<string, string>} sources @param {Map<string, string>} done @param {{ sources?: Record<string, string>, reviewed?: string[] }} made
 */
export function toTranslate(sources, done, made) {
  const reviewed = new Set(made.reviewed ?? []);
  const ids = [];
  for (const [id, english] of sources) {
    if (reviewed.has(id)) continue;
    const unchanged = done.has(id) && made.sources?.[id] === fingerprint(english);
    if (!unchanged) ids.push(id);
  }
  return ids;
}

/** A language file's texts as flat ids → text, the same shape `sourceTexts` gives. @param {Record<string, any>} texts */
export function flatTexts(texts, prefix = '', out = new Map()) {
  for (const [id, value] of Object.entries(texts)) {
    const path = prefix ? `${prefix}.${id}` : id;
    if (typeof value === 'string') out.set(path, value);
    else flatTexts(value, path, out);
  }
  return out;
}

/**
 * The texts without any plural that lacks its `other` form (the one every language needs, words.js): such a plural is
 * left out whole, so it shows in English instead of breaking. Plurals are the ids `sourceTexts` made per form.
 * @param {Map<string, string>} texts @param {Map<string, string>} sources
 */
export function completePlurals(texts, sources) {
  const complete = new Map(texts);
  for (const id of sources.keys()) {
    if (!id.endsWith('.other')) continue;
    const plural = id.slice(0, -'other'.length);
    if (complete.has(id)) continue;
    for (const textId of [...complete.keys()]) if (textId.startsWith(plural)) complete.delete(textId);
  }
  return complete;
}

/** Flat ids back into groups, in the order of `order` (English's), so the file reads like en.js. */
export function nest(/** @type {Map<string, string>} */ flat, /** @type {string[]} */ order) {
  /** @type {Record<string, any>} */
  const result = {};
  for (const id of order) {
    if (!flat.has(id)) continue;
    const parts = id.split('.');
    let group = result;
    for (const part of parts.slice(0, -1)) group = group[part] ??= {};
    group[parts.at(-1) ?? id] = flat.get(id);
  }
  return result;
}

/** The language file's source: its texts, and `made` (which service, what was reviewed, the English fingerprints). */
export function languageFile(/** @type {Record<string, any>} */ texts, /** @type {Record<string, any>} */ made) {
  const header =
    '// Made by `npm run translate` (docs/TRANSLATIONS.md) from ui/settings/locales/en.js, by the service in `made`.\n' +
    '// A correction is welcome: change the text and add its id to `made.reviewed`, so it is never translated again.\n';
  return `${header}export const made = ${JSON.stringify(made)};\n\nexport default ${JSON.stringify(texts)};\n`;
}

/**
 * The glossary terms (English → this language) from Microsoft's terminology, as a TBX file: each `<termEntry>` with an
 * English `<langSet>` and one for the language. Only plain words and short phrases are kept.
 * @param {string} tbx @param {string} code
 */
export function glossaryFromTbx(tbx, code) {
  const wanted = code.toLowerCase();
  const terms = new Map();
  for (const entry of tbx.split('<termEntry').slice(1)) {
    const sets = [...entry.matchAll(/<langSet xml:lang="([^"]+)">[\s\S]*?<term>([^<]+)<\/term>/g)];
    const english = sets.find(([, lang]) => lang.toLowerCase().startsWith('en'))?.[2];
    const target = sets.find(
      ([, lang]) => lang.toLowerCase() === wanted || lang.toLowerCase().startsWith(`${wanted}-`),
    );
    if (english && target && english.length <= 40) terms.set(english.trim(), target[2].trim());
  }
  return terms;
}

/** The glossary terms that appear in these texts (whole words, any case), so a request carries only what it needs. */
export function termsIn(/** @type {string[]} */ texts, /** @type {Map<string, string>} */ glossary) {
  const joined = texts.join('\n').toLowerCase();
  const used = new Map();
  for (const [english, target] of glossary) {
    const word = english.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^\\p{L}])${word}($|[^\\p{L}])`, 'u').test(joined)) used.set(english, target);
  }
  return used;
}
