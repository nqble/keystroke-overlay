// The three translation services `npm run translate` can use (tools/translate.mjs; which language uses which is
// tools/translate-engines.json). Each takes English texts of one group, already with ⟦0⟧ in place of placeholders, the
// glossary terms they contain and the context (what the app is, where the texts are shown: translate-text.mjs), and
// gives back the translations in the same order. Short words need that context ("Quit", "Show", "Keys", "Port"). The keys come from environment variables on
// the computer running the script, never from the repository (docs/TRANSLATIONS.md).

/** The only addresses this script talks to (tools/check-privacy.mjs checks no other appears in tools/translate*.mjs). */
const DEEPL_FREE = 'https://api-free.deepl.com/v2';
const DEEPL_PRO = 'https://api.deepl.com/v2';
const MICROSOFT = 'https://api.cognitive.microsofttranslator.com';
const INDEX = 'https://index-translate.bilibili.com/v1';

/** Texts per request: DeepL takes up to 50, Microsoft up to 1,000 (we stay well under both). */
const BATCH = 40;
/** Index-Translate's model, and the name it is sent under (the service refuses requests without a User-Agent). */
const INDEX_MODEL = 'Index-Translate-35B-A3B';
const USER_AGENT = 'keystroke-overlay-translate (github.com/nqble/keystroke-overlay)';

/** A key from the environment, or a clear stop when it is missing. @param {string} name */
function key(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: see docs/TRANSLATIONS.md, "Keys"`);
  return value;
}

/** POST JSON and return the answer's JSON, or stop with the service's own words. */
async function post(
  /** @type {string} */ url,
  /** @type {Record<string, string>} */ headers,
  /** @type {unknown} */ body,
) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}: ${await response.text()}`);
  return response.json();
}

/** The texts in groups of BATCH, translated one group at a time. */
async function inBatches(/** @type {string[]} */ texts, /** @type {(group: string[]) => Promise<string[]>} */ send) {
  const results = [];
  for (let start = 0; start < texts.length; start += BATCH)
    results.push(...(await send(texts.slice(start, start + BATCH))));
  return results;
}

/**
 * DeepL: the context goes in its `context` field (read, not translated), and a glossary made for this run (deleted
 * after) carries the terms. A free key ends in `:fx`.
 * @param {string[]} texts @param {string} target DeepL's code (`DE`, `PT-BR`, `JA`) @param {Map<string, string>} terms
 * @param {string} context
 */
async function deepl(texts, target, terms, context) {
  const apiKey = key('DEEPL_API_KEY');
  const base = apiKey.endsWith(':fx') ? DEEPL_FREE : DEEPL_PRO;
  const headers = { Authorization: `DeepL-Auth-Key ${apiKey}` };
  const glossaryLanguage = target.split('-')[0];
  const glossary = terms.size
    ? await post(`${base}/glossaries`, headers, {
        name: 'keystroke-overlay',
        source_lang: 'EN',
        target_lang: glossaryLanguage,
        entries_format: 'tsv',
        entries: [...terms].map(([english, translated]) => `${english}\t${translated}`).join('\n'),
      })
    : null;
  try {
    return await inBatches(texts, async (group) => {
      const body = { text: group, source_lang: 'EN', target_lang: target, context, glossary_id: glossary?.glossary_id };
      return (await post(`${base}/translate`, headers, body)).translations.map((one) => one.text);
    });
  } finally {
    if (glossary) await fetch(`${base}/glossaries/${glossary.glossary_id}`, { method: 'DELETE', headers });
  }
}

/**
 * Microsoft Translator: each term is marked in the text with its translation (its "dynamic dictionary"). It takes no
 * context, so short words can come back in the wrong sense; no language uses it now (translate-engines.json).
 */
async function microsoft(
  /** @type {string[]} */ texts,
  /** @type {string} */ target,
  /** @type {Map<string, string>} */ terms,
) {
  const headers = {
    'Ocp-Apim-Subscription-Key': key('AZURE_TRANSLATOR_KEY'),
    'Ocp-Apim-Subscription-Region': key('AZURE_TRANSLATOR_REGION'),
  };
  const url = `${MICROSOFT}/translate?api-version=3.0&from=en&to=${encodeURIComponent(target)}`;
  return inBatches(texts, async (group) => {
    const marked = group.map((text) => ({ Text: markTerms(text, terms) }));
    return (await post(url, headers, marked)).map((one) => one.translations[0].text);
  });
}

/** `Settings` → `<mstrans:dictionary translation="Einstellungen">Settings</mstrans:dictionary>`, whole words only. */
function markTerms(/** @type {string} */ text, /** @type {Map<string, string>} */ terms) {
  let marked = text;
  for (const [english, translated] of terms) {
    const word = english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tag = `<mstrans:dictionary translation="${translated.replace(/"/g, '&quot;')}">$1</mstrans:dictionary>`;
    marked = marked.replace(new RegExp(`(?<![\\p{L}])(${word})(?![\\p{L}])`, 'giu'), tag);
  }
  return marked;
}

/** Index-Translate (bilibili, no key): one text per request, the context, the terms and the ⟦0⟧ rule in the instruction. */
async function indexTranslate(
  /** @type {string[]} */ texts,
  /** @type {string} */ target,
  /** @type {Map<string, string>} */ terms,
  /** @type {string} */ context,
) {
  const language = new Intl.DisplayNames(['en'], { type: 'language' }).of(target) ?? target;
  const results = [];
  for (const text of texts) {
    const used = [...terms].filter(([english]) => text.toLowerCase().includes(english.toLowerCase()));
    const glossary = used.length
      ? ` Translate these terms this way: ${used.map(([a, b]) => `${a} → ${b}`).join('; ')}.`
      : '';
    const instruction = `Context (do not translate it): ${context}\n\nTranslate only the following text into ${language}, as it would read in that app, about as short as the English. Keep every part written like ⟦0⟧ exactly as it is.${glossary} Output only the translation.`;
    const answer = await post(
      `${INDEX}/chat/completions`,
      {},
      {
        model: INDEX_MODEL,
        messages: [{ role: 'user', content: `${instruction}\n\n${text}` }],
      },
    );
    results.push(answer.choices[0].message.content.trim());
  }
  return results;
}

/** The services by the name tools/translate-engines.json uses. */
export const ENGINES = { deepl, microsoft, index: indexTranslate };
