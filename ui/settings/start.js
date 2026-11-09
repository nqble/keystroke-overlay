// =====================================================================================================================
//  The settings window starts here (index.html). Every file reads its words once, when it loads (`words('keys')`), so
//  the language is chosen first: the saved choice, or the computer's (commands/language.rs lists the language files),
//  that file is loaded, and only then the window itself (settings.js). Plan: docs/proposals/interface-languages.md.
//  Changing the language reloads the window (general-appearance.js).
// =====================================================================================================================
import { pickLanguage, useLanguage } from './words.js';

const { invoke } = window.__TAURI__.core;

/** Load the chosen language's file; on any problem the window simply shows English. */
async function chooseLanguage() {
  try {
    const { chosen, available } = await invoke('get_language');
    const code = pickLanguage(chosen, available, navigator.languages);
    if (code === 'en') return;
    const file = await import(`./locales/${code}.js`);
    useLanguage(file.default, code);
    document.documentElement.lang = code; // screen readers read the window in its language
  } catch (problem) {
    console.error('The language file could not be loaded; showing English.', problem);
  }
}

await chooseLanguage();
await import('./settings.js');
