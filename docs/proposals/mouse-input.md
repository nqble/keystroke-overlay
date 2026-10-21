# Proposal: mouse buttons and wheel

Status: **Open idea** (Jordan, 2026-10-20: wanted eventually, likely not in v2.0; the design of mouse buttons and wheel is still to be worked out; nothing built)

This plan says how mouse buttons and wheel notches would reach the overlay, through our own capture code on each system and
no new dependency. It follows [design/future-inputs.md](../design/future-inputs.md) for the names, the protocol, the settings
and above all the privacy rule: **buttons and wheel notches only, never the pointer position or movement** (its §7).
`rdev` (github.com/Narsil/rdev, MIT) was read as a reference only; it is not proposed as a dependency (see "Dependency review").

## Goal

- With **General → Mouse and controller → Show my mouse** on, a click lights `MouseLeft`, `MouseRight`, `MouseMiddle`,
  `MouseBack` or `MouseForward`, and each wheel notch flashes `WheelUp`, `WheelDown`, `WheelLeft` or `WheelRight`, in any
  layout that has those keys.
- Off by default. While off: no thread, no hook, no registration, no open device.
- No position, ever: the app never reads where the pointer is, never stores or sends it, and where the system allows it,
  never even receives movement.
- About 0% CPU when the mouse isn't used. Windows first, then macOS and Linux behind the same interface.

## Non-goals

- Pointer position, movement, speed, a "mouse trail" or a heat map. future-inputs.md §7 rules them out.
- Which window or program was clicked.
- Trackpad gestures (pinch, swipe) and smooth trackpad scrolling (see "Wheel").
- Clicking on the overlay itself (OBS's browser source isn't clickable anyway).
- Controllers: [controllers-gilrs.md](controllers-gilrs.md).

## What rdev does, as a reference

rdev 0.5.3 is the release on crates.io (2023-06-26); its main branch says 0.6.0 (last commit 2026-05-12). It listens to keyboard
and mouse together, and its limits are the reasons we don't use it:

| System | How rdev listens | Limits for us |
|---|---|---|
| Windows | `WH_MOUSE_LL` plus `WH_KEYBOARD_LL`, in one `listen()` that never returns | Every mouse move goes through its callback with screen `x`, `y` (`MouseMove`); a low-level hook sits in the input path, so a slow callback delays the pointer and Windows may silently remove it (as with our keyboard hook watch); wheel notches are `delta / WHEEL_DELTA` in whole numbers, so high-resolution wheels (deltas under 120) are lost; back and forward are `Unknown(1)` / `Unknown(2)`; **no way to stop**; uses `winapi` |
| macOS | A listen-only `CGEventTap` with `kCGEventMaskForAllEvents` | It wakes on every mouse move and reads its location; only the left and right buttons are named (no `OtherMouseDown`, so no middle, back or forward); can't be stopped (`CFRunLoop::run()`); README asks for the Accessibility permission |
| Linux X11 | XRecord on all clients, up to `MotionNotify` | Receives every motion with `root_x` / `root_y`; XRecord is a different mechanism from our XInput2 keyboard capture |
| Linux Wayland | libinput with a udev seat (`wayland` feature) | Opens every input device itself, keyboards included; still experimental |

Useful from it: the button and wheel code tables per system, which match the ones below.

## How it works

### Where the code lives

A sibling folder of `keyboard/` for the new input kind (future-inputs.md §1.4): **`src-tauri/src/mouse/`**.

| File | What it does |
|---|---|
| `mouse/mod.rs` | `start(tx) -> Result<Handle, String>`, `Handle::stop()`, picking the method for this system; the "not available on this system yet" fallback |
| `mouse/names.rs` | Every system's button and wheel codes → our names, one table each. Plain logic, built and tested everywhere |
| `mouse/wheel.rs` | Adds up wheel deltas into whole notches (high-resolution wheels). Plain logic, tested everywhere |
| `mouse/rawinput.rs` | Windows: Raw Input on a message-only window |
| `mouse/macos.rs` | macOS: a listen-only event tap for button and wheel events only |
| `mouse/x11.rs` | Linux X11: XInput2 raw button events |
| `mouse/linux_devices.rs` | Linux Wayland: the mice in `/dev/input`, read-only |

CLAUDE.md §4 today names only `platform.rs` and `keyboard/` for system code: it needs one line for the input folders
(open question 1). The Linux device helpers that both keyboards and mice need (`open_read_only`, the `poll` binding, the wake
pipe) move out of `keyboard/linux_devices.rs` into one shared place instead of being copied; that move is a small refactor
to agree with Jordan first (CLAUDE.md §7, open question 2).

