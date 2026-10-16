# v2.0 redesign: "same app, smarter tabs"

Status: **approved direction (Jordan), for v2.0.** Prototypes are in the same Claude Design canvas as the key editor
(Jordan's private link: https://claude.ai/artifact/BmtiAStvoDhR5j7h3cy3CE). Build it on the UI foundation (tokens, shared
building blocks, tab lifecycle) and follow CLAUDE.md §5 (UI rules). The key editor ([key-editor.md](key-editor.md)) is the
reference: every tab should feel like it belongs next to it.

**Scale:** a step up, not a new app. Keep the skeleton (left tab list, header with the OBS link, live preview, dark
palette). Change how each tab is organised and how its controls work.

## Keep

- Left tab list; the header's **OBS link + Copy** always visible; the **live preview** on top (hidden on the Keys tab).
- The dark palette and type (as tokens); the Layout tab's card idea.

## Change, everywhere

- **The key editor's heading row on every tab:** title + one-line subtitle on the left, the tab's main switch or action on
  the right.
- **Section cards** instead of one long form: a short section title, its controls, nothing else.
- **Help shrinks to one short line**; detail goes in tooltips. No paragraph of instructions at the top of a tab.
- **Small choices are segmented switches** (like Keyboard shape | Even grid), not dropdowns: e.g. Update channel
  Stable | Latest, Input method Standard | Compatibility.
- **Reset ▾ menus** per tab where resetting makes sense, worded like the editor's.
- **Plain language by default; technical detail in Debug mode** (see below).
- **One set of states for every button and control** (buttons, tabs, segmented switches, switches, menus, the pause
  button): rest → **hover** (a step lighter) → **pressed and held** (a step darker) → release back to hover. Blue
  buttons: hover #4677e0, held #2f5cb8; plain buttons: held #181b23. Colour only: nothing shrinks or moves. Keyboard
  focus shows the blue ring. Cards (layouts, themes, presets) keep just their hover and selected ring.

The full audit of today's UI, including popups, the tray and the overlay's own messages, is in
[ui-audit.md](ui-audit.md).

**Popups** (approved; Popups board on the canvas): one shared popup for everything. It is as wide as 560 px and as tall
as its text, up to 80% of the window and never more than 640 px; longer text scrolls in the middle while the title and
buttons stay in view. Sizes are measured against the window, so they follow window size and Windows' display scaling.

