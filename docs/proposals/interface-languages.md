# Proposal: the settings window in other languages

Status: **Proposed** (2026-11-08). Not built. Translations come from a dedicated translation model with Microsoft's
terminology as its glossary (the maintainer's choice, 2026-11-08), not from a coding assistant; native-speaker
corrections are welcome on top.

## Goal

The settings window, the tray menu and the first-run setup in the person's own language, with English as the source.
Adding a language is **one file** and nothing else (principle 4): no list to edit, no code to change.

## Non-goals

- The overlay in OBS: it shows key labels, which already follow the keyboard's language (`key-names.js`).
- Layout and theme names ("60%", "Minecraft"), log lines, and the docs (English, at first).
- Right-to-left languages (Arabic, Hebrew): the window's layout would need mirroring; a later step if asked for.

## How it works

**One file per language.** `ui/locales/en.json` holds every text the person reads, each under a short id
(`keys.noKeySelected`), grouped by screen. Another language is the same file with the texts translated:
`ui/locales/de.json`. The app lists the files it finds (as it lists layouts), and the Language setting shows each in its
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

1. **The texts are translated from English by a dedicated translation model**,
   [Index-Translate](https://github.com/bilibili/Index-Translate) (bilibili, Apache-2.0, 150 languages; it has a free
   hosted API, and its weights can run locally). rc-compress already uses it this way ([nqble/rc-compress#31](https://github.com/nqble/rc-compress/pull/31)).
   A small script, `tools/translate.mjs`, sends each new or changed English text with its glossary terms and writes the
   result into each language file; it runs by hand, never in the app (the app's only network use stays the update
   check).
2. **Microsoft's terminology is the glossary**, so the words match what Windows and its apps say in that language
   ("Settings", "Pause", "notification area", "Cancel"). It is published as a TBX file for about 100 languages
   (where to download it goes in `docs/TRANSLATIONS.md`). **Its license (the Microsoft
   Language Portal Materials License) must be read before any of its terms go into the repository**; until then the
   script reads a local copy and only the resulting translations are committed. Mac words ("menu bar", "Open at login")
   are checked against what macOS shows in that language.
3. **People correct it.** Each language file says at the top how it was made. A native speaker's fix is a one-line
   pull request; the script never overwrites a text a person has corrected (it keeps a list of reviewed ids).

## Steps

Each its own pull request, in this order:

1. `words.js`, `ui/locales/en.json` and the check, with every `TEXT` block moved over. English only, no visible change
   (the screenshots stay identical, `npm run test:visual`).
2. The Language setting and the tray/native texts.
3. `tools/translate.mjs`, the glossary step and `docs/TRANSLATIONS.md`.
4. The first languages (the maintainer chooses which), each checked by the screenshot test for text that no longer
   fits: German and Russian run longer than English, so tight buttons and cards get a look.

## Costs and risks

- **Step 1 touches about 17 files** (every `TEXT` block) and is a refactor: the maintainer approves the plan first.
  The e2e suites that check a sentence word for word (secure link, keyboard input) read it from `en.json` instead.
- **Longer text** in other languages can wrap or overflow; the screenshot test and a look per language catch it.
- **Machine translation mistakes** are expected now and then; the source of each file is stated so they can be fixed.

## Open questions

- Which languages first?
- Should the user guide follow later, and from which language on?
