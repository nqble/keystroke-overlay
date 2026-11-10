# Translations

The settings window and the tray menu are written in English (`ui/settings/locales/en.js`) and shown in the person's
language when there is a file for it (`ui/settings/locales/<code>.js`, chosen in General → Appearance → Language). The
plan, and why it works this way: [proposals/interface-languages.md](proposals/interface-languages.md).

## Where translations come from

Each language file is made by a translation service, not written by hand or by a coding assistant:
`npm run translate` sends the English texts to the service `tools/translate-engines.json` names for that language and
writes what comes back. DeepL does Spanish, Portuguese, German, French and Japanese, and Index-Translate (bilibili's
free service, no account) Simplified Chinese and any language as the fallback. Microsoft Translator is still supported
but no language uses it: it takes no context, and short words came back in the wrong sense ("Quit" as "resign",
"Show" as a TV show). The top of each file says which service made it.

The script runs by hand, never inside the app: the app's only network use stays its update check (PRIVACY.md), and
`npm run check:privacy` checks that the script talks to nothing but these three services.

## Running it

```bash
npm run translate -- de --dry-run
```

says how many texts would be sent, and sends nothing. Without `--dry-run` it translates them and rewrites
`ui/settings/locales/de.js`. Several languages at once: `npm run translate -- de fr ja`.

Only texts that are new, or whose English changed since they were translated, are sent (each file keeps a short
fingerprint of the English each text came from, in `made.sources`). A text whose placeholder (`{name}`) or bold
(`**…**`) didn't come back whole is left in English, and the script lists it. `--all` sends every text again (never a
reviewed one), for example after the context below improved.

**Context.** A short word on its own is ambiguous ("Keys", "Port", "Apply", "pan"), so every request says what the
app is and where the text is shown: the comment above its group in `en.js` ("the tray menu", "the Keys tab"). A word
that could still mean two things gets its own note at the end of its line, starting with `means:`:

```js
pan: 'pan', // means: one word, to pan (move the view, as on a map)
```

Other end-of-line comments are for developers and are not sent. When a translation comes back in the wrong sense, the
fix is a better note or group comment and `--all`, not an edit by hand.

Then run `npm run check:locales` and look at the window in that language (`npm run ui-sandbox` with the browser set to
it, or the app). German and French run longer than English, so tight buttons and cards get a look, and
`npm run test:visual` on Windows.

## Keys

DeepL and Microsoft Translator need the maintainer's keys, as environment variables on the computer that runs the
script. They are never written into the repository, a note or a chat.

| Variable                  | For                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `DEEPL_API_KEY`           | DeepL. A free key ends in `:fx`, and the script then uses DeepL's free address     |
| `AZURE_TRANSLATOR_KEY`    | Microsoft Translator (Azure AI Translator)                                         |
| `AZURE_TRANSLATOR_REGION` | the region the Translator resource was made in (for example `westus`)              |

Index-Translate needs no key.

## Glossary

So the window uses the words the person's system uses ("Settings", "Cancel", "notification area"), the script can
take Microsoft's terminology, published as one TBX file per language (the Microsoft Terminology Collection):

```bash
npm run translate -- de --glossary path/to/German.tbx
```

Only the terms that appear in the texts being sent go with them: as a glossary made for the run and deleted after
(DeepL), marked in the text (Microsoft), or listed in the request (Index-Translate). **The TBX files stay outside the
repository** until their license (the Microsoft Language Portal Materials License) has been read; only the resulting
translations are committed. Mac words ("menu bar", "Open at login") are checked against what macOS shows in that
language.

## Corrections

A native speaker's correction is welcome as a pull request: change the text in the language file and add its id (for
example `shared.noKeySelected`) to `made.reviewed` at the top of the file. The script never sends a reviewed text
again, even when its English changes; check those by hand then.

Two cases always need a person:

- **Plural forms English doesn't have.** Polish, Russian, Arabic and others use more forms than "one" and "other";
  the script fills them with the "other" wording, which is often wrong.
- **Traditional Chinese.** Until there is a `zh-Hant` file, Chinese in Taiwan and Hong Kong shows the Simplified file.

## Adding a language

1. Add a line to `tools/translate-engines.json`: its code (the file name), the service, the service's own code for
   the language, and the TBX language for the glossary.
2. `npm run translate -- <code>`, then the checks above.
3. The app lists the new file in General → Language by itself.
