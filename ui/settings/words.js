// =====================================================================================================================
//  The words the settings window shows, from its language files (ui/settings/locales/<code>.js, English first; plan:
//  docs/proposals/interface-languages.md). A file's TEXT block is `const TEXT = words('header')`, the same names as
//  before, so the rest of the file doesn't change. A text missing from a language shows in English. Plain logic, no page
//  code, so tests/ui can run it with Node; tools/check-locales.mjs checks the language files against English.
// =====================================================================================================================

import english from './locales/en.js';

/** A placeholder in a text, `{name}`: filled from the arguments, in the order the English text first uses them. */
const PLACEHOLDER = /\{([A-Za-z]+)\}/g;

/** @type {Record<string, any>} The chosen language's texts (start.js picks them before the window loads). */
let chosen = english;
/** The chosen language's code, for its plural rules (`Intl.PluralRules`). */
let chosenCode = 'en';

/**
 * A text that depends on a count is an object of plural forms (`{ one: '1 scene set', other: '{count} scenes set' }`),
 * the forms of `Intl.PluralRules` (zero, one, two, few, many, other) plus an optional `none` for a count of 0. Each
 * language gives the forms its own grammar needs; `other` is always required.
 */
const PLURAL_FORMS = ['none', 'zero', 'one', 'two', 'few', 'many', 'other'];

/**
 * The texts of one group, in the chosen language. A text with placeholders becomes a function, called with the values
 * in the order the English text names them (`TEXT.layoutLimitReached(max)`), so a translation may reorder them freely.
 * @param {string} group
 * @returns {any}
 */
export function words(group) {
  if (!(group in english)) throw new Error(`No texts for "${group}" in locales/en.js`);
  return build(english[group], chosen[group] ?? {});
}

/**
 * Show another language's texts (null goes back to English): start.js, before the window's code loads, and tests.
 * @param {Record<string, any> | null} texts @param {string} [code]
 */
export function useLanguage(texts, code = 'en') {
  chosen = texts ?? english;
  chosenCode = texts ? code : 'en';
}

/**
 * Which language file to show: the saved choice when there is a file for it, else (for "Same as this computer", `""`)
 * the closest file to the computer's languages, in their order: the same code (`pt-BR`), the same language without
 * its region (`de-AT` finds `de`), or the language in another region (`pt` finds `pt-BR`). English when nothing fits.
 * @param {string} chosen @param {string[]} available @param {readonly string[]} wanted
 */
export function pickLanguage(chosen, available, wanted) {
  if (chosen && available.includes(chosen)) return chosen;
  const base = (/** @type {string} */ code) => code.split('-')[0].toLowerCase();
  for (const code of wanted) {
    const exact = available.find((file) => file.toLowerCase() === code.toLowerCase());
    const sameLanguage = available.find((file) => base(file) === base(code));
    if (exact ?? sameLanguage) return exact ?? sameLanguage;
  }
  return 'en';
}

/** Whether a value is a text with plural forms rather than a group of texts. @param {unknown} value */
export function isPlural(value) {
  return Boolean(value && typeof value === 'object' && 'other' in value);
}

/** The plural forms a language may use (for the language check). */
export const pluralForms = PLURAL_FORMS;

/** The names of a text's placeholders, each once, in the order they first appear. @param {string} text */
export function placeholders(text) {
  const names = [...text.matchAll(PLACEHOLDER)].map((match) => match[1]);
  return [...new Set(names)];
}

/** @param {Record<string, any>} source @param {Record<string, any>} translated */
function build(source, translated) {
  /** @type {Record<string, any>} */
  const result = {};
  for (const [id, value] of Object.entries(source)) {
    const translation = translated[id];
    result[id] = buildOne(value, translation);
  }
  return result;
}

/** One entry: a text, a plural, a list (each entry built the same way) or a group. @param {any} value @param {any} translation */
function buildOne(value, translation) {
  if (typeof value === 'string') return text(value, translation);
  if (isPlural(value)) return plural(value, translation);
  if (Array.isArray(value)) return value.map((item, index) => buildOne(item, translation?.[index]));
  return build(value, translation ?? {});
}

/** One text: the translation if there is one, filled in when it has placeholders. @param {string} source @param {unknown} translation */
function text(source, translation) {
  const chosenText = typeof translation === 'string' ? translation : source;
  const names = placeholders(source);
  if (!names.length) return chosenText;
  return (/** @type {unknown[]} */ ...values) => fill(chosenText, names, values);
}

/** @param {string} template @param {string[]} names @param {unknown[]} values */
function fill(template, names, values) {
  return template.replace(PLACEHOLDER, (match, name) => {
    const index = names.indexOf(name);
    return index === -1 ? match : String(values[index]);
  });
}

/**
 * A text with plural forms: a function whose first value is the count (`{count}`); any other placeholders follow, in
 * the order the English `other` form uses them. The language's own forms are used when it has them.
 * @param {Record<string, string>} source @param {unknown} translation
 */
function plural(source, translation) {
  const forms = isPlural(translation) ? /** @type {Record<string, string>} */ (translation) : source;
  const names = ['count', ...placeholders(source.other).filter((name) => name !== 'count')];
  const rules = new Intl.PluralRules(forms === source ? 'en' : chosenCode);
  return (/** @type {number} */ count, /** @type {unknown[]} */ ...rest) => {
    const form = count === 0 && forms.none !== undefined ? 'none' : rules.select(count);
    const template = forms[form] ?? forms.other;
    return fill(template, names, [count, ...rest]);
  };
}
