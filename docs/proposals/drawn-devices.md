# Proposal: drawn devices (a mouse and a controller on the overlay)

Status: **Proposed** (2026-10-31); the design choices below, and the answers to its questions, were made with the
maintainer; the plan itself is waiting for approval. Nothing is built. The mouse comes first; the controller follows on the same groundwork.

The overlay shows a keyboard as keys. A mouse or a game controller looks wrong as a row of square keys, so this plan
draws them as the device itself: a picture of a mouse or a controller with each button, the wheel, the sticks and the
triggers lighting up on it. It also adds one way to show or hide each kind of input, the keyboard included.

How the inputs are captured is in two other plans, which this one builds on: [mouse-input.md](mouse-input.md) (buttons
and wheel, never the pointer's position) and [controllers-gilrs.md](controllers-gilrs.md) (gamepads). Names, protocol,
settings and privacy follow [design/future-inputs.md](../design/future-inputs.md).

## Goal

1. A layout can hold a **device**: a drawn mouse or controller, placed on the same board as its keys.
2. In the Keys tab a device is **one block** named "Mouse" or "Controller": it is moved, resized and turned like a key;
   its parts stay where the drawing puts them.
3. **Keys → Add ▾** adds a Mouse or a Controller to the layout.
4. **General → Inputs** has a switch per input (Mouse input, Controller input). Adding a device to a layout turns its
   input on by itself, so most people never need the switch.
5. **The eye button** under the live preview's pause button shows or hides the Keyboard, the Mouse and the Controller on
   the overlay, one click each. The keyboard is hidden the same way as the others.
6. The controller drawing is **one neutral gamepad**; a drawing for one brand (Xbox, PlayStation, Switch) is one more
   file and one line, so anyone can add one later.

## Non-goals

- No pointer position or movement, ever (future-inputs.md §7). The mouse drawing shows buttons and the wheel only.
- No editing of a device's parts in the app (moving the A button inside the controller). A different arrangement is a
  different drawing file.
- No wheels, flight sticks, dance pads or other controllers yet: common gamepads only (Xbox, PlayStation, Switch,
  third-party pads that act like them).
- No second overlay or second OBS source: one overlay, one live preview.

## The design (agreed)

A clickable mockup of the eye button, with the approved look, was shared with the maintainer.

### A device is one block on the board

A layout file gains one kind of entry in its `keys` list, with a `device` field:

```json
{ "code": "Mouse", "device": "mouse", "x": 16, "y": 1, "w": 2.5, "h": 4 }
```

- `code` is `Mouse` or `Controller` (reserved names: no capture method produces them). Because it is an ordinary entry,
  everything the key editor already does works with no new code path: dragging, the X / Y / W / H / Angle fields,
  arrange and align, undo, saved positions per layout style, hiding.
- `device` names the drawing: `mouse` or `controller` now; `controller-xbox` and others later.
- The inspector shows the block's name ("Mouse") and, when more than one drawing exists for that device, a **Drawing**
  choice.
- A layout has at most one Mouse and one Controller.
- The Even grid style places a device like a key, at its own size (it is never squeezed to one key).
- Layout files without devices are unchanged, so this is additive: no migration. The layout schema
  (`docs/schemas/layout.schema.json`) and `sanitize.rs` (`clean_layout_keys`) learn the `device` field (a known
  drawing id, else the entry is dropped).

### A drawing is one plain file

`ui/overlay/devices/<id>.svg`, one per drawing, listed in a small registry the way themes and animations are:

- Each part that lights up is an element with `data-code`: `data-code="MouseLeft"`, `data-code="PadA"`.
- Analog parts carry `data-stick="PadStickL"` (moves with the stick) or `data-trigger="PadLT"` (fills with the trigger).
- The body and parts use classes (`device-body`, `device-part`), never fixed colors, so every theme colors them: the
  body takes the key fill, a part takes the key look, a pressed part the theme's pressed look.
- The drawing's `viewBox` sets its shape; the block's `w` and `h` scale it.
- `docs/EXTENDING.md` gets a short "Add a device drawing" section: draw the SVG, mark the parts, add one registry line.
  A test checks every drawing: it parses, each `data-code` is a reserved name, and every part a device needs is there.

### How the overlay draws it

- The overlay puts the SVG inline (from the local server, like the layout files), so the theme's CSS reaches the parts.
- A press adds the `down` class to the part, the same as a key: the same theme colors, the same press timing.
- A stick moves with `transform: translate(...)` and a trigger fills with `transform: scaleY(...)`. Only `transform`
  and `opacity` animate (CLAUDE.md).
- Wheel notches use the short-press rule from mouse-input.md (`MIN_TAP_MS`), so a notch is seen.
- Key animations (bounce, pop) apply to keys only. Parts use the theme's pressed look with a short fade, so a drawing
  never jumps around.
- Loose mouse keys (a NohBoard layout's `MouseLeft` as a key) keep working as keys.

### Keys → Add ▾

- A new **Add ▾** button in the Keys tab toolbar, with **Mouse** and **Controller**.
- It places the device to the right of the keys (or at the top-left of an empty board) at its default size, selects it
  and shows it in the inspector.
- A device the layout already has is shown as added (checked) and can't be added twice.
- Adding one turns its input on when it is off, with a short message: "Mouse input turned on." Removing the device
  (Delete, as for a key) leaves the input as it is.

### General → Inputs

- A new **Inputs** card in General: **Mouse input** and **Controller input**, each a switch, off for a new install.
- The setting is saved once and kept (`"inputs": { "mouse": { "enabled": … }, "gamepad": { "enabled": … } }`,
  the names future-inputs.md §5 reserves). There is nothing to turn on again after a restart.
- Turning an input off stops its capture at once (settings window or not). Its devices stay in the layouts but are not
  drawn on the overlay, because nothing would light them.
- The same card on Windows, macOS and Linux; where an input can't be read on a system yet, its switch says so (CLAUDE.md
  section 4). The keyboard keeps its own input method setting where it is.

### The eye button

As in the approved mockup:

- A round button with an eye (the soft, almond-shaped eye), directly under the live preview's pause button, the same
  size and look.
- Pointing at it slides out three toggles to the left, **Keyboard · Mouse · Controller**, with the pause button's
  timing (opens 150 ms after arriving, closes 150 ms after leaving, only `transform` and `opacity` animate). Clicking the
  eye also opens it, in case hovering doesn't; Tab reaches it and the toggles.
- A toggle that is on is filled; off is dim with a slash. **Mouse** and **Controller** are grayed out and can't be
  clicked while their input is off. No explanation is shown: the grayed toggle says enough.
- Clicking a toggle hides or shows every key and device of that kind on the overlay (OBS and the live preview):
  - **Keyboard:** every keyboard key, without touching which keys are hidden one by one. Turning it back on brings them
    back exactly as they were.
  - **Mouse:** the Mouse device and any loose mouse keys (`Mouse…`, `Wheel…`).
  - **Controller:** the Controller device and any loose `Pad…` keys.
- The choice is saved per layout, next to its hidden keys: `profiles[<id>].hiddenInputs: ["keyboard"]` (empty or
  missing means everything shows). Additive: no migration.
- Hooks: `eye-button`, `eye-keyboard`, `eye-mouse`, `eye-controller` (listed in `tests/README.md`).
- Text (button names for screen readers) goes in the file's `TEXT` block: "What the overlay shows", "Show the keyboard",
  "Show the mouse", "Show the controller".

## Controller: keeping the app idle

The maintainer's answer to the idle cost in controllers-gilrs.md: use every improvement, so the app stays at zero
wake-ups when no controller is in use.

1. **Listen only while a controller is connected.** The system says when a device is plugged in or out (Windows: Raw
   Input device notices; macOS: the HID manager's callbacks; Linux: the device folder's notices), so with Controller
   input on but no controller, nothing runs.
2. **Event-based input where possible.** Raw Input delivers most USB and Bluetooth gamepads as events, with no timer.
   XInput (needed for an Xbox controller's two separate triggers) polls; it runs only while an Xbox controller is
   connected (point 1) and the overlay is shown (point 3).
3. **Pause while nobody is watching.** When no overlay page is connected (OBS closed, the source hidden, no live
   preview), controller polling stops; it starts again when one connects.
4. **Trigger thresholds** (press at half-way, release just below) are tried by hand with real controllers before they
   are fixed in the docs.

Whether gilrs (with fixes sent upstream), a reviewed fork of it, or our own code does this is still controllers-gilrs.md's
open question 2; this plan works with any of them.

## Every system

| | Windows | macOS | Linux |
|---|---|---|---|
| Mouse | Raw Input (mouse-input.md) | Listen-only event tap | X11: XInput2; Wayland: `/dev/input` with the `input` group |
| Controller | Raw Input; XInput for Xbox controllers | HID manager | `/dev/input` |
| Eye button, Add ▾, Inputs card | Same everywhere | Same everywhere | Same everywhere |

An input a system can't read yet keeps its switch, which says "not available on this system yet", and its toggle in
the eye button stays grayed out.

## Privacy

- Unchanged promise: inputs are only read, never stored, logged or sent; the mouse's position and movement are never
  read (future-inputs.md §7). `npm run check:privacy` gains the rules mouse-input.md and controllers-gilrs.md list.
- Drawings are local files served by the app's own server on 127.0.0.1, like layouts and themes.
- PRIVACY.md gets one line per input when it is built (a second look, CLAUDE.md section 8).

## Files

| File | What |
|---|---|
| `ui/overlay/devices/mouse.svg`, `controller.svg` (new) | The drawings |
| `ui/overlay/devices.js` (new) | Loads a drawing, lights its parts, moves sticks and fills triggers |
| `ui/overlay/registry.js` | The list of drawings (one line each) |
| `ui/overlay/overlay.js` | Draws a `device` entry with devices.js; hides the kinds in `hiddenInputs` |
| `ui/settings/eye-button.js`, `eye-button.css` (new) | The eye button |
| `ui/settings/tabs/keys-toolbar.js` | Add ▾ |
| `ui/settings/tabs/keys-inspector.js` | A device's name and its Drawing choice |
| `ui/settings/tabs/general-inputs.js` (new) | The Inputs card |
| `src-tauri/src/settings.rs`, `sanitize.rs` | `inputs`, `hiddenInputs`, the `device` field |
| `docs/schemas/layout.schema.json` | The `device` field |
| `tools/sandbox/fake-app.js` | The inputs and a pretend mouse for the sandbox |

## Tests

- Unit: the layout cleaning keeps a known `device` and drops an unknown one; `hiddenInputs` is cleaned; every drawing
  parses and has its parts; a stick's position becomes the right `transform`; which kind each code is (keyboard, mouse,
  controller).
- e2e (Windows): Add ▾ → Mouse adds one block and turns Mouse input on; the eye hides the keyboard on the overlay and
  brings it back with the hidden keys unchanged; a grayed toggle can't be clicked; clicks from a virtual mouse light the
  drawing's buttons; with ViGEmBus (installed on the maintainer's PC), a virtual controller's A lights `PadA`, its stick
  moves the drawn stick, and with no controller connected the app wakes no more than with the feature off.
