# Proposal: the settings window in other languages

Status: **Approved, being built**: step 1 done (every text the window shows is in `ui/settings/locales/en.js`, but for
the few listed under Costs); step 2 built (`start.js`, General → Appearance → Language, and the tray's words, saved with the
settings: `tray_words.rs`). Step 3 built (`npm run translate`,
`docs/TRANSLATIONS.md`). Next: step 4, the first six languages, run on the maintainer's computer with the keys. First languages chosen by the maintainer: Spanish, Portuguese (Brazil),
German, French (DeepL), Japanese and Simplified Chinese (Microsoft Translator). Translations come from translation services, mixed per language (DeepL,
Microsoft Translator, Index-Translate), with Microsoft's terminology as the glossary (the maintainer's choice,
2026-11-08), not from a coding assistant; native-speaker corrections are welcome on top.

## Goal

The settings window, the tray menu and the first-run setup in the person's own language, with English as the source.
Adding a language is **one file** and nothing else (principle 4): no list to edit, no code to change.

## Non-goals

- The overlay in OBS: it shows key labels, which already follow the keyboard's language (`key-names.js`).
- Layout and theme names ("60%", "Minecraft"), log lines, and the docs (English, at first).
- Right-to-left languages (Arabic, Hebrew): the window's layout would need mirroring; a later step if asked for.

## How it works

**One file per language.** The files are small JavaScript modules (`export default { … }`), not JSON: the window has
no build step, and loading JSON as a module needs a webview feature older Mac and Linux webviews lack.  `ui/settings/locales/en.js` holds every text the person reads, each under a short id
(`keys.noKeySelected`), grouped by screen. Another language is the same file with the texts translated:
`ui/settings/locales/de.js`. The app lists the files it finds (as it lists layouts), and the Language setting shows each in its
own name, from the browser's `Intl.DisplayNames` ("Deutsch", "日本語").

**The code reads texts by id.** Each file's `TEXT` block becomes `const TEXT = words('keys')`, the same names as today,
so the rest of the file doesn't change. `words()` (one small module, `ui/settings/words.js`) returns the chosen
language's texts for that group, and English for any text a language doesn't have yet. Texts with numbers use the
browser's `Intl.PluralRules` ("1 key", "3 keys", and the several plural forms of Polish or Russian), with `{count}`
style placeholders. No library: everything used is built into the webview on every system.

**Words that differ per system** (`system-words.js`: "Start with Windows", "Open at login", "tray", "menu bar") move
into the same files, each with its `windows`, `macos` and `linux` forms; `npm run check:systems` keeps working on the
English file.

**The tray menu and native dialogs** are built in Rust. The settings window sends them their texts after loading
(rc-compress does the same with `set_native_texts`); until then, and in an app started without its window, they are
English.

**The setting:** General → Language: "Same as this computer" (the default: `navigator.language`, matched to the
closest file) or a language from the list. It lives in `settings.rs` with a default and a line in `CONTROLS`, like any
other setting.

**A check catches what was forgotten.** `npm run check:locales` (in `npm test` and CI) fails when a language file has
an id English doesn't (a text renamed in English only), misses a placeholder, or has broken JSON. A language missing
texts is allowed (they show in English) and the check prints how much is translated.

## Where the translations come from

