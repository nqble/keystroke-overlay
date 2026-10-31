# UI Design, Version 2

Status: **approved, for v2.0.** This is the one design reference for the settings window. It replaces
`v2-redesign.md`. When code and this file disagree, one of them is a bug: fix it, or ask the maintainer in an issue. The Keys tab has
its own detailed spec, [key-editor.md](key-editor.md), which follows this file. The audit that led here is
[ui-audit.md](ui-audit.md); the build order is [v2-tab-restructure.md](https://github.com/nqble/keystroke-overlay/blob/9f1ac68/docs/for-claude/proposals/done/v2-tab-restructure.md) (in git history).

Each part says whether it is **built** (in v2.0) or **designed** (approved, not built yet).

## 1. Principles

- **A step up, not a new app.** The skeleton stays: the tab list on the left, the header, the live preview on top
  (hidden on the Keys tab) and the dark palette.
- **Consistent.** Every screen uses the same tokens, building blocks, states and wording. A new screen copies an
  existing one. The key editor is the reference.
- **Fast.** Only `transform` and `opacity` animate. Nothing runs while idle: no timers, and only passive listeners.
- **One place to change.** Layouts, themes and animations stay one plain file each (section 12).
- **Every design change keeps the code clean and efficient.** Before a design is approved, check what
  it costs to build: it fits the existing files and building blocks (a new part gets its own small JS and CSS file,
  no file past about 400 lines, no function past about 40), it adds nothing that runs while idle, and it follows
  CLAUDE.md. A design that would need clever or tangled code is redesigned, not built that way.
- **Keyboard and screen reader.** Everything clickable is a real control with a name (CLAUDE.md section 5).

## 2. Words

- **Fewer words for users.** Each line a user reads is a label or one short sentence. No paragraphs, and nothing that
  repeats what the screen already shows. Detail goes in a tooltip or in Debug mode.
- **Plain language by default.** Technical detail appears only in Debug mode, as a small dim line beside the plain text.
  It never replaces the plain text and never shows private data (the secure-link key, key presses).
- Text lives in each file's `TEXT` block (shared words in `ui/settings/text.js`). Notes for developers, in code and
  docs, can be as full as they need to be.

| Where | Everyone | Extra in Debug mode |
|---|---|---|
| Animation tab | "Smooth animations that don't slow your stream." | "Animates only `transform` and `opacity`." |
| Connection | "OBS URL and port" | "Local server on 127.0.0.1:7878; overlays connected: 2" |
| Keyboard input | "Standard works with nearly every game." | "Standard = WH_KEYBOARD_LL; Compatibility = Raw Input." |
| Secure link | "Only programs with your full link can see your key presses." | "128-bit key, checked on every request." |
| Updates | "Checks about once an hour. Nothing installs until you click." | "Last check time and result." |
| Header status | "● Live in OBS" | "2 overlay clients · paused: no" |

## 3. Tokens

All colors and shadows are CSS variables in the `:root` block at the top of `ui/settings/settings.css`, named by
purpose. That block is the list of record; don't copy values here. A raw color anywhere else in that file fails
`npm run check:style`. JavaScript sets only geometry, through CSS variables.

Groups: surfaces (`--color-bg`, `--color-panel`, `--color-panel-raised`, `--color-well`, `--color-scrim`), lines
(`--color-line`, `--color-line-hover`, `--color-control-line`), text (`--color-text`, `--color-text-dim`,
`--color-on-fill`), accent (`--color-accent`, `--color-accent-strong`, `--color-accent-pressed`,
`--color-selected-bg`), status (danger, error, live, paused, update, dev), release-note sections, menus, the
scrollbar and the window buttons. Spacing, radius, type size and weight are tokens too (`--space-*`, `--radius-*`,
`--text-*`, `--weight-*`).

## 4. Building blocks

Built as Preact components in `ui/settings/blocks.js` (look in `blocks.css`): `Section`, `Switch`, `Segmented`,
`GalleryCard` (with an optional "⋯" menu beside it), `MenuButton`, `Note`, `Detail` and `ConfirmButton`. Popups use `dialog()` in `popup.js`. See them all,
in every state, in the UI sandbox at `/__sandbox__/blocks.html`. A screen uses these, never a one-off copy.

- **Heading row** on every tab: a title and a one-line subtitle on the left, the tab's main switch or action on the right.
- **Section cards** instead of one long form: a short title, then its controls.
- **Segmented switch** for small choices (Keyboard shape | Even grid; Stable | Latest; Standard | Compatibility),
  not a dropdown.
- **Gallery cards** for layouts, themes, presets and animations.
- **"⋯" menu** (`menu.js`) for a card's actions; works with the keyboard.
- **Reset ▾** menu per tab where resetting makes sense, worded like the key editor's.
- **Sliders show their value.**

## 5. States

One set of states for every button and control (buttons, tabs, segmented switches, switches, menus, the pause button,
the update chip): rest → **hover** (a step lighter) → **pressed and held** (a step darker) → release back to hover.
**Color only: nothing shrinks or moves.** Keyboard focus shows the focus ring (`--color-focus`). Blue buttons:
hover and held use `--color-accent-pressed`; plain buttons held use `--color-control-pressed`.

**Cards** (layouts, themes, presets) have no pressed state: only hover (`--color-line-hover`) and selected.
**Selected shows on the border only** (the accent ring); what's inside the card never changes color.

## 6. Motion

- Only `transform` and `opacity` animate. With "reduce motion" on, nothing animates.
- **Hover delay: 150 ms** before a hover animation starts, so a pass-over does nothing. Keyboard focus starts at once.
- **Closing is slower than opening**, so point-click-leave never snaps shut (pause button: opens in 180 ms, closes in
  260 ms after a 150 ms wait).
- **A one-shot animation always plays to the end** once started (the update chip's arrow), even if the mouse leaves.
  That needs a little JS: a 150 ms timer only while hovered, and a class removed on `animationend`.

## 7. Scrolling

Built. One look for every scrolling area in the window; a new scrolling area gets both parts below.

- **One scrollbar** (`::-webkit-scrollbar` in settings.css): 10 px wide, a rounded thumb (`--color-scrollbar-thumb`)
  inset by a 2 px clear border, no track, no arrow buttons. `npm run check:style` refuses `scrollbar-width` and
  `scrollbar-color`, which bring the system scrollbar (and its arrows) back in WebView2.
- **Scroll fade:** give the scrolling element the class `scroll-fade`. An edge with more to scroll to fades out
  softly; an edge with nothing more stays sharp. The fade grows from 0 to 28 px over the first 40 px of scrolling, so
  it never pops in. It is a CSS mask with a second, solid 10 px layer on the right, so the scrollbar never fades.
  `scroll-fade.js` sets `--fade-top` and `--fade-bottom` from one passive scroll listener for the whole window, plus a
  repaint when a tab is drawn, a popup opens or the window resizes. Nothing runs while nobody scrolls.
- Used on: the tab area (`#pane`), every popup body (`#mBody`, `#uBody`, `#dBody`) and the "Other layouts" list in
  New layout. Not on the debug logs: they are read like a terminal, and a fade would hide the newest line.

## 8. Header

Built. On the left: the logo and name (with the **DEV** badge on a devbuild), then the **OBS status**. In the top right
corner, just before the window buttons (drawn icons): **Copy OBS URL** (always), and the **Update ready** chip to its
right when an update is ready.

- **No link box in the header.** It stays clean. The OBS URL box lives only in General → Connection (hidden like a
  password while the secure link is on). The header shows only the **Copy OBS URL** button, always, so the link
  is one click away on every tab.
- **OBS status** (`obs-status.js`) is a button that opens General. It uses only the number of overlays connected to
  the local server (the live preview isn't counted). The first state that applies wins:

| State | Shows | Color |
|---|---|---|
| Port in use | "⚠ Port in use" | red |
| Paused | "⏸ Paused", or "⏸ Paused · OBS not connected" with OBS closed | amber |
| Link changed | "OBS URL changed: copy it again" | red |
| Live | "● Live in OBS" | green |
| Off | "○ Not connected to OBS" | gray |

- **Update ready chip:** on hover (after 150 ms) or focus, its ↓ drops out of the bottom of its small box and comes
  back in from the top, once, like a download. Only the arrow moves; it always finishes. A click opens the update
  popup right where the user is, on any tab; it never switches tab. The tray's "Update available" does the same:
  it opens or raises the settings window with the update popup open. General → Updates keeps its own controls.

## 9. Pause button

Built. A 34 px round **⏸** button in the live preview's top right corner (`aria-label` "Pause overlay"). On hover or
focus it grows to the left into a pill and the word **"Pause"** slides out with it. It is drawn from two round caps and
a stretching middle, so the ends never squash, and the word appears only once the shape has opened. Timings are in
section 6. Paused, it turns amber and shows **▶ "Resume"**. It is the same setting as the tray's pause, so the
button, the header and the tray always agree. While paused, OBS still shows the keyboard but no key presses; only the
button and the header say so (no banner).

## 10. Popups and messages

Built. **One shared popup** (`popup.js`) for everything: the general dialog, What's new and the update popup.

- **Keys:** focus moves in when it opens, Tab stays inside, focus goes back on close. **Esc** does the safe choice
  (close, Cancel, Later). **Enter** clicks the blue button, never a red one, and not while focus is on a button, a
  dropdown or a text box. A popup can be **locked** (while an update installs): then Esc and Enter do nothing.
- **Size:** up to 560 px wide (and 48 px less than the window), as tall as its text up to 80% of the window and never
  more than 640 px. Longer text scrolls in the middle (with the scroll fade); the title and buttons stay in view.
- **Danger** buttons are red and never the default.
- **Keyboard access notice (macOS only, `keyboard-access.js`):** a one-line bar under the header, announced to screen
  readers (`role="status"`), blue-lined because it asks for something rather than reporting a fault. It says one of:
  allow keyboard access (button opens System Settings), restart once so macOS starts sending keys (button restarts), or
  that Secure Input is blocking capture (no button). It is checked again whenever the window gets focus, never on a timer. It asks for access while macOS says no and no
  key has arrived yet; one key that really arrives proves capture works and the bar goes.

**Release notes** (What's new and the update popup) always use the same five sections, in this order. A section with
nothing to say is left out. The color is on the heading and a thin line beside its list; the list text stays normal,
and the icon and word mean color is never the only signal. Each item has a small drawn dot, as far from the line as
the text is from the dot. Every release ends with one plain line on what was kept.

| Section | Icon | Token | For |
|---|---|---|---|
| New | ✨ | `--color-notes-new` | things you couldn't do before |
| Improved | 🛠 | `--color-notes-improved` | things that work better |
| Fixed | 🐛 | `--color-notes-fixed` | bugs that are gone |
| Performance | ⚡ | `--color-notes-perf` | speed and memory, with numbers |
| Under the hood | 🧰 | `--color-notes-hood` | for developers |

CHANGELOG.md uses `### ✨ New`-style headings; `release-notes.js` (`NOTE_SECTIONS`) colors them and
`tools/changelog-section.mjs` refuses an unknown heading or the wrong order.

## 11. Tabs

| Tab | v2.0 | State |
|---|---|---|
| **Layout** | Cards with a mini picture of the layout, the "⋯" menu, drag to reorder, Hide, "Other layouts". See below. | built (Preact; Rename and Duplicate wait for app commands that don't exist yet) |
| **Keys** | The key editor ([key-editor.md](key-editor.md)). | built (M4.1–M4.3; Preact) |
| **Style** | A theme gallery, My presets as cards with a "Save current look" card, then short sections: Colors, Shape, Text (font picker, **Add font file…**, **Your fonts**), Size. **Reset ▾**. | built (Preact; Reset ▾ has \"Back to the default look\"; the app doesn't record which theme was chosen, so \"Back to the chosen theme\" waits for that) |
| **Animation** | A gallery of animation cards that demo only while hovered or focused; then Speed, Strength (only for animations that use it) and Easing as a segmented switch. | built (Preact; cards demo at the default speed and strength so they compare like for like) |
| **Fonts** | Removed as a tab: fonts are in Style → Text. | built |
| **General** | Section cards: **Connection** (the OBS URL box with Copy, port, secure link, and **First run setup**), **OBS scenes** (a switch and **Edit scenes…**), **Keyboard input**, **Startup**, **Pause shortcut**, **Updates**, **Appearance** (the settings window's themes, full width; section 14), and a collapsed **Advanced** (Debug mode, Restart server, Open data folder, Reset all settings, Quit app). | built (Preact) |
| **Debug** | Only with Debug mode on. Cards for the app's state, the log and self-tests; **Copy bug report** copies the scrubbed report (`debug-report.js`, `BUG_REPORT_FORMAT`). | built (one file per card in `debug/`) |

### Layouts

- **A new install shows four layouts:** Full size, TKL, Gameplay (left hand), WASD.
- **New layout** starts with a **Start from** choice (a segmented control): **Blank** (a name box, then Create),
  **Built-in** (the built-in layouts not on the tab: 96%, 75%, 65%, 60%, Arrows, Numpad, Full size (ISO), TKL (ISO),
  two columns and four rows, more scroll inside it with the scroll fade; **Add** puts one at the end of the tab; the
  footer has only Close) and **From a KLE file** (one line on what to do in KLE; the footer's primary button is
  **Choose file…**). Built-in is left out when every built-in is on the tab.
- **Import from KLE** (after Choose file…): the layout's picture with its key labels, keys that can't light up drawn
  dashed (`--color-key-unlit`), a Name box, one bold summary line ("61 keys · 60 light up · 1 can't: Fn") with the
  reason under it, then **Back** (to New layout, From a KLE file) and **Create layout**. On the Keys tab such a key's
  inspector title is its label and "can't light up", never its placeholder code.
- **Hide** (a built-in layout) sends it back to New layout's Built-in; **Delete…** (your own) removes it for good. The last
  layout can't be removed; removing the one in use selects the first card.
- **"Your layouts: N / 20"** counts only your own; built-in layouts never count.
- **Order:** drag, the "⋯" menu (Move left / Move right) or Alt+← / Alt+→ (focus stays on the moved card). The tray's
  Layout menu uses the same order. A card drops only **between** cards: a line shows in the gap when the pointer is in
  the gap or within about 28 px of it; over the middle of a card nothing happens. While dragging, the card's own spot
  is a faint dashed placeholder (opacity 0.35) with no selection ring.
- The **"+ New layout"** card is always last and says only that. With 20 of your own, its popup says so in place of
  the Start from choice and shows Built-in, which can still be added.
- **Saved as one setting,** `layout.order`: layout ids in order. A built-in layout shows only if it is listed; your own
  always show (a missing one is added at the end). The default is the four above, so nothing needs migrating.
  **Reset all settings** brings back exactly the four defaults; your own layouts are kept.

### First run setup (Add to OBS)

Built (`ui/settings/first-run.js`; First run setup board). **A screen over the Layout tab:** it covers
the tab's content (the header, the tab list and the live preview stay, so the user sees what OBS will show) with three short steps: Copy OBS URL, add a Browser source in OBS, paste it and use the size shown (the chosen
layout's real size).

- **New installs only.** It shows when the app starts with no settings file yet (neither `settings.json` nor its
  `.bak`). After an update the file is already there, so it never shows on its own again. No new setting, no timer:
  one yes/no the app knows when it loads settings.
- **Close any time** with ✕ in its top right corner (`aria-label` "Close first run setup"), set up or not. Closing
  shows the normal Layout tab. Nobody is ever stuck on it.
- When OBS first connects it closes by itself, and the Layout tab shows a short "✓ You're all set" line.
- **Run it again:** General has a **First run setup** button. It switches to the Layout tab and shows the screen again,
  which closes the same way.

## 12. Adding more stays one file

- A **layout** is one file in `ui/overlay/layouts/`; a built-in one also gets its place in the Other layouts list, and a
  unit test checks every listed id has a file.
- An **animation** is one file in `ui/overlay/animations/`. Its card demos with the animation's own code (never
  hand-made demo CSS). Optional fields: `description` (card text; falls back to the name) and `usesIntensity: true`
  (shows Strength).
- **Theme cards and layout pictures** are drawn from the theme or layout file itself.
- A **scrolling area** gets the class `scroll-fade` (section 7). A **popup** uses `popup.js`. A **status** is one line in
  `obs-status.js`. A **color** is one token. See `docs/EXTENDING.md` for the full list.

## 13. Logo and devbuilds

Design A, "Keycap K". Sources in `assets/logo/`: `logo.svg`, `logo-tray.svg`, and `logo-dev.svg` for devbuilds (purple
`#8b5cf6` on near-black `#0a0810`). A devbuild also shows the DEV badge in the header (`tools/devbuild-title.mjs`).

## 14. Settings window themes

General → **Appearance** changes how this window looks; the overlay in OBS keeps its own themes (Style tab).

- **18 built-in themes**, one file each in `ui/settings/themes/` (format: FILE-FORMATS.md). Gallery order: Default,
  then borrowed palettes (keycap sets marked **keycaps**; each borrowed theme's card shows its credit as a tooltip),
  then our own. Inspired by Monkeytype's range of themes; no theme files or code come from it.
- **A theme sets six base colors** (window, panels, text, dim text, accent, errors); every other color is worked out
  from them (`theme-colors.js`, [decision 0015](../decisions/0015-settings-theme-colors-in-javascript.md)). Colors that
  mean something (live green, paused amber, the red window close button, release-note colors) stay the same in every
  theme. Text on accent fills is white or black, whichever reads better.
- **Readable by default:** every built-in theme passes WCAG AA (4.5 : 1 for text and dim text, 3 : 1 for control
  borders), checked by `tests/ui/app-themes.test.mjs`. A person's own theme gets a **warning, never a lock**: the edit
  bar says "Easy to read" or names the worst problem with its ratio.
- **Making your own:** **+ New theme** (a dashed card after the themes) starts from the theme in use; a custom theme's
  **⋯** menu has **Edit**, **Export…** and **Delete…**; **Import…** sits under the gallery. Up to 20, saved in the
  settings. Editing happens in a **docked edit bar** along the bottom of the window, never a popup, so the whole window
  changes live; it stays while the person moves between tabs. **Cancel** puts the colors back; **Save** keeps and picks
  the theme.
- **What stays dark:** the stage behind the overlay in the live preview and the Style tab's overlay theme cards
  (`--color-stage`), because they show what OBS shows. The strip around the preview follows the theme.
- **The header logo follows the theme** (outer square: accent; key: panel; K: text). A devbuild shows its purple logo
  picture in every theme. The icons the system draws (taskbar, tray or menu bar, installer, Dock) are files and keep
  the app's own colors.

## 15. Trying it

`npm run ui-sandbox` opens the real settings window in a browser at http://127.0.0.1:7882/ with a stand-in app. Pick a
screen with `?state=live|off|paused|paused-no-obs|port-in-use|first-run|update|whats-new|whats-new-long|mac-allow|mac-restart|mac-secure`, `&tab=…` and
`&devbuild` (list in `tools/sandbox/fake-app.js`). Check visual changes with `npm run test:visual` on Windows.

## Not in v2.0

New navigation, a setup wizard, new overlay themes or animations, and any
change to how the overlay looks in OBS.
