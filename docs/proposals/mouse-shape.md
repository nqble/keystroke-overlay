# Proposal: the mouse as a real mouse, cleaner, with more buttons

**Status:** Approved (2026-11-27), being built. Builds on [drawn-devices.md](drawn-devices.md) (a
device is one block; a drawing is one file) and [mouse-input.md](mouse-input.md) (which buttons the app can read).

Three things the maintainer found with the mouse:

1. **In the Keys tab the mouse is a plain key**, so you only see what it looks like in a tab with the live preview,
   and getting it right means switching back and forth.
2. **The drawing looks drawn, not like a mouse:** the left and right buttons' borders run into the body's outline, the
   wheel's arrows sit on the line between the buttons, and the side buttons are two small ovals.
3. **Only two side buttons.** Many mice have more, some in unusual places.

## Goal

1. The Keys tab draws a mouse block **as the mouse itself**, from the same drawing the overlay uses. It is still one
   block: moved, resized and turned like a key.
2. **A cleaner standard mouse:** every part sits inside the body with an even gap, nothing touches the outline, the
   wheel is a slot of its own with its up and down arrows inside it.
3. **A choice of mouse shapes** in the Keys tab: **Standard** (two side buttons) and **Gaming** (side buttons on both
   sides, two top buttons, wheel tilt), with room for more drawings later.
4. **Extra buttons you assign:** a button the system doesn't report as a mouse button can light up with any key you
   choose, the key your mouse's software sends for it.

## Non-goals

- **No drawing per mouse model detected automatically** (a Logitech G502 drawn as a G502). The system does report a
  mouse's maker and model, but no free library of mouse drawings exists: each model would have to be drawn by hand
  and kept up, for hundreds of mice. A drawing is one file, so a contributor can add a model's drawing later, and
  people pick it themselves; nothing reads which mouse is plugged in.
- No pointer position or movement, ever (future-inputs.md §7).
- No moving a drawing's parts in the app. A different arrangement is a different drawing file.

## What the systems report, and why some buttons need assigning

Every system reports **left, right, middle, back and forward** as mouse buttons, and the wheel up, down, left and right
(tilt): the app already reads all of these (`MouseLeft` … `MouseForward`, `WheelUp` … `WheelRight`). **Windows
reports no more than these five buttons.** A gaming mouse's other buttons (a third side button, DPI buttons on top)
reach the computer the way the mouse's own software sets them, usually as keys such as **F13–F24** or a shortcut,
sometimes not at all. So a drawing has two kinds of parts:

- **Mouse parts** with a fixed name (`data-code="MouseBack"`): they light up by themselves.
- **Extra buttons** (`data-slot="side3"`): you click one in the Keys tab and press the key it should follow; it lights
  up with that key. **Unassigned extra buttons are hidden** on the overlay; the Keys tab shows them dashed, so you can
  find and assign them.

## The design

### The Keys tab

- The mouse block shows its drawing (the same `ui/overlay/devices/<id>.svg` file, so the Keys tab and OBS always
  agree), with the block's outline and handles as today.
- Selecting it shows, in the side panel: **Shape** (Standard, Gaming), and, on a drawing with extra buttons, the list
  of them with **Lights up with: [ key ]**, set by pressing a key (Esc cancels, Delete clears). Clicking an extra button
  on the drawing selects it in that list.
- Pressing a mouse button or turning the wheel lights the drawing in the Keys tab too, as keys do.

### The drawings

`mouse.svg` is redrawn (the mockup shared with the maintainer): a mouse body, left and right buttons inset from the
outline with an even gap, a wheel slot between them with its arrows inside, two side buttons inset on the left.
`mouse-gaming.svg` is new: the same body, a wheel with tilt arrows, two top buttons behind the wheel, side buttons on
the left (back, forward and three more) and **side buttons on the right** (three, for mice with buttons under the
ring finger or for left-handed use). Both keep every part a closed shape, so the overlay's pressed look (a fade,
only `opacity`, CLAUDE.md) works unchanged.

### Saved

- The shape is kept with the layout's own edits, `settings.layout.profiles[id].deviceDrawings`, e.g.
  `{ "Mouse": "mouse-gaming" }`; it replaces the layout entry's `device` field for that layout. (Planned as the
  layout file's `device` field, but a built-in layout's file can't be changed, so the choice is saved with the
  layout's edits instead.)
- The extra buttons' keys go with the layout's own edits: `settings.layout.profiles[id].deviceKeys`, e.g.
  `{ "side3": "F13", "top1": "F14" }`. A downgrade ignores the field; nothing is lost.
- The keys F13–F24 are added to what the app captures (`keyboard/keymap.rs`, `key-names.js`), on every system, so
  the most common choice for extra buttons works.

## Every system

Windows, macOS and Linux read the same five buttons and the wheel, and keys the same way, so the shapes and the
assigning work everywhere. On a Mac, keys F13–F19 exist; F20–F24 don't (listed as not available there).

## Privacy

Nothing new is read: extra buttons light up from keys the app already sees, only while you press them, and the
assignment is a setting like a key's label. Nothing reads which mouse is connected.

## Files

| File | What |
|---|---|
| `ui/overlay/devices/mouse.svg` | Redrawn |
| `ui/overlay/devices/mouse-gaming.svg` (new) | The gaming shape |
| `ui/overlay/devices.js` | Extra buttons (`data-slot`) light up with their assigned key |
| `ui/settings/editor/` | Draws a device block with its drawing |
| `ui/settings/tabs/keys-inspector.js` | **Shape**, and the extra buttons' keys |
| `src-tauri/src/keyboard/keymap.rs`, `ui/settings/key-names.js` | F13–F24 |
| `src-tauri/src/device_keys.rs` (new), `sanitize.rs` | `deviceDrawings` and `deviceKeys` cleaned (drawing names, slot names, key codes) |
| `docs/schemas/`, `FILE-FORMATS.md`, `EXTENDING.md`, the user guide | The field, adding a drawing, how to assign |

## Tests

Unit: every drawing parses, its parts have known codes or slot names, and no part touches the body (a geometry check,
so the clipping can't come back); `deviceKeys` cleaning; F13–F24 in the key map. e2e (Windows): choosing Gaming
changes the overlay's drawing; assigning F13 to `side3` and pressing F13 lights it. Visual: the Keys tab with each
shape, the overlay with each theme.

## Work order

1. The redrawn `mouse.svg`, with the geometry test (fixes the clipping on its own; ships alone).
2. The Keys tab draws the device block's drawing (fixes "the mouse is a key" on its own).
3. F13–F24 captured.
4. `mouse-gaming.svg`, **Shape**, extra buttons and `deviceKeys`.
5. Docs; this plan's lasting facts move to the reference docs.

## Effort

About 4–6 working sessions: 1 for step 1, 1–2 for step 2, 1 for step 3, 2 for step 4.

## Decided with the maintainer (2026-11-27)

1. The two shapes as in the mockup, **with side buttons on the right side too** (Gaming).
2. **Unassigned extra buttons are hidden** (on the overlay; dashed in the Keys tab so they can be assigned).
3. **More shapes later** (an ergonomic one, a left-handed mirror), as contributions or a later step.