1. **The texts are translated from English by translation services, a different one per language** (the
   maintainer's choice, 2026-11-08: mix them, each where it does best). One small table,
   `tools/translate-engines.json`, says which engine each language uses; adding a language adds a line there and its
   file:

   | Engine | Used for | Why |
   |---|---|---|
   | [DeepL API](https://www.deepl.com/pro-api) | German, French, Spanish, Italian, Portuguese, Polish, Dutch and the other European languages it covers | Usually the most natural wording for these |
   | [Microsoft Translator](https://learn.microsoft.com/azure/ai-services/translator/) (Azure AI Translator) | Japanese, Korean, Chinese, Hindi, and any language DeepL lacks | Wide coverage, and its wording follows Microsoft's own terminology |
   | [Index-Translate](https://github.com/bilibili/Index-Translate) (bilibili, Apache-2.0) | Any language, as the fallback that needs no account | Free hosted API, no key; rc-compress already uses it ([nqble/rc-compress#31](https://github.com/nqble/rc-compress/pull/31)) |

   A small script, `tools/translate.mjs`, sends each new or changed English text with its glossary terms to that
   language's engine and writes the result into the language file; it runs by hand, never in the app (the app's only
   network use stays the update check). The DeepL and Microsoft keys are the maintainer's, kept in environment
   variables on the computer that runs the script, never in the repository.
2. **Microsoft's terminology is the glossary** for every engine (DeepL and Microsoft Translator both take a glossary;
   Index-Translate takes the terms in its request), so the words match what Windows and its apps say in that language
   ("Settings", "Pause", "notification area", "Cancel"). It is published as a TBX file for about 100 languages (where
   to download it goes in `docs/TRANSLATIONS.md`). **Its license (the Microsoft Language Portal Materials License) must
   be read before any of its terms go into the repository**; until then the script reads a local copy and only the
   resulting translations are committed. Mac words ("menu bar", "Open at login") are checked against what macOS shows
   in that language.
3. **People correct it.** Each language file says at the top which engine made it. A native speaker's fix is a one-line
   pull request; the script never overwrites a text a person has corrected (it keeps a list of reviewed ids).

## Step 2 in detail (proposed 2026-11-09, waiting for the maintainer)

Every file reads its words once, when it loads (`const TEXT = words('keys')`), so the language must be known before
the window's code loads, and a change must reach screens that already read theirs.

- **Choosing before anything loads.** `index.html` loads a small `ui/settings/start.js` instead of `settings.js`. It
  asks the app for the saved language and the list of language files, picks one (the saved one, or for "Same as this
  computer" the closest match to `navigator.languages`, else English), imports that file, calls `useLanguage`, and
  only then imports `settings.js`. One extra step at start, no timers.
- **Changing it reloads the window.** Picking another language saves the setting and reloads the settings window, on
  the same tab. Simpler than teaching every screen to redraw its words, and the window is rebuilt on every open
  anyway (principle 3).
- **The list of languages is the files.** The app lists `ui/settings/locales/*.js` from the files it ships (Tauri's
  asset resolver; the sandbox reads the folder), so adding a language stays one file. Each shows in its own name
  (`Intl.DisplayNames`).
- **The setting:** `general.language`, `""` for "Same as this computer" (the default, so nothing changes for anyone
  until a second file exists), else a language code (`sanitize.rs` checks its form; a code whose file is gone shows English). It sits under
  General → Appearance, with the window's theme: both are about this window, not the overlay.
- **The tray menu** (Rust) gets its words from the window through a `set_native_texts` command after start, and the
  app saves them with the settings (the maintainer's choice, 2026-11-09), so the tray is in the chosen language from
  the next launch on, even when the window never opens. The saved copy is replaced each time the window opens, so
  after an update changes a tray word the old wording lasts only until then. Before any are saved, the tray is English.
- **Still English:** the Debug tab, log lines, and the words written into `index.html` until `start.js` sets them.

## Steps

Each its own pull request, in this order:

1. `words.js`, `ui/settings/locales/en.js` and the check, with every `TEXT` block moved over. English only, no visible change
   (the screenshots stay identical, `npm run test:visual`).
2. The Language setting and the tray/native texts.
3. `tools/translate.mjs` with the three engines and the glossary step, `tools/translate-engines.json` and
   `docs/TRANSLATIONS.md`. Needs the maintainer's DeepL and Microsoft (Azure) API keys.
4. The first languages (the maintainer chooses which), each checked by the screenshot test for text that no longer
   fits: German and Russian run longer than English, so tight buttons and cards get a look.

## Costs and risks

- **Step 1 is larger than the `TEXT` blocks alone:** besides about 17 files with `TEXT` blocks, roughly 300 more texts
  sit in about 42 files (tab screens, the settings list, dialogs). It is split into small pull requests by area, each
  with no visible change: the base and shared texts, General, Keys, Layout and Style, popups and dialogs. The Debug tab
  stays English (a developer tool; the maintainer's choice, 2026-11-08).
  Left for step 2, because they need the language chosen at start: the few words written into
  `ui/settings/index.html` (the window buttons, the update popup's Later), the per-system words in
  `ui/settings/system-words.js`, and the key names in `ui/settings/key-names.js`.
  The e2e suites that check a sentence word for word (secure link, keyboard input) read it from `en.js` instead.
- **Longer text** in other languages can wrap or overflow; the screenshot test and a look per language catch it.
- **Machine translation mistakes** are expected now and then; the source of each file is stated so they can be fixed.

## Open questions

- Which languages first?
- Should the user guide follow later, and from which language on?