### Start and stop

As for controllers (future-inputs.md §4): `keyboard::Bus` gets an independent mouse source slot, `Bus::set_mouse(on)`. On
starts `mouse::start(ev_tx)` with the **same `Sender<KeyEvent>`** as the keyboard, so the dispatcher, held keys, pause and `snap`
work unchanged (mouse names are just names). Off stops it and releases any `Mouse…` name still held. A Tauri command
`set_mouse_input(enabled)` (in `mouse/mod.rs`) saves `inputs.mouse.enabled` on success; `main.rs` starts it at launch when on.
The keyboard's Standard / Compatibility choice stays keyboard-only.

### Windows: Raw Input, not a mouse hook

future-inputs.md §4 allows a low-level mouse hook or Raw Input. This plan picks **Raw Input**:

| | `WH_MOUSE_LL` hook | Raw Input (`RIDEV_INPUTSINK`) |
|---|---|---|
| In the input path | Yes: every move waits for our callback | No: the app gets a copy; nothing waits for it |
| Can Windows remove it silently | Yes (hook timeout), needs a watch like the keyboard hook | No |
| Gets the position | Always (`MSLLHOOKSTRUCT.pt`, screen coordinates) | No position; moves come as relative deltas, which we don't read |
| Wakes on movement | Yes | Yes (no filter exists), but off the input path |
| Existing pattern | `keyboard/hook.rs` | `keyboard/rawinput.rs` |

- One thread with a message-only window, registered for usage page 1, usage 2 (mouse) with `RIDEV_INPUTSINK`, so clicks are seen
  while a game has focus. Stop: `RIDEV_REMOVE`, then `WM_QUIT`, as in `keyboard/rawinput.rs`. The keyboard's Compatibility
  window keeps its own keyboard registration; Raw Input allows one window per device type, so the two don't compete. Tauri's
  own Raw Input stays off (`device_event_filter(Always)`).
- For each `WM_INPUT`, `GetRawInputData` copies the small `RAWINPUT` record and the code reads **only** `usButtonFlags` and
  `usButtonData`. A record with no button or wheel flag (a plain move) is dropped at once. The `lLastX` / `lLastY` fields are
  never named in our code (a privacy-check rule).
- Flags → names: `RI_MOUSE_LEFT_BUTTON_DOWN/UP` → `MouseLeft`, `RIGHT` → `MouseRight`, `MIDDLE` → `MouseMiddle`, `BUTTON_4` →
  `MouseBack`, `BUTTON_5` → `MouseForward`; `RI_MOUSE_WHEEL` (`usButtonData` as a signed number, positive = away from you) →
  `WheelUp` / `WheelDown`; `RI_MOUSE_HWHEEL` (positive = right) → `WheelRight` / `WheelLeft`. One record can hold several flags
  (a button and the wheel), so all of them are read.
- Raw Input reports **physical** buttons: with Windows' "switch primary and secondary buttons" on, the physical left button is
  still `MouseLeft` (open question 4).
- Cost: a gaming mouse sends up to 1,000 (some 8,000) records a second while moving. Each costs one small copy and a flag test.
  To measure in step 1; if it shows, `GetRawInputBuffer` reads them in batches. Idle (the mouse not moved) stays at 0%.

### macOS: a listen-only tap for clicks and the wheel

- A second `CGEventTap`, created with `CGEventTapOptions::ListenOnly` exactly like `keyboard/macos.rs` (so the existing
  `MAC_ACTIVE` privacy rule passes), on its own thread with its own run loop, stopped the same way.
- **Its mask has only** `LeftMouseDown/Up`, `RightMouseDown/Up`, `OtherMouseDown/Up` and `ScrollWheel`: no `MouseMoved` and
  no `…MouseDragged`, so macOS never wakes the app for movement and never hands it a position.
- `OtherMouse` uses the `kCGMouseEventButtonNumber` field: 2 → `MouseMiddle`, 3 → `MouseBack`, 4 → `MouseForward`.
- `CGEventGetLocation` (`event.location()`) is never called (a privacy-check rule).
- **Permission:** the app already asks for Input Monitoring for the keyboard. Whether a mouse-only listen tap needs it at all is
  to be confirmed on a Mac with the permission off; either way no new permission is asked. If the tap is disabled by macOS
  (`kCGEventTapDisabledByTimeout`), it is enabled again as the keyboard tap is.
