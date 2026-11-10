// =====================================================================================================================
//  The Language row in General → Appearance: "Same as this computer" or one of the language files the app ships
//  (commands/language.rs lists them), each in its own name. Every screen reads its words when it loads (start.js), so
//  a new choice is saved and the window reloads on this tab. Plan: docs/proposals/interface-languages.md.
// =====================================================================================================================
import { useId } from '../blocks.js';
import { invoke } from '../helpers.js';
import { html, useEffect, useState } from '../html.js';
import { saveNow } from '../preview.js';
import { hideWindow } from '../reveal.js';
import { settings } from '../state.js';
import { words } from '../words.js';

const WORDS = words('generalLanguage');

/** A language's name in that language ("Deutsch", "日本語"), or its code when the web view doesn't know it. */
const ownName = (/** @type {string} */ code) => new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;

/** Save the choice, fade the window out, then load it again on General, so every screen reads the new language's words. */
async function switchLanguage(code) {
  settings.general.language = code;
  await saveNow();
  await hideWindow(); // fade out first, so the reload is one dark moment, not a page rebuilding itself in view
  const again = new URL(location.href);
  again.searchParams.set('tab', 'general');
  location.replace(again);
}

export function LanguageRow() {
  const [available, setAvailable] = useState(['en']);
  useEffect(() => {
    invoke('get_language').then((answer) => setAvailable(answer.available));
  }, []);
  const fieldId = useId('language');
  return html`<div class="row">
    <label for=${fieldId}>${WORDS.label}</label>
    <div class="ctl">
      <select
        id=${fieldId}
        data-test="general-language"
        value=${settings.general.language}
        onChange=${(changeEvent) => switchLanguage(changeEvent.currentTarget.value)}
      >
        <option value="">${WORDS.sameAsComputer}</option>
        ${available.map((code) => html`<option value=${code}>${ownName(code)}</option>`)}
      </select>
    </div>
  </div>`;
}