- Visual: the eye button closed and open, the Inputs card, Add ▾, a layout with a mouse and a controller, each theme
  (`npm run test:visual`, before and after in the pull request).
- Benchmarks: idle wake-ups with each input on and no device in use, against today's numbers.

## Docs to update

User guide (devices, the eye button, Inputs), `FILE-FORMATS.md` (the `device` field, `hiddenInputs`, `inputs`),
`EXTENDING.md` (add a drawing), `ARCHITECTURE.md`, `PROTOCOL.md` (no change expected: the names already exist),
`design/future-inputs.md` (the reserved names `Mouse` and `Controller`), `PRIVACY.md`, `tests/README.md`,
`docs/design/ui-design-v2.md` (the eye button next to the pause button). When built, this plan and the two capture plans
are deleted and their lasting facts move to those docs.

## Work order

Small commits; every commit passes all checks; stop and report on any failure.

1. **Groundwork, no input yet:** the `device` field (schema, cleaning, tests); `devices.js` and the mouse drawing; the
   overlay draws a device; the key editor treats it as a block. Testable with the live preview's click-to-test.
2. **The eye button and `hiddenInputs`,** with the Keyboard toggle working (useful on its own: it hides the keyboard).
3. **Mouse capture** as in mouse-input.md (Windows first), the Inputs card, Add ▾ → Mouse with auto-on.
4. Mouse on Linux and macOS.
5. **Controller drawing and capture** (Windows first, with the idle improvements), Add ▾ → Controller.
6. Controller on Linux and macOS; trigger thresholds tried by hand.
7. Docs, and the plans deleted.

Steps 1 and 2 can ship on their own (a release can have the eye button and Keyboard toggle before any mouse support).

## Effort

A rough estimate in working sessions: groundwork 2–3, eye button 1, mouse capture and UI 6–8 (mouse-input.md), controller
6–9 (controllers-gilrs.md), docs 1. About 16 to 22 in all, spread over several releases.

## Decided with the maintainer (2026-10-31)

1. **Tray menu:** it also gets **Show keyboard**, **Show mouse** and **Show controller** (checked items, the same
   choice as the eye button; mouse and controller unavailable while their input is off). Built with the eye button
   (work order step 2).
2. **Device parts** only change color when pressed (the theme's pressed look with a short fade); no movement for now.
3. **A built-in "WASD + mouse" layout** goes into Other layouts when the mouse ships (work order step 3).
4. **OBS scene rules** will be able to hide an input ("hide the keyboard in this scene"), after the eye button exists:
   an addition to `obs.scenes.rules` (proposals/obs-source-events.md), planned when it is picked up.