- Secure Input (password fields) stops keyboard taps only; clicks keep showing, which reveals nothing typed.

### Linux X11: XInput2 raw buttons

- A second X connection and thread, selecting `XI_RawButtonPress` and `XI_RawButtonRelease` on the root window, the same way
  `keyboard/x11.rs` selects raw key events. **No `XI_RawMotion`**, so no movement is received.
- Raw events carry the physical button number: 1 → `MouseLeft`, 2 → `MouseMiddle`, 3 → `MouseRight`, 4 / 5 → `WheelUp` /
  `WheelDown`, 6 / 7 → `WheelLeft` / `WheelRight`, 8 → `MouseBack`, 9 → `MouseForward`. Buttons 4 to 7 come as press and release
  pairs, one per notch (also for smooth-scrolling mice, where X sends them as emulated buttons); the press is used.
- Raw button events can carry valuators (movement deltas); the code ignores them and never reads `root_x` or `event_x`.
- Stop: the wake-window message `keyboard/x11.rs` already uses.

### Linux Wayland: the mice in `/dev/input`

- The keyboard's Wayland method, applied to mice: devices with `BTN_LEFT` and `REL_X` (or `BTN_LEFT` alone for some
  trackballs), opened **read-only, never grabbed**, one thread in `poll()` with the wake pipe. Same `input` group, same notice.
- Codes: `BTN_LEFT` → `MouseLeft`, `BTN_RIGHT` → `MouseRight`, `BTN_MIDDLE` → `MouseMiddle`, `BTN_SIDE` and `BTN_BACK` →
  `MouseBack`, `BTN_EXTRA` and `BTN_FORWARD` → `MouseForward`; `REL_WHEEL` (one per notch, positive = up) → `WheelUp` /
  `WheelDown`, `REL_HWHEEL` (positive = right) → `WheelRight` / `WheelLeft`. `REL_WHEEL_HI_RES` is skipped because the kernel
  also sends `REL_WHEEL` for each full notch.
- **Movement never reaches the app:** the kernel's per-reader event mask (`EVIOCSMASK`, Linux 4.4+) is set to `EV_KEY` and the
  two wheel codes only, so `REL_X` / `REL_Y` aren't even queued for our file and `poll()` doesn't wake when the mouse moves.
  `evdev` 0.13 has no wrapper for it, so it is one `ioctl` declared like the existing `poll` binding. If a kernel refuses the
  mask, movement events are read and dropped unread, and the Debug event log says so once.
- Touchpads (`ID_INPUT_TOUCHPAD`: `BTN_TOUCH`, absolute axes) are skipped: their "clicks" are taps the compositor makes.

### Wheel

- **One notch is one short press** (future-inputs.md §2): `d` then `u` for the same name.
- **High-resolution wheels** send fractions of a notch (Windows deltas under 120, macOS fractional lines). `wheel.rs` adds them
  per direction and sends one notch for each full 120 (Windows) or 1 line (macOS); turning the other way starts over.
- **Free-spinning wheels** can send hundreds of notches a second. A notch that comes while the same wheel key is still shown
  extends it instead of sending another press, so at most one press per name per `MIN_TAP_MS`.
- **Trackpads and the Magic Mouse** scroll continuously, not in notches. macOS marks those events
  (`kCGScrollWheelEventIsContinuous`); they are ignored, so `Wheel…` keys mean a real wheel (open question 5). Natural
  scrolling flips the reported direction on macOS; `WheelUp` should mean the wheel turned away from you, which the spike
  checks.

### Taps need a minimum time on screen

A `d` and `u` that arrive together (every wheel notch, and today's PrintScreen on Windows, which `tracker.rs` sends as an
instant tap) add and remove the key's `down` class in the same frame, so CSS shows nothing. The fix is in the overlay, once
for every key: a small pure function in `ui/overlay/taps.js` holds the `down` look until `MIN_TAP_MS` (100 ms; also used by
`wheel.rs`, so both say where the other is) after the press. It starts a `setTimeout` only when an early release arrives,
so nothing runs while idle. This also fixes PrintScreen, which gets its own test.

### Idle cost

| State | Cost |
|---|---|
| Setting off | Nothing |
| On, mouse not used | 0%: every method sleeps in the system |
| On, mouse moving | Windows: one wake per Raw Input record (to measure). macOS and Linux Wayland: none (movement masked out). X11: none (no raw motion selected) |
| Clicking and scrolling | One message per press and release |

## Settings

