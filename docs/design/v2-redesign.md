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

## Per tab

| Tab | v2.0 |
|---|---|
| **Layout** | Cards show a **mini picture of the layout's shape**, a clear selected ring, and a **"⋯" menu** (rename, duplicate, export, delete) that works with the keyboard. "+" stays the first card. Import lives in the "+" card's menu. |
| **Keys** | The key editor makeover ([key-editor.md](key-editor.md)). |
| **Style** | A **theme gallery** (clickable swatch cards). **My presets as cards** with a "Save current look" card. Controls in short sections: Colors (inline swatches), Shape, Text (font picker with **Add font file…** and **Your fonts**), Size; sliders show their value. **Reset ▾**. |
| **Animation** | A **gallery of animation cards** that demo on hover, then Speed, Intensity and Easing. |
| **Fonts** | **Removed as a tab**: merged into Style → Text. |
| **General** | Section cards in plain language: **Connection** (port, secure link), **Keyboard input**, **Startup**, **Updates**, and a collapsed **Advanced** (Debug mode, Reset all settings). The duplicate OBS link goes (the header has it). |
| **Header** | Adds a small **"● OBS connected / Not connected"** status: the number of overlay connections, from the local server, nothing more. |

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
