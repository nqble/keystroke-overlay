# Key editor: design spec (makeover planned for v1.4, reference for the v2.0 redesign)

Status: approved by Jordan, designed in the Advisory Session. **Being built in three parts** (M4.1 to M4.3). Part 1 (M4.1) is in
on `v1.4.0-dev` (2026-10-17): the editor in its own module (`ui/settings/editor/`, section 9a), kept alive and loaded on first use,
the board with zoom and pan, the preview hidden on the Keys tab, and everything the 1.3 editor did. Part 3 (M4.3) is in as well: the layout style switch, Close gaps, the Reset menu, and the Even grid tip. Part 2 (M4.2) is in too: resize handles, smart guides, the held-key fade, the arrange bar that floats above
selected keys, the inspector to the right of the editor, and the toolbar with undo, redo, Snap and Grid. Still to come (M4.3): the
layout style switch, "Close gaps" and the Reset menu (the old buttons under the editor stay until then), the hint about Even
grid, the accessibility pass and the release notes. The geometry it uses has unit tests: `keys-board.js`, `keys-view.js`, `keys-guides.js` and `layout.grid` (d225d66, 14f6fc3, adb2cef, 3de07fe). Interactive prototype (Jordan's private link):
https://claude.ai/artifact/BmtiAStvoDhR5j7h3cy3CE. Where this file and the prototype disagree, this file wins.

Build it AFTER UI foundation steps 1–5 (1–3 are done) (test hooks, visual baselines, tokens, shared building blocks, look/logic split), using
tokens and shared building blocks only. The colors below are today's values; map each one to its purpose token.

## 1. Goal

Someone opening the Keys tab for the first time can move keys where they want within a couple of minutes, without reading
help text. The keyboard is the thing they work on, so it is the first and largest thing on the tab. Tools appear when
they are useful and are hidden otherwise.

## 2. Layout (Keys tab, top to bottom)

1. **Heading row.** On the left: "Keys" (h2) with the layout name under it (dim). On the right: "Layout style" label and a
   segmented switch **Keyboard shape | Even grid**.
2. **Toolbar row (one row, never wraps at the normal window size).**
   Undo (icon) · Redo (icon) | Snap (toggle, icon + label) · Grid (toggle, icon + label) | Close gaps (icon + label) ·
   Reset ▾ (menu). Status text on the far right: "N moved · N hidden", plus "· N keys overlap" in the danger color when
   any keys overlap.
3. **Content row.** The editor box (flexible width) and, to its RIGHT, the inspector panel (fixed ~260px, top-aligned).
   Never put the inspector below the editor.
4. **Hint line under the editor box**, one line: "Drag a key to move it. Ctrl-click to add." on the left. On the right,
   keycap chips each with one word: [←][↑][↓][→] nudge · [Shift] whole key · [Del] hide · [Scroll] zoom · [Middle-drag] pan.
   Each chip has a tooltip with the full sentence.

**Removed:** the help paragraph, the on-screen arrow buttons, the "Whole key" tickbox, the Snap-size menu, the always-visible
Align / Space-evenly groups, the selection summary + Clear selection row, and the old row of reset buttons (Enable all,
Disable all, Reset all labels, Tidy up, Reset positions, Revert to Default).

**The top live preview** (the overlay preview above the tabs) is HIDDEN while the Keys tab is open, because the editor
already shows the keyboard. Hide it with a CSS class on a parent (e.g. `.tab-keys .preview { display: none }`). Do NOT
destroy or rebuild it: it stays loaded so switching to Layout, Style, Animation and the other tabs is instant. Add a test that
switching Keys → Style → Keys does not reload the preview.

## 3. The editor box and board

- **The board** is a fixed area, measured in keys, that every key must stay inside. It is drawn slightly lighter than the
  editor box background, with a 1px line edge and rounded corners. The grid dots are drawn on the board only.
- **Board size:** (layout width + 8) × (layout height + 6) keys, rounded up to whole keys, minimum 24 × 12. On first open (and
  after "Reset this layout completely") the layout is centered on the board, aligned to the snap step.
- **Keys can never leave the board.** Dragging, nudging, typing X/Y, aligning, spacing and resizing are all clamped so
  x ≥ 0, y ≥ 0, x + w ≤ board width and y + 1 ≤ board height.
- **Editor box height:** fills the space down to the hint line (about 420px at the normal window size), with no page scroll.

### Zoom
- Mouse wheel anywhere inside the editor box (grid on or off) zooms **toward the cursor**: the point under the cursor stays
  still.
- Speed: factor = e^(−deltaY × 0.0012), about 12% per wheel notch. Smoothed by a 110ms ease-out transition on the board
  layer's `transform`, so it feels soft but never laggy.
- Range: from "the board just fills the box" (cover) up to 200%. You can never zoom out far enough to see outside the board.
- Zoom control in the box's bottom-right corner: [−] [100%] [+]. Clicking the percentage resets to 100% and centers the board.
  The ± buttons zoom about the box center by ×1.2.
- The wheel listener must be **non-passive** (`addEventListener('wheel', fn, { passive: false })`) so the window does not
  scroll while zooming.

### Pan
- **Middle mouse button + drag pans the view from anywhere in the box**, including when pressed on top of a key (it never
  selects or moves the key). The cursor shows "grabbing" while panning, and the browser's middle-click autoscroll is
  prevented.
- **Limits:** the view may only show the board. While the middle button is held and the user pulls past an edge, the view
  stretches at 30% of the pointer's movement (rubber band). On release it eases back (the same 110ms ease-out) so the board's
  edge sits exactly at the box's edge, and nothing outside the board shows at rest.
- No transition while actively panning or dragging a key (it would lag).

## 4. Keys: states and interaction

| State | Look |
|---|---|
| Normal | panel-raised fill (`#222632`), 1px line border (`#343a4d`), text color |
| Hover | darker solid gray fill (`#1b1e26`), **no border**; 90ms ease-out on background-colour |
| Selected | selection fill (`#26324d`) + 2px accent ring (`box-shadow 0 0 0 2px #4f8cff`) |
| Held (mouse down on it, or a resize in progress) | selected look + lift shadow (`0 8px 18px #000a`); **all other keys fade to opacity 0.35** over 160ms ease-out; on release everything fades back to 1 |
| Overlapping another key | 2px danger ring (`#ff5d6c`), shown above the selection ring |
| Hidden | transparent fill, 1px DASHED line border, dim text (`#596075`); still clickable so it can be shown again |

- **Select:** click a key. Ctrl-click (or Shift-click) adds or removes it. Drag across empty board space for a box selection
  (Ctrl adds to the current selection). Click empty space to clear. Esc clears. Ctrl+A selects all.
- **Move:** drag any selected key; the whole selection moves together. A 3px dead zone stops clicks from turning into moves.
  While dragging, a small accent badge under the selection shows "x 3.5 · y 2".
- **Snap (toggle, on by default):** positions snap to 0.25 key (1 key in Even grid). With Snap on in Keyboard shape mode,
  **smart guides** also apply when dragging: if the dragged key's left or right edge comes within 0.2 key of another visible
  key's left or right edge, it snaps to it and an orange 1px guide line (`#ff9f43`) is drawn through the board; the same for
  top edges. Snap off = free movement (1px steps).
- **Grid (toggle, on by default):** shows dots every ½ key (every 1 key in Even grid). Display only.
- **Resize:** when exactly one visible key is selected, thin accent lines (4px, with a board-coloured outline and a larger
  area to grab) appear on **all four sides** (changed from the original design, which had left and right only). Drag a handle
  to resize; the opposite edge stays put. Width or height snaps to 0.25 with Snap on. Min = 1 key (or the layout's own size
  if smaller); max = up to the board edge in that direction. Badge shows "width 3.5" or "height 2" while dragging. Other keys
  fade exactly as when holding a key. The inspector has Width and Height fields.
- **Floating arrange bar:** when 2+ keys are selected (and not while dragging or box-selecting), a small toolbar floats
  10px above the selection (below it if there's no room above). Icon buttons with tooltips: align left, align centers,
  align right | align tops, align bottoms | space evenly across, space evenly down (both disabled under 3 keys).

### Keyboard shortcuts (Jordan's decision; act only while the Keys tab is open, no text field has focus and no popup is open)
Arrow keys nudge the selection 0.25 key (Shift = 1 key; Even grid always 1) · Delete / Backspace hide the selection ·
Ctrl+Z undo · Ctrl+Shift+Z and Ctrl+Y redo · Ctrl+A select all · Esc clear selection.

## 5. Toolbar details

- **Undo / Redo:** icon buttons, disabled when there's nothing to undo or redo. Undo covers every change on this tab
  (move, resize, hide or show, label, align, space, close gaps, reset, layout-style switch). Keep about 50 steps.
- **Close gaps** (renamed from "Tidy up"). Tooltip: "Slide keys together to close the empty space left by hidden or moved
  keys. The shape stays the same." Behaviour: gaps wider than ¼ key (0 in Even grid) between groups of visible keys are
  closed to ¼ key, along both axes, keeping every key's relative order; then the result is centered on the board.
- **Reset ▾** (Jordan keeps all five): Put selected keys back · Put all keys back · Show all hidden keys · Reset all labels ·
  a divider · **Reset this layout completely** (danger color, asks "Reset this layout? Positions, sizes, hidden keys and labels go
  back to the layout file. You can undo this."). Every item is undoable.

## 6. Layout style: Keyboard shape | Even grid

- **Keyboard shape:** keys as the layout file draws them.
- **Even grid:** every key is 1 key wide in neat columns, row by row (the layout's rows kept, keys numbered left to right),
  centered on the board. Snap step and grid dots switch to whole keys.
- Each style keeps its OWN positions and sizes, so switching back and forth never loses work. The switch is undoable.
- The overlay in OBS draws whichever style is selected.

## 7. Inspector panel (right of the editor)

- **Nothing selected:** "No key selected" + two short tips: (1) click a key to change its label or hide it, drag keys
  anywhere and they line up with their neighbors; (2) "Want every key the same size in neat columns? Switch Layout style to
  Even grid."
- **One key:** "Key: W" title with a "Show" checkbox on the right; Label field; Width field ("Width in keys · or drag the blue
  handles"); Position X / Y fields (step 0.25); when it overlaps: a danger-tinted note "This key overlaps another. Drag it to a
  free spot, or press Close gaps."; when moved or resized: "Put back where it was".
- **Several keys:** "N keys selected" + Show checkbox (on if any are shown); one line "Drag any of them to move them together.
  Use the bar above them to line them up or space them evenly."; buttons "Put these back" and "Clear selection".

## 8. Wording

Plain, short, friendly; sentence case; all text in `TEXT` (CLAUDE.md). Use "key" as the unit everywhere ("0.25 key",
"1 key"). Never "u", "unit" or "Whole key".

## 9. Performance (CLAUDE.md principle 3)

- The settings window only, destroyed on close; the OBS overlay is not touched (except reading sizes).
- Zoom and pan change ONLY the board layer's `transform`. Hover is pure CSS. Fades use `opacity`. No timers, no polling,
  nothing running while idle.
- During a drag or resize, update only the moved keys' CSS variables (`--x`, `--y`, `--w`) in a requestAnimationFrame-batched
  handler. Never re-render the whole tab per pointer move. Save to settings once, on release (not per move).
- Overlap detection runs on release and after each change, not per pointer move, if a full layout makes it noticeable
  (measure with the benchmark).
- Run the benchmark before and after; report idle CPU, threads and memory against the v1.2.0 numbers.

## 9a. Loading and lifetime

- **Its own module.** The editor (board, keys, pointer handling, zoom/pan, arrange bar, resize handles) lives in
  `ui/settings/editor/` and exposes a small interface, e.g. `createEditor(container, { layout, profile, onChange })` returning
  `{ setLayout, setProfile, show, hide, destroy }`. The Keys tab only places it on the page and wires the inspector and toolbar to it.
- **Loaded on first use.** The editor's code is imported with `import()` the first time the Keys tab opens, not at
  settings-window start-up. The window must open no slower than today (469ms in the v1.2.0 benchmark).
- **Built once, kept alive.** Leaving the Keys tab HIDES the editor (like the top preview). It is not destroyed, and
  `render()` must not rebuild it. Returning is instant, and zoom, pan, selection and undo history are kept. Everything is
  destroyed with the settings window as usual (CLAUDE.md principle 3).
- **Incremental updates only.** Moving, resizing, hiding/showing or relabeling keys updates only those keys' elements and the
  inspector. A full rebuild of the key elements happens only when the layout itself changes (another layout picked, layout
  style switched, import, or "Reset this layout completely"). No editor action calls the global `render()`.
- **No rebuild on resize.** A `ResizeObserver` on the editor box updates the view limits and zoom bounds. Remove the 150ms
  resize timer that re-renders the Keys tab.
- **Measure.** Add to the benchmark: settings-window open time (no slower than before), first Keys-tab open, and switching
  back to Keys (target under 50ms), plus memory with the editor kept alive versus not. Report before/after numbers to Jordan.
- **Tests.** Switching Keys → Style → Keys keeps zoom, pan and selection. The editor module is not loaded until the Keys tab
  opens. Moving a key doesn't re-create other key elements (check element identity in e2e).

## 10. Tests

- e2e (via data-test hooks): select / ctrl-select / box select; drag with snap and with a smart guide; resize both edges,
  clamped at the board and at 1 key; keys can't leave the board; zoom toward the cursor and its limits; middle-drag pan,
  including starting on a key, spring-back to the edge; every shortcut, and that shortcuts are ignored while typing in a field;
  arrange bar actions; close gaps keeps order and centers; every Reset item and its undo; layout-style switch keeps each
  style's work; hidden keys stay clickable; the preview is hidden, not reloaded, on the Keys tab.
- Visual baselines (UI foundation step 2) for: nothing selected, one key selected with handles, several selected with the
  arrange bar, a key held (others faded), an overlap, Even grid, zoomed in.
- Unit tests (Rust) for the sizes sanitizer and board clamping.

## 11. Future requirements (after v2.0): do not build now, but nothing built now may block them

- **Right-hand layouts:** layouts must never assume the left side of the keyboard. A layout for the arrow keys and numpad
  (players whose movement hand is on the right) must work exactly like WASD.
- **The numpad keys exist** in the key-name table (keymap.rs) and can be used in layouts.
- **A possible "Flip horizontally" tool** in the editor to mirror a layout.
- **Even grid and Close gaps work the same wherever the keys are** on the keyboard and the board.

## 12. Consistency (for the v2.0 redesign of the other tabs)

The other tabs should follow this editor's patterns: the same toolbar style, toggles, segmented switches, menus, inspector
panel, hover/selected/disabled states and wording rules. Add the consistency rule to CLAUDE.md's UI rules (see the
accompanying message).
