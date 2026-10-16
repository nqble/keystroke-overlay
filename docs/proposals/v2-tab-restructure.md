# Plan: v2.0 tab restructure (approved by Jordan, from the Advisory Session)

Status: Approved, not started. Builds on the master session's UI foundation step 4 (shared building blocks and the tab
lifecycle, `docs/proposals/ui-foundation.md` and `loading-and-lifetime.md` §A). Starts after that lands on v1.4.0-dev
and is merged into `advisor/v2.0`, so the two never edit the same files at once.

Goal: the file layout the v2.0 design needs (`docs/design/v2-redesign.md`), with no behaviour change in the moving
steps. Each step is its own commit, with `npm test`, clippy, `check:types`, `check:format`, `check:privacy`, the UI
sandbox and (on Windows) the screenshot tests between steps. Stop and report on any failure.

## Where things go

| Today | v2.0 |
|---|---|
| `tabs/fonts.js` (its own tab) | Folded into `tabs/style.js` as the Text section; the Fonts tab goes. Font file handling moves to `style-fonts.js`. |
| `popups.js` (three popups, menu, notes, update) | Done (step 1): `popup.js` the shared popup (focus, `dialog()`), `dialogs.js` New layout and Reset, `notes.js` the release-notes reader, `update-popup.js` the update flow, `menu.js` the "⋯" menu. |
| Header bits in `preview.js`, `messages.js`, `index.html` | `header.js`: logo, name, DEV badge, OBS status, Copy OBS link when needed, Update ready chip, window buttons (from `windowbar.js`). |
| `controls.js` (rows, sliders, colours) | Kept, plus the building blocks from step 4: section card, switch, segmented choice, gallery card. |
| `tabs/general.js` (317 lines, one column) | `tabs/general.js` with section cards; the OBS link card moves to `general-obs-link.js`. |
| `debug.js` (618 lines) | `debug/` folder: `index.js` (the tab), one file per card, `debug-report.js` stays. |

Every new file starts with the header comment CLAUDE.md asks for, stays under about 400 lines, and has tests for its
plain logic in `tests/ui/`. `docs/ARCHITECTURE.md` is updated in the same commit as each move.

## Order

1. ~~**refactor: split `popups.js`**~~ Done.
2. **feat: shared popup** (Popups board): every popup uses `popup.js`, with the approved sizing and button rules.
3. **refactor: move the header into `header.js`**. No visible change.
4. **feat: new header** (Header board): link out, DEV badge, Update ready chip, drawn window buttons.
5. **refactor: split `debug.js` into `debug/`**. No visible change.
6. **feat: General in section cards**, OBS link card, Advanced.
7. **feat: Style with Fonts merged in**, theme gallery, preset cards. The Fonts tab is removed (nothing opens it by
   name today, so no redirect is needed).
8. **feat: Layout cards** with mini pictures and the "⋯" menu (if v1.4's step 4b hasn't already).
9. **feat: Animation gallery.**
10. **feat: the key editor makeover** (`docs/design/key-editor.md`).

Steps 1–4 can run on `advisor/v2.0` before the lifecycle lands, because they don't touch the tabs. Steps 5–10 wait for it.

## Settings

No setting changes shape, so no migration is needed.