- The reserved section, as written: `"inputs": { "mouse": { "enabled": false } }` (future-inputs.md §5), next to `"gamepad"`.
- A default in `settings.rs` and a `sanitize.rs` line (bool, else `false`). Additive: no migration, no version bump. Unit tests
  for the default and for a wrong type.
- The overlay doesn't read it; no `CONTROLS` line (the switch is in General, like the pause shortcut).

## Overlay

- **A built-in Mouse layout**, `ui/overlay/layouts/mouse.json`, one plain file:

  ```json
  {
    "id": "mouse",
    "name": "Mouse",
    "keys": [
      { "code": "MouseLeft", "label": "L", "x": 0, "y": 0, "h": 2 },
      { "code": "WheelUp", "label": "▲", "x": 1, "y": 0 },
      { "code": "MouseMiddle", "label": "M", "x": 1, "y": 1 },
      { "code": "WheelDown", "label": "▼", "x": 1, "y": 2 },
      { "code": "MouseRight", "label": "R", "x": 2, "y": 0, "h": 2 },
      { "code": "MouseForward", "label": "⏵", "x": 0, "y": 2 },
      { "code": "MouseBack", "label": "⏴", "x": 0, "y": 3 }
    ]
  }
  ```

  Not in `DEFAULT_ORDER`: it waits in **Other layouts**. The WASD gameplay layout could gain `MouseLeft` / `MouseRight` later, but
  not in this change, so existing users see no new keys (open question 6).
- **Layouts mark mouse keys by name only** (`code: "MouseLeft"`): no format change (future-inputs.md §2). A user's own layout can
  have mouse keys too (a layout file they import; adding single keys in the key editor is not part of this plan).
- Drawing: the existing `down` class, so every theme and animation works unchanged; only `transform` and `opacity` animate.
- The live preview's click-to-test keeps working and does not send anything to the app: a click in the settings window is
  the settings window's own click, not captured input.

## Settings window UI

- **General → Mouse and controller** (the same card as the controller switch, `tabs/general-inputs.js`).
  - Switch: **Show my mouse** (`data-test="mouse-switch"`).
  - Note: "Shows your mouse buttons and wheel, in any layout with mouse keys. Add the Mouse layout from Other layouts on the
    Layout tab. The app never sees where your pointer is."
  - Error line (`data-test="mouse-error"`) as for keyboard input.
- **Every system:** the same switch and text on Windows, macOS and Linux. Words that differ go in `system-words.js` if any appear
  (none in the text above; "wheel" and "buttons" are the same everywhere). On a system without a method, the error says
  "Mouse buttons aren't available on this system yet."
- **Linux Wayland:** mice need the same `input` group as keyboards. The keyboard access notice (`access-notice.js`) is reused
  through one more input: it already shows when keyboards can't be read; if keyboards work but the mouse can't (unusual), the
  mouse error line shows `NO_PERMISSION`'s text.
- **macOS:** no new notice; the keyboard's Input Monitoring notice covers it if it's needed.
- `tests/README.md` gets the hooks.

## Dependency review

**No new crate.** Each method uses what the keyboard already uses:

| System | Crate | Change |
|---|---|---|
| Windows | `windows` 0.62 | None: `Win32_UI_Input` and `Win32_UI_WindowsAndMessaging` are already enabled (Raw Input types and `RI_MOUSE_*` constants) |
| macOS | `core-graphics` 0.25, `core-foundation` 0.10 | None |
| Linux X11 | `x11rb` with `xinput` | None |
| Linux Wayland | `evdev` 0.13 | None; `EVIOCSMASK` is one `extern "C"` `ioctl` |

**Why not rdev:** MIT and small, but it listens to keyboard and mouse in one call that can't be stopped, receives every move with
its position on Windows, macOS and X11, misses the middle, back and forward buttons on macOS, rounds away high-resolution wheel
notches on Windows, uses `winapi` and `lazy_static`, and its last release is from 2023. Its button tables were useful as a
cross-check.

## Privacy

Clicks are sensitive in a different way from keys: **where** you click can reveal what is on your screen (a chat, a password
manager entry, a bank page), and pointer movement can identify a person. So the rule is stricter than "keep it in memory":
the position must never enter the app's data at all.

- **Never read:** pointer position or movement, on any system. The app doesn't receive movement where the system can filter it
  (macOS mask, X11 selection, Linux `EVIOCSMASK`); where it can't (Windows Raw Input), it drops the record after testing the
  button flags, without reading its movement fields.
