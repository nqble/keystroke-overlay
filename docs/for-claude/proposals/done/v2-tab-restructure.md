# Plan: v2.0 tab restructure (approved by Jordan, from the Advisory Session)

Status: **Done** (2026-10-19): steps 1–11, the key editor built as M4.1–M4.3 and the Keys tab converted to Preact. Builds on the master session's UI foundation step 4 (shared building blocks and the tab
lifecycle, `docs/for-claude/proposals/done/ui-foundation.md` and `loading-and-lifetime.md` §A). Starts after that lands on v1.4.0-dev
and is merged into `advisor/v2.0`, so the two never edit the same files at once.

Goal: the file layout the v2.0 design needs (`docs/design/ui-design-v2.md`), with no behavior change in the moving
steps. Each step is its own commit, with `npm test`, clippy, `check:types`, `check:format`, `check:privacy`, the UI
sandbox and (on Windows) the screenshot tests between steps. Stop and report on any failure.

The settings window moves to Preact with htm as these steps happen: see [v2-preact.md](v2-preact.md) (done).

## Where things go

| Today | v2.0 |
|---|---|
| `tabs/fonts.js` (its own tab) | Folded into `tabs/style.js` as the Text section; the Fonts tab goes. Font file handling moves to `style-fonts.js`. |
| `popups.js` (three popups, menu, notes, update) | Done (step 1): `popup.js` the shared popup (focus, `dialog()`), `dialogs.js` New layout and Reset, `notes.js` the release-notes reader, `update-popup.js` the update flow, `menu.js` the "⋯" menu. |
| Header bits in `preview.js`, `messages.js`, `index.html` | `header.js`: logo, name, DEV badge, OBS status, Copy OBS URL when needed, Update ready chip, window buttons (from `windowbar.js`). |
| `controls.js` (rows, sliders, colors) | Kept, plus the building blocks from step 4: section card, switch, segmented choice, gallery card. |
| `tabs/general.js` (317 lines, one column) | `tabs/general.js` with section cards; the OBS URL card moves to `general-connection.js` (planned as `general-obs-link.js`). |
| `debug.js` (618 lines) | `debug/` folder: `index.js` (the tab), one file per card, `debug-report.js` stays. |

Every new file starts with the header comment CLAUDE.md asks for, stays under about 400 lines, and has tests for its
plain logic in `tests/ui/`. `docs/ARCHITECTURE.md` is updated in the same commit as each move.

## Order

1. ~~**refactor: split `popups.js`**~~ Done.
2. ~~**feat: shared popup**~~ Done: every popup follows `popup.js`'s rules (focus, Esc, Enter, lock) and the approved
   size. Each popup keeps its own markup so the e2e tests' hooks stay the same.
3. ~~**refactor: move the header into `header.js`**~~ and
4. ~~**feat: new header**~~ Done together: `header.js` has the status and chip buttons, `windowbar.js` keeps the window
   buttons (now drawn icons), and the link box lives only in General.
5. ~~**refactor: one list of tabs.**~~ Done (with the Preact tab bar, docs/for-claude/proposals/done/v2-preact.md step 4). Each tab file exports `{ id, name, render }` (and the lifecycle), and one list in
   `tabs/index.js` holds them in order. `TABS` in `settings.js` and `TAB_NAMES` in `state.js` go. Adding or removing a
   tab is then one file and one line, and a unit test checks every listed tab has an id, a name and a render. Removing
   the Fonts tab (step 8) becomes deleting one line.
6. ~~**refactor: split `debug.js` into `debug/`**.~~ Done: one file per tool, no visible change.
7. ~~**feat: General in section cards**, OBS URL card, Advanced.~~ Done (Preact, `tabs/general*.js`).
8. ~~**feat: Style with Fonts merged in**, theme gallery, preset cards.~~ Done (Preact, `tabs/style*.js`). The Fonts tab is removed (nothing opens it by
   name today, so no redirect is needed).
9. ~~**feat: Layout cards** with mini pictures and the "⋯" menu, drag to reorder, Hide for built-in layouts, and the
   ready-made library in New layout (ui-design-v2.md, Layouts).~~ Done (Preact, `tabs/layout*.js`, `layout-order.js`). The new
   `layout.order` setting gets its default in `settings.rs`, a sanitizer rule (known ids only, no duplicates) and tests,
   and Reset restores it. The eight new layout files (96%, 75%, 65%, 60%, Arrows, Numpad, Full ISO, TKL ISO) come first,
   each with the existing layout tests.
10. ~~**feat: Animation gallery** (each card demos with the animation's own file; see ui-design-v2.md, Adding more stays one
    file).~~ Done (Preact, `tabs/animation.js`).
11. ~~**feat: the key editor makeover** (`docs/design/key-editor.md`).~~ Done (M4.1–M4.3; Preact on 2026-10-19).

Steps 1–4 can run on `advisor/v2.0` before the lifecycle lands, because they don't touch the tabs. Steps 5–11 wait for it.

## Settings

One setting is added (`layout.order`, step 9). It is additive with a default, so no migration is needed; nothing
changes shape.
