# UI audit of v1.4.0-dev, for v2.0

What the settings window, popups, tray and overlay look like today (origin/v1.4.0-dev at e3683c5, step 4a), and what
v2.0 should do about each finding. Screenshots were taken in Chromium with a stand-in for the app, at the default window
size (1060 × 800) and the smallest one (820 × 600). Fonts and the window buttons' icon font differ from Windows, so
check anything about exact pixels on Windows.

Each finding says **where** it was seen, **what** is wrong, and the **v2.0 answer**. "Covered" means
[v2-redesign.md](v2-redesign.md) already answers it; "new" means this audit found it.

## 1. Whole window

| # | Finding | v2.0 answer | |
|---|---|---|---|
| 1.1 | The live preview takes about a third of the window on **every** tab, including Keys, where the editor already shows the same keyboard. At the smallest size, the Keys editor is pushed almost off the screen. | Hide the preview on Keys (covered). On the other tabs, cap its height so the controls stay in view, and let it shrink first when the window is small. | covered + new |
| 1.2 | At 820 px wide the header is cramped: the title runs into "OBS Browser Source URL", "Copy OBS URL" wraps onto two lines and "Size: 1085×403" wraps too. | Below about 1000 px, drop the "OBS Browser Source URL" label (the field's placeholder and accessible name keep it) and show the size only as a tooltip. Buttons never wrap (`white-space: nowrap`). | new |
| 1.3 | The pause bar pushes the whole window down by 50 px when it appears, so everything jumps. | The bar goes; the pause button and the header status replace it (covered). Rule for any future bar: overlay it or reserve its space, never shift the page. | covered + new |
| 1.4 | The header's OBS link field has no name a screen reader can say: the text beside it is a plain `<span>`, not a `<label>`. | Make it a real `<label for="obsUrl">`, or add `aria-label`. | new |
| 1.5 | The floating round update button sits alone in the bottom-left corner, far from everything else, with no text. | Move it into the header next to the status, as a small "Update ready" chip; the tray's orange dot stays. | new |
| 1.6 | Wording mixes "OBS URL", "OBS link", "Browser Source URL" and "secure link" for the same thing. | One word: **OBS link** everywhere (header button "Copy OBS link", General, toasts, tray). | new |

## 2. Tabs

| # | Finding | v2.0 answer | |
|---|---|---|---|
| 2.1 | **Layout:** cards are `<div>`s, so they can't be reached with Tab or chosen with the keyboard; deleting is right-click only, and the help text has to explain it. | Cards as buttons with a "⋯" menu (covered; the master session's step 4b is building it for v1.4). | covered |
| 2.2 | **Layout:** "+ 0/20 layouts" reads as "zero out of twenty" with no subject. | "Your layouts: 0 / 20" (covered). | covered |
| 2.3 | **Keys:** a four-line paragraph sits above a toolbar of five labelled groups (Selection, Move, Align, Space evenly, History, View). Align, Space evenly and the arrows look clickable with nothing selected. | The canvas-first editor ([key-editor.md](key-editor.md)) replaces it. Until then, disable the tools that need a selection. | covered + new |
| 2.4 | **Style:** themes and presets are dropdowns, so you can't see a theme before choosing it. | Theme gallery and preset cards (covered). | covered |
| 2.5 | **Style:** every colour has a second, unlabelled slider (85 %, 25 %…) that is really its see-through amount. Nothing says so. | Put the amount inside the colour picker popup, or label it "See-through". | new |
| 2.6 | **Style:** values use three formats for the same idea: "100 %" next to colours, "1" for Opacity, "1×" for Scale; Font weight shows a raw "600". | Percent for opacity, "×" for scale, and names for weights (Regular, Semibold, Bold). | new |
| 2.7 | **Animation:** one dropdown, "None" by default, and a developer note ("GPU friendly"). | Animation gallery cards (covered), plain text by default with the technical line in Debug mode (covered). | covered |
| 2.8 | **Fonts:** an almost empty tab with one sentence and two buttons. | Merged into Style → Text (covered). | covered |
| 2.9 | **General:** one long column of seven sections. "Copy" and the size repeat the header. Restart server, Open data folder, Reset all settings and Quit app sit together as if related. Labels wrap ("Debug mode (for developers)"). | Section cards in two columns, the duplicate link removed, Debug and Reset under Advanced (covered). New: "Quit app" moves to the tray and the window's own menu only. "Open data folder" goes under Advanced. Labels short enough to fit one line. | covered + new |
| 2.10 | **General:** on/off settings are checkboxes, while the v2.0 design uses switches. | One switch building block for every on/off setting (covered by "shared building blocks"; listed so it isn't missed). | covered |
| 2.11 | **General:** the input method is a dropdown with "(keyboard hook)" and "(Raw Input)" in the option names. | A Standard / Compatibility segmented choice, with the technical names in Debug mode (covered). | covered |

## 3. Popups and messages (not in the v2.0 design until now)

| # | Finding | v2.0 answer | |
|---|---|---|---|
| 3.1 | Three popups are built three ways: the shared `dialog()`, the release notes (`#modal`) and the update window (`#updModal`), each with its own markup, keys and closing rules. Enter closes the release notes but not the others. | **One popup building block** used by all of them: the same frame, keys and focus rules. | new |
| 3.2 | Button order and colour already match across popups (secondary left, primary right, red only for Reset), which is good and should be written down as the rule. | Keep it. Write it into the building block. | new |
| 3.3 | Focus: v1.4.0-dev (step 4a) already moves focus into a popup, keeps Tab inside it and gives focus back when it closes, in one shared place. Good. | Keep that code as the base of the shared popup, so all three popups get it the same way. | new |
| 3.4 | **Update window:** the title is "Update available — v1.5.0" and the first line is "You have v1.4.0 · Stable channel". It's clear but technical for a first line. | "A new version is ready (v1.5.0)", then what's new, then "Update now". The channel line goes to Debug mode. Progress stays in the same window. | new |
| 3.5 | **What's new:** the typing effect is light and respects "reduce motion". | Keep it, inside the shared popup. | new |
| 3.6 | **Notices (toasts):** wording varies: "OBS URL copied", "Copied", "Settings copied", "Log copied"; "Port changed — update your OBS source URL" is an instruction hidden in a notice that disappears. | One pattern: "<thing> copied". Anything the user must act on (a new port, a new secure key) stays on screen until done: a header chip or a line in General, not a disappearing notice. | new |
| 3.7 | **Right-click menu:** only layout cards have one, so nobody expects it. | The "⋯" menu replaces it (covered). Right-click can stay as a shortcut to the same menu. | covered |

## 4. Outside the settings window

| # | Finding | v2.0 answer | |
|---|---|---|---|
| 4.1 | **Tray menu:** Pause overlay, Layout ▸, Open settings, Copy OBS URL, Restart server, Quit. Wording differs from the window ("OBS URL"). | Same words as the window: "Copy OBS link". The tray's pause item stays in sync with the pause button and header status (covered). | new |
| 4.2 | **Tray tooltip** is only "Keystroke Overlay". | "Keystroke Overlay: live in OBS / paused / not connected", from the same status logic (`obs-status.js`), updated only on changes. | new |
| 4.3 | **Overlay locked notice** (wrong secure key, shown inside OBS) uses its own inline styling. | Plain English, the same wording as General, and OBS-friendly: small, top-left, removable. No design change in OBS otherwise (covered: "no change to how the overlay looks"). | new |
| 4.4 | **Favicon 404** on every page load, settings and overlay (also reported in the v1.3.0 QA). | Serve the new logo as the icon. | new |
| 4.5 | **Window buttons** (minimize, maximize, close) use Windows' icon font. They show as boxes on other systems. | Draw them as small inline SVGs, so Linux and macOS get them too (docs/CROSS-PLATFORM.md). | new |

## 5. Accessibility sweep (automated, every tab)

- Unnamed controls: only the header's OBS link field (1.4). The master session's step 4a fixed the Style and General
  sliders, colour pickers and checkboxes on v1.4.0-dev.
- Mouse-only elements: the Layout cards (2.1) and the Keys editor's key map. The key editor's keyboard support is
  specified in key-editor.md.
- Tab order: header → preview frame → tab list → tab content. The preview frame takes a Tab stop but shows no focus
  ring and does nothing with the keyboard: take it out of the Tab order (`tabindex="-1"`), since it is a picture.
- Reduce motion: respected by the release notes and two CSS blocks. v2.0 rule: every new animation gets a reduced
  version (the pause pill appears without sliding).

## 6. What stays

The dark palette and blue accent, the left tab list, the always-visible OBS link, the live preview, the plain-English
privacy notes, the button order in popups, and the light "typing" release notes. The redesign builds on these.