- **Never sent:** no position, movement, window, program or screen. Only the names in future-inputs.md §2 and `d` / `u`.
- **Kept:** which mouse buttons are held right now, as for keys. Wheel notches are never held.
- **Not stored, not logged:** the same rules as keystrokes (decision 0005); the Debug tab's Key monitor shows mouse names like
  keys, under the same 60-second limit.
- **Pause** drops mouse events like keys.
- **PRIVACY.md** gets a paragraph under "What the app can see" (from v2.x, off by default: which mouse button and which wheel
  direction, never where the pointer is, how each system is read), the diagram gains "mouse", and "How to check it yourself"
  gains the grep below.
- **`tools/check-privacy.mjs` and `tools/privacy-patterns.mjs`**, each pattern with tests in
  `tests/ui/privacy-patterns.test.mjs`:
  - `POINTER_POSITION`, failing **anywhere** in `src-tauri/src`: `GetCursorPos`, `GetPhysicalCursorPos`, `MSLLHOOKSTRUCT`,
    `WH_MOUSE_LL`, `lLastX`, `lLastY`, `CGEventGetLocation`, `.location(` on an event, `CGEventMaskBit(…Moved` / `MouseMoved` /
    `MouseDragged`, `XI_RawMotion`, `RAW_MOTION`, `root_x`, `root_y`, `event_x`, `event_y`. (None of them is used in the app today.)
  - In `src-tauri/src/mouse/` only: `REL_X`, `REL_Y`, `ABS_X`, `ABS_Y` may appear only in the `EVIOCSMASK` line that masks them
    out (the controller code needs `ABS_X` for sticks, so this one is scoped to the folder).
  - The file-write rule covers `/mouse/` like `/keyboard/`; `LINUX_DEVICES` (`evdev::`) allows `mouse/linux_devices.rs` (or the
    shared helper file); `LINUX_ACTIVE` (no grab, no virtual device, no sent events) and `MAC_ACTIVE` (listen-only) already apply
    to every file.
  - The header comment of `check-privacy.mjs` and its "passed" line gain "no pointer position".
- Second look (CLAUDE.md §8) for the `keyboard/`, `check-privacy.mjs` and PRIVACY.md changes.

## Tests

**Unit tests (every system):**

1. `names.rs`: each system's table, every code → its name, unknown codes ignored (Windows flag combinations in one record;
   X11 1–9; evdev `BTN_*` and `REL_*`; macOS button numbers 0–4).
2. `wheel.rs`: 120 → one notch; 30 + 30 + 60 → one notch; −120 → one down; 60 up then 60 down → nothing; a burst of 50 notches
   inside `MIN_TAP_MS` → one press.
3. `Bus::set_mouse(false)` releases held `Mouse…` names; pause drops mouse events.
4. Settings default and sanitizer.
5. `tests/ui/overlay-taps.test.mjs`: a release 5 ms after its press keeps `down` for `MIN_TAP_MS`; a normal key held 300 ms is
   released at once; no timer is started for a normal release.
6. The privacy patterns, with lines that must and must not match.

**Linux CI:**

- **x11 job:** `xdotool click 1 2 3 4 5 8 9` through `tests/linux/overlay-check.mjs` in a new `mouse` mode, expecting `MouseLeft`,
  `MouseMiddle`, `MouseRight`, `WheelUp`, `WheelDown`, `MouseBack`, `MouseForward`; then `xdotool mousemove 10 10 mousemove 600 400`
  and **no** message at all.
- **wayland job:** a uinput virtual mouse (in a `#[cfg(test)]` module, like the virtual keyboard: `BTN_LEFT`, `BTN_RIGHT`,
  `BTN_MIDDLE`, `BTN_SIDE`, `BTN_EXTRA`, `REL_X`, `REL_Y`, `REL_WHEEL`, `REL_HWHEEL`). `captures_a_virtual_mouse` clicks each button and
  turns the wheel each way; `movement_never_wakes_the_capture` moves it 1,000 times and checks that the thread was not woken
  (a wake counter in test builds) and nothing was sent. The input-group steps are the keyboard's.

**Windows e2e (`npm run test:e2e -- --suite inputs`):** the suite opens a small empty window of its own under the pointer (so
injected clicks land there and nowhere else), injects each button and wheel notch with `SendInput` without moving the pointer, and
checks the overlay's stream. It also checks the switch, the error line and that turning it off ends the thread. Back and forward
are injected only into that window (in a browser they would navigate).

**macOS:** a manual checklist in the PR (a mouse with five buttons, a trackpad, natural scrolling on and off, Input Monitoring off).

