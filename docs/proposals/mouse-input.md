# Proposal: mouse buttons and wheel

Status: **Planned** (2026-10-31) as the first input of [drawn-devices.md](drawn-devices.md), which decides how the mouse
looks (a drawn mouse, not keys) and replaces this plan's "Overlay" and "Settings window UI" sections. The capture plan
below stands. Steps 1 (the Windows spike, with its numbers), 2 (the name tables and the wheel logic), 3 (the setting), 4 (the Windows capture, started from the setting), 5 (the privacy rules) and 6 (the overlay's taps and the layout), 7 (the settings switch), 8 (the Windows test and the numbers) and 9 (Linux) are built; the rest is not.

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
to agree with the maintainer first (CLAUDE.md §7, open question 2).

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
- [EXTENDING.md](../EXTENDING.md), `tests/README.md`, CLAUDE.md §4 (the maintainer's call), and this proposal's status in
  [docs/proposals/README.md](README.md) (once built, the proposal is deleted).

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
   measurements (idle, moving at 1,000 Hz, thread count over on/off). The maintainer reviews the numbers before step 2.
2. `names.rs` and `wheel.rs` with unit tests.
3. Settings default and sanitizer, with tests.
4. `Bus` mouse slot and the command.
5. Privacy rules and tests; PRIVACY.md (second look).
6. Overlay `taps.js` with tests (fixes PrintScreen too); the Mouse layout.
7. The settings window switch, hooks, visual baselines (before and after shown in the pull request).
8. Windows e2e `inputs` suite and benchmarks.
9. Linux: the shared helper move (own commit, agreed with the maintainer), `mouse/linux_devices.rs` with `EVIOCSMASK`, `mouse/x11.rs`,
   the CI steps.
10. macOS: `mouse/macos.rs`, the Mac checklist.
11. Docs and this plan's status.

## Step 1 result: the Windows numbers (2026-11-01)

Built as in the plan: `mouse/rawinput.rs` (Raw Input on a message-only window, `RIDEV_INPUTSINK`) and `mouse/names.rs` (flags to names, 5 unit tests), behind the cargo feature `mouse` (off by default), started and stopped by the Debug command `debug_mouse_trial`. Only the button flags and the wheel turn of each record are read. Measured with `tests/bench/mouse-trial.mjs` (30 s per row, a release build with the feature, the app process only; fake input from `SendInput`, so it is a good model of a real mouse, not an 8,000 Hz one):

| State | CPU (one core) | Threads (start to end) | Handles | Memory |
|---|---|---|---|---|
| Capture off, idle | 0% | 20 to 17 (start-up settling) | 373 | 30.4 MB |
| On, mouse not used | 0% | 18 to 17 | 375 | 30.4 MB |
| On, the mouse moving at 1,000 a second | 0.1% | 17 to 17 | 375 | 30.5 MB |
| On, 50 clicks and 50 wheel notches | 0% | 17 to 17 | 375 | 30.5 MB |
| Off again, idle | 0% | 16 to 15 | 372 | 30.4 MB |

- **Moving:** 30,000 fake moves were sent, 29,999 Raw Input records arrived, and none was passed on (no button or wheel flag): about 0.1% of one core, so **batching with `GetRawInputBuffer` is not needed** at 1,000 Hz. An 8,000 Hz mouse is eight times that and is not measured.
- **Buttons and wheel:** 50 clicks (a press and a release each, cycling all five buttons) and 50 notches (up and down in turn) gave exactly the 150 events sent.
- **On and off:** 20 cycles left the thread count at 14 and the handle count at 370, the same as before. Nothing leaks.
- **Not yet checked:** the overlay showing the clicks (the names go into the keyboard stream; the Windows e2e suite of step 8 checks it), a left-handed button swap (the plan says physical buttons), and the cost with a real 8,000 Hz mouse.

## Step 2 result: names and wheel (2026-11-02)

Built as in the plan, as plain logic with no system calls, compiled and tested on every system (22 tests, run by a normal `cargo test`), and not used by the app yet:

- `mouse/names.rs`: one small table per system: Windows Raw Input flags (from step 1), X11 button numbers 1 to 9, Linux evdev button codes (`BTN_SIDE` and `BTN_BACK` both back, `BTN_EXTRA` and `BTN_FORWARD` both forward) with `REL_WHEEL` and `REL_HWHEEL` for the wheel (the high-resolution codes skipped), and macOS button numbers 0 to 4. Unknown codes are ignored, and nothing names a movement code.
- `mouse/wheel.rs`: `Notches` adds wheel turns per axis into whole notches (120 on Windows, one line on macOS; 30 + 30 + 60 is one notch, 60 up then 60 down is nothing, a fast turn can be several) and `Throttle` lets one press per wheel direction through every `MIN_TAP_MS` (a burst of 50 notches in 98 ms is one press; a notch every 10 ms for a second is ten). It keeps no clock: the caller passes the time. `MIN_TAP_MS` is 100, to match `ui/overlay/taps.js` when that exists (step 6).
- `mod mouse` is compiled in every build now (the spike in `rawinput.rs` still needs the cargo feature on Windows); the two modules carry `allow(dead_code)` until step 4 uses them.

## Step 3 result: the setting (2026-11-02)

`settings.rs` `defaults()` has `"inputs": { "mouse": { "enabled": false } }`, in the file format list of `docs/FILE-FORMATS.md` and in the UI sandbox's copy of the defaults (a test keeps them equal). No migration and no version bump: a file saved before has no `inputs` and gets the default. There is no line in `sanitize.rs`: the sanitizer follows the default's type, so the switch is a boolean and anything else (text, a number, null, a list, an object) goes back to off, and a broken `inputs` section goes back to the default; only the keys the defaults know survive, so `gamepad` has to get its own default before it can be saved. Four unit tests (in `settings/tests.rs`): off by default, an older file gets it, `true` stays and a wrong type goes back to off, and a broken section goes back to the default. Nothing reads the setting yet (step 4 starts the capture from it) and the overlay never does.

## Step 4 result: the Windows capture is real (2026-11-02)

The spike became the Windows method, so the cargo feature `mouse` and the Debug command `debug_mouse_trial` are gone:

- `mouse::start(tx)` picks the method for this system (`rawinput.rs` on Windows; a system without one answers "Mouse buttons aren't available on this system yet.") and sends the names into the keyboard's own event stream. The wheel uses step 2's `Notches` and `Throttle`: turns add up into whole notches, and each notch is a short press, at most one per direction every `MIN_TAP_MS`.
- `keyboard::Bus` has an independent mouse slot: `set_mouse(on)` starts or stops it (the keyboard method is untouched) and, off, releases any `Mouse…` name still held; `mouse_running()` says whether it runs (`get_state` has `mouseRunning`). A mouse name never counts as proof that the keyboard works (`has_seen_keys`), and Pause drops mouse events like keys (tests for both).
- The command `set_mouse_input(enabled)` is in `commands/settings.rs` next to `set_input_method`, not in `mouse/mod.rs` as the plan said: it saves `inputs.mouse.enabled` only after the capture started (so the setting stays off when it could not), refreshes the tray's Show menu and tells the settings window, and keeping the file write out of `mouse/` leaves step 5's rule (no file writes in `mouse/`, like `keyboard/`) simple. `main.rs` starts the capture at launch when the setting is on.
- `tests/bench/mouse-trial.mjs` uses the command and counts the mouse names on the overlay stream. There is still no switch in the settings window (step 7), so a person turns it on from the debugging connection (docs/DEBUGGING.md).

## Step 5 result: the privacy rules (2026-11-02)

In `tools/privacy-patterns.mjs` and `tools/check-privacy.mjs`, each pattern with tests in `tests/ui/privacy-patterns.test.mjs`:

- `POINTER_POSITION`, failing anywhere in the app's Rust code: `GetCursorPos`, `GetPhysicalCursorPos`, `MSLLHOOKSTRUCT`, `WH_MOUSE_LL`, `lLastX`, `lLastY`, `CGEventGetLocation`, `XI_RawMotion`, `RAW_MOTION`, `root_x`, `root_y`, `event_x`, `event_y`, `CGEventMaskBit(…Moved`, any `…MouseMoved` or `…MouseDragged`, and `.location(` on something named like an event. The last one is narrower than the plan's wording on purpose: a panic report has a `.location()` too (`crash.rs`, the source line of a crash), and a pattern that also matched that could only be silenced by an exception.
- `MOUSE_MOVEMENT_CODES` (`REL_X`, `REL_Y`, `ABS_X`, `ABS_Y`): in `src-tauri/src/mouse/` only on the line that masks them out (`EVIOCSMASK`, step 9); other code may use them (a controller's sticks).
- The file-write rule covers `mouse/` like `keyboard/`, and the input-device library (`evdev::`) is allowed in `mouse/linux_devices.rs` (which does not exist yet) as well as the keyboard's. `LINUX_ACTIVE` and `MAC_ACTIVE` already apply to every file.
- The header comment of `check-privacy.mjs` and its "passed" line say "no pointer position or movement". A planted file in `mouse/` with a file write, `GetCursorPos`, `REL_X` and an event's `.location()` made the check fail four times, and none of the app's code trips it today.
- `PRIVACY.md` has a paragraph on the mouse (what the app sees, what it never does, how each system is read), "mouse" in the diagram of where keystrokes go, and a `grep` for the pointer in "How to check it yourself".

## Step 6 result: taps and the layout (2026-11-02)

- **`ui/overlay/taps.js`** (with `tests/ui/overlay-taps.test.mjs`, 11 tests): a key that goes down and up in the same moment, which is every wheel notch and PrintScreen on Windows (Windows reports only its release, so the tracker sends it as an instant tap), added and removed its `down` look within one frame and so showed nothing. A tap now shows for at least `MIN_TAP_MS` (100, the same number as `mouse/wheel.rs`; a test compares them) after its press. Every other key is released at once, as before, and a timer is started only when an early release arrives, so an idle overlay runs nothing. `overlay.js` routes every press and release through it; pause and a lost connection still darken everything at once. On the real overlay (the test copy's live preview, key presses injected): PrintScreen stays lit 101 ms (before: under a frame), a W pressed and released in the same moment 114 ms, a W held half a second is released at once.
- **The layout** is the one the drawn-devices plan decided, not this plan's loose-key `mouse.json`: **WASD + mouse** (`ui/overlay/layouts/wasd-mouse.json`, from `tools/gen-layouts.mjs`): the WASD keys and a drawn mouse (`"device": "mouse"`) as tall as they are. It waits under Other layouts (it is not in `DEFAULT_ORDER`). The built-in layout count is thirteen, and the layout test no longer expects a device block to be a name from the keyboard tables.
- The drawn mouse lights up only while the mouse input is on, and the settings window has no switch for it yet (step 7).

## Step 8 result: the Windows suite and the numbers (2026-11-07)

- **`npm run test:e2e -- --suite inputs`** (`tests/e2e/suites/inputs.mjs`, 17 checks): the Mouse card and its switch (off at first, nothing runs, no setting saved), turning it on from the card (the capture runs, the setting is saved), all five buttons as presses and releases in order, a wheel notch as one tap each way, 2 seconds of one-pixel moves sending nothing, Pause dropping clicks and resume bringing them back, turning it off (no events, setting saved off, thread count back to what it was) and ten on/off cycles leaving no thread behind. It reuses `tests/bench/mouse-inject.ps1`: the input goes into a small window of its own under the pointer, so no click reaches another app.
- **The numbers** (`node tests/bench/mouse-trial.mjs`, the finished app, 30 s each): capture off, idle 0 %; on, mouse not used 0 %; on, moving at 1,000 a second (30,000 moves) 0.8 % of one core and no event seen; on, 50 clicks and 50 wheel notches 200 events seen of 200 expected, 0 %; off again 0 %; 20 on/off cycles 14 threads before and after, 371 handles before and after. Memory stays near 52 MB. Moving costs more than step 1's spike measured (0.1 %), still under one percent, so no batching of moves is needed.

## Step 9 result: Linux (2026-11-07)

- **The shared helper move** (its own commit): the `poll()` binding, the wake-pipe wait, the device folder and the read-only open went from `keyboard/linux_devices.rs` into `src-tauri/src/linux_poll.rs`, which both readers use. It has no evdev in it, so the privacy check's rule (evdev only in the two `linux_devices.rs` files) stays as it was. The keyboard's behavior and tests are unchanged. The X11 connection code (`connect`, the handle with its wake window) is shared the same way: `keyboard/x11.rs` exposes it to `mouse/x11.rs`.
- **`mouse/x11.rs`**: raw button press and release on the root window; no raw motion selected. Buttons 1 to 3, 8 and 9 are held names; 4 to 7 are one short press per notch through the same `Throttle` as Windows.
- **`mouse/linux_devices.rs`**: mice (a left button, not `BTN_TOUCH`) opened read-only, `EVIOCSMASK` set to all key codes, the two wheel codes and no absolute axis (each mask a whole number of 8-byte words: the kernel answers EINVAL to any other size, which CI showed on the first try), one `poll()` thread; unplugging a mouse or a `SYN_DROPPED` releases its buttons. 7 unit tests (the masks, the ioctl number, a recorded stream without movement, the permission error, prompt stop) and 4 ignored device tests on a uinput virtual mouse (every button and wheel direction; `movement_never_wakes_the_capture` counts `poll()` wakes in test builds across 1,000 moves; the missing-permission error).
- **`mouse::start`** picks Wayland (devices) or X11 the way the keyboard does. An error (no permission, no mouse, no X display) reaches the Mouse card as before.
- **CI** (`linux-tests.yml`, `tests/linux/overlay-check.mjs`): the x11 job writes `inputs.mouse.enabled` into the installed app's settings, clicks buttons 1 2 3 4 5 8 9 and checks the names in order, then moves the pointer and expects nothing; the wayland job runs the four device tests as the test user (without and with the input group).
- **Checked here** on Windows: `cargo test` and `clippy` (nothing of this is built on Windows) and `check:privacy`. The Linux code was compiled with `cargo check --tests` and `clippy -D warnings` for `x86_64-unknown-linux-gnu` in a scratch crate; running it is up to CI, which is the only Linux this project has.

## Effort

About **6 to 8 working sessions** (a rough estimate): Windows with tests 2, overlay and UI 1–2, Linux (both methods and CI) 2, macOS 1, docs 1.

## Open questions

1. ~~CLAUDE.md §4: may `mouse/` (and `gamepad/`) hold system code?~~ Yes (maintainer, 2026-11-01; CLAUDE.md §4 says so).
2. May the Linux device helpers move out of `keyboard/linux_devices.rs` into a shared file, so mice and keyboards use one copy?
3. Raw Input only on Windows (no mouse hook, no choice for the user), as this plan proposes?
4. Physical buttons (a left-handed setup shows the physical left button as `MouseLeft`), or the system's swapped meaning?
5. Ignore trackpad and Magic Mouse scrolling, so `Wheel…` keys mean a real wheel only?
6. Add mouse keys to the WASD gameplay layout later, or keep mouse keys to the Mouse layout and user layouts?
7. Is `MIN_TAP_MS = 100` the right minimum for taps, and should it apply to PrintScreen too?
