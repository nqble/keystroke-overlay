# How the docs are written

One voice for every document and for the app's own text, whoever writes it: a person or a Claude session, on
any branch. When two branches are merged, their docs should read as if one person wrote them. `npm run check:docs`
checks the rules marked **(checked)**; the rest are for reviewers.

## Words

- **American spelling** (checked): color, center, behavior, license, gray, canceled, labeled, organize. Code names keep
  whatever spelling they already have (`centredView` stays); the CHANGELOG's history is left as written.
- **One name for each thing.** Use these, and nothing else for the same idea:

  | Say | Not |
  |---|---|
  | **OBS URL** (the address you paste into OBS; the button is **Copy OBS URL**) (checked) | OBS link, overlay link, overlay address |
  | **secure link** (the optional feature that adds a private key to the OBS URL) | protected link, private link |
  | **settings window** | settings page, app window |
  | **tray menu**, **tray icon** (on a Mac, the **menu bar**; from v2.0 the app keeps each system's words in one file) | system tray menu, notification area |
  | **Standard** and **Compatibility** (the two keyboard input methods) | hook mode, Raw Input mode |
  | **overlay** (what OBS shows) and **live preview** (the copy in the settings window) | widget, preview window |
  | **layout** (a keyboard: Full size, TKL…) and **key** | board, button |

- **Menu paths** are bold, with arrows: **General → Advanced → Debug mode (for developers)**. Use the names the app shows, letter for letter.

## Voice

- Plain, friendly English for someone who has never seen the app. Say "you"; short sentences; one idea per sentence.
- Say what to do and what happens, not how hard or easy it is (no "simply", "just", "easily").
- Name things by what the person sees (the button's words), not by the code (`set_layout`), except in developer docs.

## Shape

- Each document starts with one or two lines saying what it is for. Proposals in `docs/proposals/` also have a **Status**
  line.
- Headings in sentence case ("Add it to OBS", not "Add It To OBS").
- Commands and file names in `code`; buttons, tabs and menu items in **bold**.
- Tables for comparisons and lists of options; numbered lists for steps that must happen in order.

## Where each fact lives

Every fact has one home. Other documents link to it instead of repeating it, so a change is made in one place.

| Fact | Home |
|---|---|
| What the app can see, saves and sends | [PRIVACY.md](../PRIVACY.md) |
| Getting the app, the short feature list | [README.md](../README.md) |
| How to use each tab, OBS settings, two PCs, troubleshooting | [USER-GUIDE.md](USER-GUIDE.md) |
| How a release is made, secrets, channels | [RELEASING.md](RELEASING.md) |
| The settings and layout files | [FILE-FORMATS.md](FILE-FORMATS.md) |
| The parts of the code | [ARCHITECTURE.md](ARCHITECTURE.md) |
| What changed in each version | [CHANGELOG.md](../CHANGELOG.md) |

## Versions and branches

- Describe what the app does in the version on that branch. On `main` that is the latest release.
- A fact that only holds from some version on says so once, in its home: "From v1.4, …". Don't write "new" or "now":
  they go stale.
- When two branches are merged and a document differs, keep the text that is true on the branch being merged into.