**Benchmarks:** CPU with the setting off (must equal today), on and idle, and on while a script moves the mouse continuously
(Windows: to decide whether batching is needed).

## Docs to update

- [design/future-inputs.md](../design/future-inputs.md): status (mouse built), `MIN_TAP_MS`, the trackpad rule, physical buttons.
- [PROTOCOL.md](../PROTOCOL.md): mouse names are sent; taps (a `d` straight after a `u`) are normal.
- [PRIVACY.md](../../PRIVACY.md): the paragraph, the diagram, the grep in "How to check it yourself".
- [ARCHITECTURE.md](../ARCHITECTURE.md): `mouse/` in the folder map, the travel diagram, threads.
- [CROSS-PLATFORM.md](../CROSS-PLATFORM.md), [LINUX-PORT.md](../LINUX-PORT.md), [MAC-PORT.md](../MAC-PORT.md): what works
  where, the input group for mice, the tap's mask.
- [FILE-FORMATS.md](../FILE-FORMATS.md) and `docs/schemas/layout.schema.json`: `code` may be a mouse name.
- [USER-GUIDE.md](../USER-GUIDE.md) and README.md: the switch and the Mouse layout.
- [decisions/0003-two-keyboard-input-methods.md](../decisions/0003-two-keyboard-input-methods.md) stays as it is; a new
  decision record says why Windows mouse capture uses Raw Input and no hook.
- [EXTENDING.md](../EXTENDING.md), `tests/README.md`, CLAUDE.md §4 (with Jordan), this plan's status and the for-claude list.

## Risks

- **Click positions leaking** through a later change (someone adds "show where I clicked"). The privacy check fails on every
  position API, and future-inputs.md §7 forbids it; a change would need a new decision.
- **Windows cost while moving** a high-rate mouse; measured in step 1, batching if needed.
- **Games that use Raw Input themselves** are unaffected: registrations are per process. A game that blocks hooks doesn't
  matter here, as no hook is used.
- **Anti-cheat tools** may flag a process that watches the mouse; Raw Input is the same mechanism the keyboard's
  Compatibility method already uses, and nothing is injected.
- **macOS permission uncertainty** (Input Monitoring for a mouse-only tap), checked in the spike.
- **Overlay taps:** the minimum time changes how PrintScreen looks today (it becomes visible); the visual suite shows it.
- **The shared Linux helper move** touches `keyboard/linux_devices.rs` (extra care): done as its own commit, with the existing
  virtual-keyboard tests passing before and after.

## Work order

Each step one small commit, checks between steps, stop and report on any failure.

1. **Spike on Windows** behind a cargo feature `mouse` (off): `mouse/rawinput.rs` and `names.rs`, a Debug-only switch, the
   measurements (idle, moving at 1,000 Hz, thread count over on/off). Jordan reviews before step 2.
2. `names.rs` and `wheel.rs` with unit tests.
3. Settings default and sanitizer, with tests.
4. `Bus` mouse slot and the command.
5. Privacy rules and tests; PRIVACY.md (second look).
6. Overlay `taps.js` with tests (fixes PrintScreen too); the Mouse layout.
7. The settings window switch, hooks, visual baselines shown to Jordan.
8. Windows e2e `inputs` suite and benchmarks.
9. Linux: the shared helper move (own commit, agreed with Jordan), `mouse/linux_devices.rs` with `EVIOCSMASK`, `mouse/x11.rs`,
   the CI steps.
10. macOS: `mouse/macos.rs`, the Mac checklist.
11. Docs and this plan's status.

## Effort

About **6 to 8 working sessions**: Windows with tests 2, overlay and UI 1–2, Linux (both methods and CI) 2, macOS 1, docs 1.

## Open questions for Jordan

1. CLAUDE.md §4: may `mouse/` (and `gamepad/`) hold system code, as future-inputs.md §1.4 allows?
2. May the Linux device helpers move out of `keyboard/linux_devices.rs` into a shared file, so mice and keyboards use one copy?
3. Raw Input only on Windows (no mouse hook, no choice for the user), as this plan proposes?
4. Physical buttons (a left-handed setup shows the physical left button as `MouseLeft`), or the system's swapped meaning?
5. Ignore trackpad and Magic Mouse scrolling, so `Wheel…` keys mean a real wheel only?
6. Add mouse keys to the WASD gameplay layout later, or keep mouse keys to the Mouse layout and user layouts?
7. Is `MIN_TAP_MS = 100` the right minimum for taps, and should it apply to PrintScreen too?
