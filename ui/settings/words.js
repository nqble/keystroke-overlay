// =====================================================================================================================
//  The words the settings window shows, from its language files (ui/settings/locales/<code>.js, English first; plan:
//  docs/proposals/interface-languages.md). A file's TEXT block is `const TEXT = words('header')`, the same names as
//  before, so the rest of the file doesn't change. A text missing from a language shows in English. Plain logic, no page
//  code, so tests/ui can run it with Node; tools/check-locales.mjs checks the language files against English.
// =====================================================================================================================

import english from './locales/en.js';

/** A placeholder in a text, `{name}`: filled from the arguments, in the order the English text first uses them. */
const PLACEHOLDER = /\{([A-Za-z]+)\}/g;

/** @type {Record<string, any>} The chosen language's texts (step 2 of the plan adds the choice; English until then). */
let chosen = english;

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

/** For tests: show another language's texts (null goes back to English). @param {Record<string, any> | null} texts */
export function useLanguage(texts) {
  chosen = texts ?? english;
}

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
    result[id] = typeof value === 'string' ? text(value, translation) : build(value, translation ?? {});
  }
  return result;
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
