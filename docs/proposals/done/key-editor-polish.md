# Proposal: polishing the key placement editor (v1.3.0)

Status: Built (commits 1 to 7), and now SUPERSEDED by the approved design spec [../../design/key-editor.md](../../design/key-editor.md), which
describes the makeover that replaces this layout. Kept as the record of how the first version was planned.

## Where we are

The Keys tab already lets you drag a key, nudge it with the arrow keys, type exact X/Y numbers, close gaps with "Tidy up", and
reset positions. Positions are stored per layout (`settings.layout.profiles[layoutId].positions`), the live preview follows, and
the overlay window shrinks to fit. It works, but it moves **one key at a time**, has **no undo**, and shows no numbers while
you drag. The goal of this pass is to make it feel like a small, proper layout editor without turning it into a different app.

## Guiding rules

- **Same look as the rest of the app.** Reuse the existing pieces (`.keymap`, `.kmk`, `.btns`, `.editor`, `button()`, `row()`,
  `heading()`, `note()`) and the existing colours. No new libraries, no build step, plain ES modules.
- **No new settings format.** Everything below still saves only `positions`, `disabledKeys` and `labels`, so there is no
  migration and the overlay needs no change. (Key resizing would need a format change, so it is a separate, optional step, see
  the end.)
- **Light.** No timers while idle. Handlers exist only while a drag or marquee is in progress. History lives in memory only.
- **Private.** Nothing is stored outside the settings file, nothing leaves the PC.
- **Readable code.** Files stay under about 400 lines, one job each, with the CLAUDE.md conventions.

## What you will be able to do

1. **Select several keys.** Click selects one. Ctrl- or Shift-click adds or removes a key (a mouse click, not a shortcut). Drag on
   an empty part of the picture to draw a selection box (a "marquee"): that is how you select many keys, or all of them. A
   **Clear selection** button deselects. There is no Select all shortcut. Selected keys get the same highlight as today's single
   selection.
2. **Move a group.** Dragging any selected key moves them all together, keeping their shape. A small on-screen **nudge pad** (four
   arrow buttons, plus a "whole key" tickbox) moves the whole selection by one snap step; the existing arrow-key nudging keeps
   working too. The group stops at the edge of the box instead of squashing.
3. **Align and distribute.** An "Arrange" row of buttons: align left / centre / right / top / middle / bottom, and space evenly
   horizontally / vertically (needs 3 or more keys). Buttons are disabled, with a tooltip saying why, when they do not apply.
4. **Undo and redo.** **Undo** and **Redo** buttons (no keyboard shortcuts). One drag, nudge, align, tidy or reset is one step. Covers moving keys, hiding keys and labels for the current layout. Up to 50 steps (a named constant), cleared when you
   switch layout; nothing is kept after the window closes.
5. **See what you are doing.** While dragging, a small readout shows `x 3.25   y 1`. Under the picture, a status line shows the
   selection ("W selected: x 1.25, y 0", or "3 keys selected") and how many keys are moved from the layout file.
6. **Choose the snapping.** A "Snap" menu: Off / quarter key (default) / half key / whole key. The nudge step follows the chosen
   snap. An optional "Show grid" tickbox draws faint dots at the snap spacing. **Both choices are remembered** between sessions
   (see "A new saved setting" below).
7. **Accessible.** Keys can be reached with Tab, show a clear focus ring, and announce their state to screen readers
   (`role="button"`, `aria-pressed`). Enter or Space selects, arrows nudge. Everything is also reachable with the mouse and the
   buttons, which is the main way to use it.
8. **Clean layout of the controls.** One toolbar above the picture in labelled groups, in this order: Select (Clear selection,
   nudge pad), Arrange (align and distribute), History (Undo, Redo), View (Snap, Grid). The existing buttons (Enable all, Disable all,
   Reset all labels, Tidy up, Reset positions, Revert to Default) stay below, grouped as "Reset". When several keys are selected,
   the panel under the picture shows the group: show/hide them all, move them by an exact amount, and the count.

## A new saved setting (snap and grid are remembered)

Because you asked for the choices to persist, the settings file gains two small values under the layout section:
`layout.editor = { "snap": 0.25, "grid": false }`. It follows CLAUDE.md section 4:

- the default lives in `defaults()` in `src-tauri/src/settings.rs`; the sanitizer only accepts `snap` of 0, 0.25, 0.5 or 1 and
  `grid` of true or false, and falls back to the default for anything else;
- a unit test covers the defaults, bad values (wrong types, out-of-list numbers, huge or negative numbers) and an older settings file
  that has no `editor` entry; if loading an old file needs a migration step instead of just filling in defaults, it gets one plus
  a test;
- `docs/FILE-FORMATS.md` and the settings schema docs are updated in the same commit;
- the control uses the normal `CONTROLS` / settings path, so it is saved and shared like every other setting.

## How it will be built (so it stays readable)

| File | Job |
|---|---|
| `ui/settings/tabs/keys.js` | the tab itself: heading, toolbar, button rows, the editor panel |
| `ui/settings/tabs/keys-map.js` | the keyboard picture: drawing, drag, marquee, readout |
| `ui/settings/tabs/keys-arrange.js` | align / distribute maths as plain functions (no page code, so they can be unit tested) |
| `ui/settings/tabs/keys-history.js` | undo / redo stack |
| `ui/settings/state.js` | gains `selectedKeys` (the set) next to `selectedKey` (the one the editor shows) |

The existing `profiles.js` helpers (`keyPos`, `setKeyPos`, `tidyProf`, ...) keep doing the saving.

## Tests

- Unit tests (Node's built-in test runner, no new dependency) for the align / distribute maths and the history stack, wired into
  `npm test`; Rust unit tests for the new `layout.editor` setting (defaults, hostile values, old files).
- Extend `tests/e2e/suites/keys-editor.mjs`: click and Ctrl-click selection, marquee, group drag, group nudge, align, distribute,
  undo and redo (including redo being cleared by a new edit), snap choices and that they survive closing and reopening the
  window, readout text, and that the live preview and the overlay size follow every one of these.
- `ui-sweep`: toolbar fits and nothing overflows at the narrow and wide window sizes; no console errors.
- Full e2e, clippy, format and privacy checks before each commit, and the benchmark before the final one (idle CPU must stay
  about 0%).

## Order of work (each its own commit, tests between)

1. `refactor(keys)`: split `keys.js` into the files above, no behaviour change.
2. `feat(keys)`: multi-select (click, Ctrl-click, marquee, Clear selection button) and group move, with a nudge pad.
3. `feat(keys)`: align and distribute.
4. `feat(keys)`: undo and redo.
5. `feat(settings)`: the saved `layout.editor` setting (Rust default, sanitizer, tests, docs).
6. `feat(keys)`: snap menu, grid, drag readout, status line, using that setting.
7. `feat(keys)`: accessibility, tidy toolbar layout, help text, docs.

## Decisions made (by Jordan)

1. **Key resizing:** held off for now. Not part of this work.
2. **Snap and grid choices:** remembered between sessions, as a saved setting (see above).
3. **Shortcuts:** none. Everything is a button; there is no Ctrl+A, Ctrl+Z, Ctrl+Y or Esc. To select many keys you drag a box around
   them with the mouse. Buttons must be integrated into the toolbar in the existing style.