**Release notes** (What's new and the update popup): always the same five sections, in this order, each with its own
icon and colour, so a reader can find fixes or new features at a glance. A section with nothing to say is left out.

| Section | Icon | Colour | For |
|---|---|---|---|
| New | ✨ | blue `#7aa8ff` | things you couldn't do before |
| Improved | 🛠 | violet `#b79cff` | things that work better |
| Fixed | 🐛 | amber `#ffd27a` | bugs that are gone |
| Performance | ⚡ | green `#8fe3a8` | speed and memory, with numbers vs the last version |
| Under the hood | 🧰 | grey `#8b93a7` | for developers |

Colour is on the heading and a thin line beside its list only; the list text stays the normal colour, and the icon and
word mean colour is never the only signal. Every release ends with one plain line on what was kept ("Your settings,
layouts, presets and fonts are kept."). To make this real: CHANGELOG.md entries use `### ✨ New`-style headings (today
they are bold lines, which the app shows as plain text, not as headings); the notes renderer in popups.js gives each
known heading its colour (tokens in settings.css); and the release check (tools/changelog-section.mjs) refuses an
entry with an unknown heading or the wrong order.

**Update ready chip, what a click does:** it opens the update popup (Popups board: "A new version is ready") right where
the user is, on any tab. It does not switch to General; the user stays on their tab, and closing the popup leaves them
there. General → Updates keeps its own "Check now" and update controls for people who go there on purpose. The tray's
"Update available" does the same (approved): it brings up the settings window (or opens it, on its usual first tab) with the update popup open, instead of switching to General.

**Update ready chip** (header, replaces the floating round button): on hover or keyboard focus its ↓ drops out of the
bottom of its own small box and comes back in from the top, once, like a download. The box clips it, so only the arrow
moves, never the chip. Same feel as the pause button: it starts 150 ms after the mouse arrives (a pass-over does
nothing), and once started it always plays to the end, even if the mouse leaves. Keyboard focus starts it at once. About
half a second; `transform` and `opacity` only; no animation with "reduce motion" on. Building it needs a little JS (a
150 ms timer only while hovered, and a class removed on `animationend`), because CSS alone stops an animation the moment
hover ends.

## Per tab

| Tab | v2.0 |
|---|---|
| **Layout** | Cards show a **mini picture of the layout's shape**, a clear selected ring, and a **"⋯" menu** (rename, duplicate, export, delete) that works with the keyboard. "+" stays the first card. Import lives in the "+" card's menu. |
| **Keys** | The key editor makeover ([key-editor.md](key-editor.md)). |
| **Style** | A **theme gallery** (clickable swatch cards). **My presets as cards** with a "Save current look" card. Controls in short sections: Colors (inline swatches), Shape, Text (font picker with **Add font file…** and **Your fonts**), Size; sliders show their value. **Reset ▾**. |
| **Animation** | A **gallery of animation cards** that demo on hover, then Speed, Intensity and Easing. |
| **Fonts** | **Removed as a tab**: merged into Style → Text. |
| **General** | Section cards in plain language: **Connection** (port, secure link), **Keyboard input**, **Startup**, **Updates**, and a collapsed **Advanced** (Debug mode, Reset all settings). The duplicate OBS link goes (the header has it). |
| **Header** | Adds a small status that shares the pause state: green **"● Live in OBS"**, amber **"⏸ Paused"** (paused wins; with OBS closed it reads **"⏸ Paused · OBS not connected"**), or grey **"○ Not connected to OBS"**. It uses only the number of overlay connections from the local server, nothing more. |
| **Live preview** | A small round **⏸** button in its top right corner (`aria-label` "Pause overlay"). On hover or keyboard focus the circle stretches smoothly into a pill and the word **"Pause"** slides out with it (only `transform` and `opacity` animate). It opens 150 ms after the mouse arrives (180 ms slide), so a pass-over does nothing; it closes 150 ms after the mouse leaves (260 ms slide), so a quick point-click-leave never snaps shut; keyboard focus opens it at once. Paused, it turns amber and shows **▶ / "Resume"**. It is the same setting as the tray's pause, so the button, the header and the tray always agree. While paused, OBS still shows the keyboard but no key presses; only the button and the header status show it (no banner). |

Smaller details: the Layout tab counts only your own layouts, **"Your layouts: N / 20"** (built-in layouts don't count, so a
new install shows 0 / 20). The key editor's "No key selected" note is three short lines, not one long sentence (see
[key-editor.md](key-editor.md)). Logo: design A, "Keycap K", is chosen; its sources, including the black and purple devbuild
version, are in `assets/logo/`.

## Plain language, with detail in Debug mode

By default every label, note and message is written for a streamer, not a developer. When **Debug mode** is on, the same
places also show the technical detail, in a small dim "details" line or tooltip next to the plain text. Examples:

| Where | Default (everyone) | Extra in Debug mode |
|---|---|---|
| Animation tab | "Smooth animations that don't slow your stream." | "Animates only `transform` and `opacity` (compositor, GPU)." |
| Connection | "Connection: OBS link and port" | "Local server on 127.0.0.1:7878; WebSocket clients: 2" |
| Keyboard input | "Standard works with nearly every game. Try Compatibility if keys don't light up in one game." | "Standard = WH_KEYBOARD_LL hook; Compatibility = Raw Input (RIDEV_INPUTSINK). On Linux: XInput2 raw events." |
| Secure link | "Only programs with your full link can see your key presses." | "128-bit key, constant-time check on /api, /ws, /fonts, /user." |
| Updates | "Checks about once an hour; never installs without your click." | "Manifest URL, last check time and result, signature verified." |
| Header status | "● OBS connected" | "2 overlay clients · 0 held keys · paused: no" |

Rules: one TEXT entry per plain line, plus an optional `debug` detail beside it. Detail never replaces the plain text,
never appears unless Debug mode is on, and never shows private data (the secure-link key, key presses) in screenshots
or logs.

## Not in v2.0 (too much)

New navigation, a setup wizard, a light theme (tokens make it a later one-file change), new themes or animations, and
any change to how the overlay looks in OBS.
