# Proposal: rotate single keys

Status: **Built** (ships in v2.1.0; its lasting facts move to the reference docs, and this plan is deleted, once that
release is out). Decided 2026-10-24: the handle sits top-right, Snap turns in 15° steps, and only
the Keyboard shape style has rotation. **Built:** the formats (a layout key's `r`, a profile's `rotations`, settings
version 5, cleaning and tests) the overlay drawing turned keys (`ui/overlay/turn.js`, tested), and in the Keys tab: turned keys
on the board, the **Angle** field (15° steps with Snap), Undo, **Put back** and the "N moved" count
(`profiles.js`, tested). the rotation handle (`editor/rotate.js`, 15° with Snap, not in the Even grid), and turned keys in
the board's limits (the box they cover) and the overlap warning (their real shape) (`tabs/keys-turn.js`, tested).
KLE import keeps each key's angle, and layout pictures (the cards, the import popup) draw turned
keys (`kle-layout.js`, `layout-card.js`). End-to-end suite `key-rotation` and a `keys-turned-key` screenshot written. **Not done yet:** the
screenshot's baseline (taken on Windows after the maintainer has seen it).

Lets a person turn one key at a time in the Keys tab (for split, ergonomic or artistic layouts), and lets a layout file
say a key is turned. The whole keyboard is never rotated here: OBS already rotates a source. Imported KLE files keep
their turned keys' angles instead of being straightened.

## What the person sees

- **One rotation handle** on a single selected key: a small circle just outside its **top-right corner**, in the same
  style as the resize handles (accent line color, board-colored outline). It appears only when exactly one visible key
  is selected, like the resize handles, and never in the **Even grid** (neat columns stay neat).
- **Dragging the handle** turns the key around its center. With **Snap** on, the angle jumps in **15°** steps; with
  Snap off it moves in 1° steps.
- **The key's panel** gets an **Angle** field (degrees, −180 to 180) next to Width and Height, so rotation works with the
  keyboard and a screen reader too (CLAUDE.md §5). **Put back where it was** also puts the angle back.
- **Undo and Redo** cover rotation like any other edit. The toolbar's "N moved" counts turned keys too.
- Labels turn with the key. Animations (press down, bounce...) still move in screen directions: a turned key pressed
  "down" goes down the screen, not along its own tilt.

## The formats

Both changes are **additive**: an angle of 0 is never written, so files without rotation look exactly as today.

**Layout file** (`layouts/<id>.json`, FILE-FORMATS.md): a key may have `"r"`, its angle in degrees, clockwise, around
the key's own center. `x`, `y`, `w`, `h` keep their meaning (the key's straight rectangle); the key is drawn turned in
place.

```json
{ "code": "KeyW", "label": "W", "x": 1, "y": 0, "r": 15 }
```

`docs/schemas/layout.schema.json` gains `"r": { "type": "number", "minimum": -180, "maximum": 180, "default": 0 }`;
`clean_layout_key` in `src-tauri/src/sanitize.rs` keeps it, limited to −180..180 and rounded to 1 decimal.

**Settings** (`settings.json`, a profile's layout style): next to `positions` and `sizes`, `rotations` holds the angle of
each key the person turned, in degrees:

```jsonc
"styles": { "shape": { "positions": { }, "sizes": { }, "rotations": { "KeyW": 15 } } }
```

Cleaned like the other two: finite numbers only, −180..180, 1 decimal, at most 300 keys, written only when not empty.
Only the `shape` style has rotations.

**Migration:** the settings version goes from 4 to 5 with an empty migration step. Nothing needs converting; the bump
is there so a downgrade keeps the person's angles: an older version drops keys it doesn't know (`rotations`), and the
version bump makes it copy the newer file aside first (decision 0007), so the angles come back after updating again. A
unit test checks a version 4 file loads unchanged, and one checks `rotations` survive a save.

## How it is built

- **Overlay** (`ui/overlay/`): the key element keeps its animated `transform` for press effects; the angle goes on its
  `.face` and `.glow` children as `rotate(var(--r))`, which never animates. Only transform and opacity, as before
  (CLAUDE.md §1, principle 3). The overlay's size and the glow room (`stagePad`) use each key's turned bounding box.
- **Editor** (`ui/settings/editor/`): a new `rotate.js` next to `resize.js` for the handle; the angle math (angle from
  a pointer position, snapping, the turned bounding box) goes in a plain module under `ui/settings/tabs/` with unit
  tests, like `keys-view.js`.
- **Board limits and overlap**: the board's edges use the upright box a turned key covers, so it stays on the board; the
  overlap warning uses the key's real turned shape, so neighbors it doesn't reach aren't flagged. Align, Space evenly and Close gaps keep working on the keys' straight rectangles (simpler, and
  what a person lining up turned keys by their centers expects).
- **KLE import** (`ui/settings/kle-layout.js`): keep `r` instead of straightening: the key's center is still found with
  the existing rotation math, then the key is placed straight at that center with `r` set. The import summary's
  "straightened" line goes away.

## Tests

- Unit: angle math and snapping; turned bounding boxes; the overlay's size with a turned key; KLE import keeps the
  angle; settings sanitize and migration (Rust).
- End-to-end (`keys-editor` suite): drag the handle with and without Snap, type an angle, Undo, Put back, and the
  handle is absent in the Even grid; the overlay draws a turned key.
- Screenshots: a new baseline with one turned key.

## Decided (2026-10-24)

- The handle is at the **top-right** corner.
- With Snap on, one step is **15°**.
- **No rotation in the Even grid.**
- It ships **after v2.0**, as the first feature of the next version (about 3 to 4 working sessions, a rough estimate).
