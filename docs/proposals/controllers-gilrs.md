# Proposal: controller input with gilrs

Status: **Proposed** (2026-10-19); not approved yet. Decided 2026-10-31: common gamepads first (Xbox, PlayStation, Switch,
third-party), drawn as a controller ([drawn-devices.md](drawn-devices.md), which also lists the idle improvements:
listen only while a controller is connected, event-based where possible, pause while no overlay is shown), trigger
thresholds tried by hand, ViGEmBus for the Windows e2e test. Step 1, a spike behind an off-by-default cargo feature, is built on a
branch and measured on Windows and Linux without a controller (see "Step 1: the spike"). gilrs is not approved as a
dependency yet.

This plan says how game controllers (gamepads) would reach the overlay through the `gilrs` library: buttons as keys, sticks
and triggers as analog values. It follows [design/future-inputs.md](../design/future-inputs.md) for the names, the
protocol, the settings and the privacy rules. It was first written from gilrs's source code; step 1, a spike behind a
cargo feature, then measured part of it. **The short answer:** gilrs maps controllers well, but on every system it breaks
at least one of our idle or start/stop rules as it is (see "What gilrs does on each system"; the Windows and Linux
numbers in step 1 confirm it). The rest of the spike decides between gilrs with small fixes sent upstream, and our own
code per system.

## Goal

- With **General → Mouse and controller → Show my controller** on, pressing a button on an Xbox-style controller lights the key
  with that name (`PadA`, `PadLB`, …) in any layout, and sticks and triggers move on a built-in controller layout.
- Off by default. While off, nothing about controllers runs: no thread, no open device, no library code.
- About 0% CPU while the setting is on and nobody touches the controller, as for the keyboard.
- Windows first, then Linux and macOS through the same interface, with a "not available on this system yet" fallback.

## Non-goals

- Rumble (force feedback), battery level, controller names on screen, gyro and touchpads.
- A second controller (`Pad2A`, …). future-inputs.md §2 says to add it only when it's needed.
- Remapping buttons in the app. The names are fixed by position, as on an Xbox pad.
- Steering wheels, flight sticks and other joysticks. gilrs reports them, but they have no names in future-inputs.md; they
  are ignored.
- Mouse buttons: [mouse-input.md](mouse-input.md).

## What gilrs does on each system

gilrs **0.11.2** (2026-05-30, with gilrs-core 0.6.8; the repository's main branch has one small commit since). It is two crates:
`gilrs` (names, mappings, filters) on top of `gilrs-core` (one backend per system).

| | Windows: `wgi` (default feature) | Windows: `xinput` feature | Linux | macOS |
|---|---|---|---|---|
| System API | Windows.Gaming.Input | XInput (`xinput1_4.dll`, loaded at run time by `rusty-xinput`) | evdev devices found through udev (inotify inside Flatpak) | IOHIDManager (IOKit) |
| Works while a game has focus | **No.** gilrs's README: "Windows Gaming Input requires an in focus window to be associated with the process to receive events". Our app runs in the background, so this backend is unusable for us | Yes | Yes | Yes (HID values arrive in the background) |
| How it waits | A background thread polls **every 8 ms**, always, even with no controller | A background thread polls **every 10 ms**, always (disconnected slots once a second) | `epoll` on the device files: sleeps in the kernel, no timer | A CFRunLoop thread with HID callbacks: sleeps, no timer |
| Stops when dropped | Yes (joins its thread) | **No.** The thread has no stop signal and runs until the app exits; turning the setting off and on again starts one more polling thread each time | Partly: device files close, but the udev hotplug thread stays blocked until the next controller is plugged in or out | **No.** `CFRunLoop::run()` is never stopped, so the HID manager stays open and its callbacks keep running after we let go of gilrs |
| Can our blocking wait be woken to stop | Not needed (polls) | No API | No API: `next_event_blocking(None)` waits in `epoll` and gilrs offers no way to wake it | No API |
| Controllers seen | Xbox, PlayStation, Switch and others | **Xbox-compatible only** (XInput), at most 4 | Any with a kernel driver | Any HID gamepad (Xbox over USB may need the GameController framework instead: to check) |

Also true everywhere:

- **Force feedback starts a thread that wakes every 50 ms forever** (`ff/server.rs`, `TICK_DURATION = 50`). We must build with
  `GilrsBuilder::new().with_force_feedback(false)`, which skips that thread.
- **Linux opens controllers for writing.** `Gamepad::open` uses `O_RDWR`, and for a controller that can rumble it opens the file
  a second time (`File::create`) and uploads one rumble effect with the `EVIOCSFF` ioctl, **even with force feedback off**
  (the effect is never played and is removed when the file closes). Our keyboard promise is "opened read-only"; for
  controllers this would not hold as written. Either PRIVACY.md says so honestly, or gilrs gets an option not to (upstream).
- gilrs logs every input event at trace level through the `log` crate. With no logger installed (our app installs none, and
  `npm run check:privacy` forbids it) these lines go nowhere; that must stay true.
- It reads SDL's controller mappings from the `SDL_GAMECONTROLLERCONFIG` environment variable (Steam sets it) and embeds
  SDL_GameControllerDB (zlib license) at build time, filtered to the target system by its `build.rs`.

So gilrs as published fits our rules only on Linux, and even there it can't be stopped cleanly. The fixes are small and
fit gilrs's code (a stop signal for the XInput thread and the macOS run loop, a waker for the Linux `epoll`, and an
"input only" open on Linux). gilrs is MIT/Apache-2.0 and active (releases in 2026-01 and 2026-05), so sending them upstream
is realistic; until they are released we would have to wait, or pin a reviewed fork (open question 2).

## Step 1: the spike (built on a branch, not merged)

The spike is on a separate work branch, behind the cargo feature `gamepad` (off by default). It is not merged,
and gilrs is not approved as a dependency.

**What it has:** `gamepad/names.rs` (the name table), `gamepad/held.rs` (which buttons are held; released when a
controller goes away or capture stops), and `gamepad/mod.rs` (only with the feature): `start(tx) -> Handle` and
`Handle::stop()`, gilrs built with `with_force_feedback(false)` and `set_axis_to_btn(0.5, 0.4)`, buttons sent as key
events into the keyboard's channel. It starts only when the app is launched with `KEYOVERLAY_GAMEPAD=1` (or `cycle`, for
20 on/off cycles first); there is no settings switch. The privacy check gained the rules listed under "Privacy" below.

**Left out on purpose:** sticks and triggers as moving values (the spike sends buttons only; a trigger counts as a button
past 0.5 and is released below 0.4); the built-in `controller.json` layout (every file in `ui/overlay/layouts/` ships in
every app, so it would show in Other layouts with nothing able to light it; the trial imports a layout instead); and a way
to wake the stop wait (published gilrs has none, so the thread waits at most one second at a time; open question 3).

**Measured on Linux** (a container with no controller, no `/dev/uinput` and no udev daemon, Xvfb, a debug build, so the
virtual controller test could not run):

| | Threads | CPU in 10 s idle | Wakes in 10 s idle |
|---|---|---|---|
| Built with the feature, `KEYOVERLAY_GAMEPAD` not set | 30 | 1 tick (10 ms) | no `gamepad` or `gilrs` thread |
| `KEYOVERLAY_GAMEPAD=1` | 32 (+ `gamepad`, + gilrs's udev thread) | 3 ticks | `gamepad` 10 (the one-second stop check), `gilrs` 0 |
| `KEYOVERLAY_GAMEPAD=cycle` | 52 (**+ 20 `gilrs` threads left behind**) | 3 ticks | as above; the leftover threads sleep |

The ignored test `count_threads_over_on_off_cycles` shows the same: one more `gilrs` thread after every on/off. This
confirms the Linux row of the table above: gilrs's udev thread doesn't stop.

**Measured on Windows** (2026-10-20, a Windows 11 PC with an 8-core Intel CPU and 16 logical processors; a debug build
with `--features gamepad`; **no controller connected**, the settings window closed, the PC idle; wakeups from the
`\Thread(keyoverlay*)\Context Switches/sec` counter, averaged over 10 seconds):

| | Threads | CPU in 60 s idle | Threads waking more than 0.2 times a second | Context switches a second, all threads |
|---|---|---|---|---|
| Built with the feature, `KEYOVERLAY_GAMEPAD` not set | 16 | 0 ms | 0 | 0 |
| `KEYOVERLAY_GAMEPAD=1` | 20 | 0 ms | 2: one at about 97 a second, one at 1.2 | about 98 |
| `KEYOVERLAY_GAMEPAD=cycle` (20 on/off cycles, then on) | 37 | 0 ms | 22: **about 20 threads each at 98 to 100 a second** | about 2045 |

What this says: built in but not switched on, nothing changes. Switched on with no controller, the XInput polling thread
wakes about 100 times a second. **Each on/off cycle on Windows leaves one polling thread behind that keeps waking about
100 times a second** (the Linux leftovers sleep; these don't). So an on/off switch in the settings window would pile up
threads, unless the thread is started once and kept, or the backend is fixed upstream. CPU time rounds to 0 ms because
that clock moves in 15.6 ms steps; the switch counts are the useful number, and a finer tool (Process Explorer or a
performance trace) is needed for a CPU figure.

**Not measured yet** (needs a controller): one connected controller left untouched; whether A shows as `PadA`; the trial
layout lighting in the overlay; buttons with a full-screen game in front; macOS.

**Found on the way, not from gilrs:** on Linux X11 the app wakes about 20 times a second while idle, with or without this
feature. The `global-hotkey` crate behind `tauri-plugin-global-shortcut` runs a thread that sleeps 50 ms in a loop
(global-hotkey 0.8.0, `platform_impl/x11/mod.rs`), started when the plugin loads even with no pause shortcut set.

## How it works

### Where the code lives

A new input kind gets its own sibling folder of `keyboard/` (future-inputs.md §1.4): **`src-tauri/src/gamepad/`**.

| File | What it does |
|---|---|
| `gamepad/mod.rs` | `start(sink) -> Result<Handle, String>` and `Handle::stop()`, like `keyboard/hook.rs`. Owns the one `gamepad` thread and gilrs. The only file that names `gilrs` (a privacy-check rule) |
| `gamepad/names.rs` | The name table: gilrs `Button` / `Axis` → our names (below). Plain logic, built and tested on every system |
| `gamepad/analog.rs` | Rounding, the per-control rate limit and the trigger's on/off threshold. Plain logic with a fake clock, tested everywhere |

gilrs hides the system calls, so these files need no `#[cfg(windows)]` code of their own; the per-system choice is the
cargo features in `Cargo.toml`. CLAUDE.md §4 still says "OS-specific code goes in `platform.rs` or `keyboard/`, nowhere else":
it needs one line naming the input folders `gamepad/` and `mouse/` (open question 5).

### Start and stop

- `keyboard::Bus` gets a second, independent source slot (future-inputs.md §4): `Bus::set_gamepad(on) -> Result<(), String>`.
  On: `gamepad::start`. Off: `Handle::stop()`, then a release for every `Pad…` name still held, so no button stays lit.
- A Tauri command `set_gamepad_input(enabled)` (in `gamepad/mod.rs`, like `set_pause_hotkey` lives in `hotkeys.rs`) calls it
  and saves `inputs.gamepad.enabled` only on success. `main.rs` starts the source at launch when the setting is on.
- A start error (no XInput DLL, no udev) is kept like `Bus::error()` and shown under the switch.

### The gamepad thread

```
gilrs.next_event_blocking(timeout)  →  names.rs  →  buttons: KeyEvent { down, code } on the keyboard's channel → dispatcher
                                                 →  sticks/triggers: analog.rs → Bus::forward_analog (pause check) → broadcast
```

- **Buttons** go into the same `Sender<KeyEvent>` channel and dispatcher as the keyboard, so held keys, pause and `snap` work
  unchanged. gilrs already filters repeats (`ButtonPressed` once per press).
- **Analog values** don't fit `KeyEvent`. Rather than change the channel every keyboard source uses, `Bus` gets an
  `analog_tx: broadcast::Sender<AnalogEvent>` and `forward_analog()`, which checks pause under the same `held` lock as
  `forward()` and keeps the last value of each control that is not at rest (for reconnects, below).
- **The wait:** `next_event_blocking(None)` while nothing is pending, so the thread sleeps. While a rate-limited value is waiting
  to be sent, the timeout is the time until it may go (at most about 17 ms). Timers run only while a stick moves.
- **Stopping** needs a way to wake that wait. With published gilrs there is none (see the table). The spike tries, in order:
  the upstream waker; a one-second timeout while the setting is on (one wake a second, to measure and to propose as
  an exception, open question 3); or keeping one gilrs for the whole run once first switched on (not acceptable on macOS,
  where its HID callbacks would keep running while the setting is off).

### Names (future-inputs.md §2)

| gilrs | Name | | gilrs | Name |
|---|---|---|---|---|
| `South` | `PadA` | | `Select` | `PadBack` |
| `East` | `PadB` | | `Start` | `PadStart` |
| `West` | `PadX` | | `Mode` | `PadHome` |
| `North` | `PadY` | | `LeftThumb` / `RightThumb` | `PadLS` / `PadRS` |
| `LeftTrigger` / `RightTrigger` (the bumpers) | `PadLB` / `PadRB` | | `DPadUp` … `DPadRight` | `PadUp`, `PadDown`, `PadLeft`, `PadRight` |
| `LeftTrigger2` / `RightTrigger2` (the triggers, 0 to 1) | `PadLT` / `PadRT` | | `LeftStickX/Y`, `RightStickX/Y` | `PadStickL`, `PadStickR` |

- gilrs names buttons by position (South = A on Xbox, Cross on PlayStation), which is the rule in future-inputs.md.
- `C`, `Z`, `Unknown` and the `LeftZ` / `RightZ` axes are ignored. A D-pad that reports as a hat is turned into the four buttons
  by gilrs's default `axis_dpad_to_button` filter.
- **Direction:** gilrs makes stick Y positive **up** on every system; our protocol has **down** positive, so `names.rs` flips
  Y (one line, with a test).
- Only the **first** controller (the lowest gilrs id still connected) is shown; events from others are dropped.

### Analog values on the wire (future-inputs.md §3)

```json
{"t":"a","k":"PadStickL","x":0.42,"y":-1}
{"t":"a","k":"PadRT","v":0.8}
```

- **Rounding and changes:** values are rounded to 2 decimals; a message goes out only when the rounded value changed.
- **Rate limit:** at most one message per control every 1000/60 ms (`ANALOG_MIN_INTERVAL_MS = 17`). A newer value inside
  that time replaces the waiting one, and the last one is always sent, so a stick let go always ends at 0. Four controls
  at 60 a second is at most 240 small messages a second while all are moving, inside the server's broadcast buffer
  (256); a client that still falls behind gets a resync.
- **Deadzones:** gilrs's default filters stay on (a radial deadzone from the device's own resting range, and a 0.01 jitter
  filter), so a stick at rest sends nothing. A worn stick that drifts past the deadzone still sends at most 60 a second.
- **Triggers as buttons:** a trigger past 0.5 also sends `d` for `PadLT` / `PadRT`, and `u` when it drops back (future-inputs.md
  §3). To stop a trigger resting near 0.5 from flickering, `u` comes below 0.4 (`TRIGGER_RELEASE = 0.4`); that detail goes into
  future-inputs.md first (its §8 step 2). gilrs's own threshold (`set_axis_to_btn`, 0.75 / 0.65) is not used.
- **Reconnects and resync:** after `snap`, the server sends one `a` message for each control not at rest, from the values
  `forward_analog` kept, so the protocol needs no new field. Pause sets every kept value back to rest.
- `server.rs` (extra care, CLAUDE.md §8) gets one more `select!` arm for `analog_tx` and an `analog_msg()` beside `ev_msg()`.
  PROTOCOL.md moves `a` from "reserved" to "sent".

### Idle cost

| State | Expected cost (measure with `tests/bench/run.mjs`; the spike's numbers are in step 1) |
|---|---|
| Setting off | Nothing: gilrs is never created |
| On, no controller, Linux and macOS | One sleeping thread (two on Linux: ours and gilrs's udev monitor) |
| On, Windows with the `xinput` feature as published | gilrs's thread wakes 100 times a second (measured in step 1): **breaks the 0% rule** until fixed or replaced |
| On, controller connected but not touched | Linux: nothing. macOS: to measure; a PlayStation pad's motion sensors may report non-stop over HID |
| Sticks moving | At most 60 messages a second per control |

## Settings

- The reserved section, used as written: `"inputs": { "gamepad": { "enabled": false } }` (future-inputs.md §5), with the mouse's
  `"mouse": { "enabled": false }` beside it when [mouse-input.md](mouse-input.md) is built.
- A default in `settings.rs`, and a `sanitize.rs` line (a bool, anything else → `false`). Adding a section is additive: defaults
  are merged in on load, so no migration and no version bump. A unit test checks the default is off and a wrong type cleans to off.
- The overlay doesn't need the setting: buttons arrive as keys, and a layout without `Pad…` keys shows nothing new.
- `CONTROLS` in `controls.js` is for the style sliders and colors; this switch is drawn by the General tab like the pause
  shortcut, so there is no `CONTROLS` line.

## Overlay

### A built-in controller layout

`ui/overlay/layouts/controller.json`: **Controller (Xbox style)**, one plain layout file like the others (no format change,
future-inputs.md §2):

```json
{
  "id": "controller",
  "name": "Controller",
  "keys": [
    { "code": "PadLT", "label": "LT", "x": 0, "y": 0, "w": 2 },
    { "code": "PadRT", "label": "RT", "x": 9, "y": 0, "w": 2 },
    { "code": "PadLB", "label": "LB", "x": 0, "y": 1, "w": 2 },
    { "code": "PadRB", "label": "RB", "x": 9, "y": 1, "w": 2 },
    { "code": "PadStickL", "label": "", "x": 0.5, "y": 2.5, "w": 2, "h": 2 },
    { "code": "PadBack", "label": "⧉", "x": 4, "y": 2.5 },
    { "code": "PadHome", "label": "◎", "x": 5, "y": 2 },
    { "code": "PadStart", "label": "≡", "x": 6, "y": 2.5 },
    { "code": "PadY", "label": "Y", "x": 9, "y": 2 },
    { "code": "PadX", "label": "X", "x": 8, "y": 3 },
    { "code": "PadB", "label": "B", "x": 10, "y": 3 },
    { "code": "PadA", "label": "A", "x": 9, "y": 4 },
    { "code": "PadUp", "label": "↑", "x": 3, "y": 4.5 },
    { "code": "PadLeft", "label": "←", "x": 2, "y": 5.5 },
    { "code": "PadRight", "label": "→", "x": 4, "y": 5.5 },
    { "code": "PadDown", "label": "↓", "x": 3, "y": 6.5 },
    { "code": "PadStickR", "label": "", "x": 6, "y": 5, "w": 2, "h": 2 },
    { "code": "PadLS", "label": "LS", "x": 0.5, "y": 4.5, "w": 2 },
    { "code": "PadRS", "label": "RS", "x": 6, "y": 7, "w": 2 }
  ]
}
```

(Positions are a first draft; the final arrangement is made in the key editor and reviewed in the pull request.) It is **not** in
`DEFAULT_ORDER` (`layout_order.rs`): it waits in **Other layouts** until added, so a fresh install's Layout tab is unchanged.
`gen-layouts.mjs` and the layout schema need nothing; the schema's `code` description gains "or a mouse or controller name
(design/future-inputs.md)".

### How analog keys are drawn

- **No new layout field.** A key is analog because of its name: `overlay.js` gets one table,
  `const ANALOG_KEYS = { PadStickL: 'stick', PadStickR: 'stick', PadLT: 'trigger', PadRT: 'trigger' }`, and `build()` adds the
  class `stick` or `trigger` and one extra child to those keys. Any layout, including one the user made, gets the same drawing.
- **Stick:** a round thumb inside the key, moved with `transform: translate(calc(var(--ax) * var(--reach)), calc(var(--ay) * var(--reach)))`.
  The message handler sets only `--ax` / `--ay` on that key's element. Round corners come from the key's own size (a 2×2 key
  with the theme's radius at 50%).
- **Trigger:** a fill inside the key, `transform: scaleX(var(--av))` from the left, plus the normal `down` look past 0.5 (from the
  `d` / `u` messages, so on/off-only themes still work).
- Only `transform` and `opacity` change (CLAUDE.md §1.3). Themes color the thumb and fill with their existing pressed colors,
  so `themes/*.js` need no change; a theme may restyle `.stick` / `.trigger` if it wants.
- `onmessage` gains one branch, `message.t === 'a'`; pause and close reset `--ax`, `--ay` and `--av` to 0. Old overlays already
  ignore `a`.
- The live preview's "click a key to test" keeps working for buttons; a stick shows its thumb at rest.

## Settings window UI

- **Where:** a new card in **General**, after **Keyboard input**: **Mouse and controller** (`data-test="general-other-inputs"`),
  shared with the mouse switch from [mouse-input.md](mouse-input.md). One small component file, `tabs/general-inputs.js`,
  built from the existing `Section`, `Switch` and `Note` blocks.
- **Wording** (its `WORDS` block):
  - Switch: **Show my controller** (`data-test="gamepad-switch"`)
  - Note: "Shows the buttons, sticks and triggers of one game controller, in any layout with controller keys. Add the
    Controller layout from Other layouts on the Layout tab."
  - Windows note while the XInput backend is used: "Works with Xbox controllers and others that act like one."
  - Error line under the switch, as for keyboard input (`data-test="gamepad-error"`).
- **Every system** (CLAUDE.md §4): the same switch and text on Windows, macOS and Linux; no system words are needed. On a system
  where it can't start, the switch turns back off and the error says "Controllers aren't available on this system yet."
  `npm run check:systems` passes as the text names no Windows-only thing.
- **Linux permission:** on most desktops a logged-in user may read controllers without the `input` group (systemd gives the
  person at the computer access to joystick devices through its `uaccess` rule); keyboards and mice don't get that. gilrs
  only logs a refused device, so `gamepad/mod.rs` checks itself: a `/dev/input/by-id/*-event-joystick` file exists but
  can't be opened → the error is `NO_PERMISSION` from `keyboard/linux_devices.rs`, and the existing keyboard access notice
  (`access-notice.js`, the input-group command) is reused with one more rule, not copied.
- **macOS:** HID game controllers most likely don't need Input Monitoring (macOS asks for it for keyboards; gilrs only
  matches the GamePad, Joystick and MultiAxisController usages). Still to confirm on a Mac with Input Monitoring off.
  If it is needed, the keyboard access notice already asks for it.
- `tests/README.md` lists the new hooks.

## Dependency review

| | |
|---|---|
| Crate | `gilrs` **0.11.2** (2026-05-30), `gilrs-core` 0.6.8 (2026-05-30). Rust 1.84 or later |
| License | **MIT or Apache-2.0** (both crates), fine for this MIT project. The embedded SDL_GameControllerDB is **zlib**: `src-tauri/about.toml` must accept zlib, or `tools/notices.mjs` (cargo-about) stops the release |
| Source | gitlab.com/gilrs-project/gilrs (mirror github.com/Arvamer/gilrs) |

**What it would add**, checked against our `src-tauri/Cargo.lock` (features as we would set them:
`default-features = false, features = ["xinput"]`; on Linux and macOS the features change nothing):

| System | New crates | Already in our build (no new code) |
|---|---|---|
| Every system | `gilrs`, `gilrs-core`, `vec_map` (0.8.2, MIT/Apache, no dependencies) | `uuid`, `log`, `fnv` |
| Windows, `xinput` (the one we'd use) | + `rusty-xinput` (1.3.0, 2023), `lazy_static`, `winapi` 0.3.9 (in the lock file through `dlopen2` and `libloading`, but not built for Windows today, so new code there: measured in step 1) | none |
| Windows, `wgi` (the default, not usable for us) | none | `windows` 0.62.2 with five more features (`Gaming_Input`, …): no new crate, but more of `windows` is compiled |
| Linux | + `inotify` (0.11.x), `inotify-sys`, `libudev-sys` (0.1.4, 2018) | `nix` 0.31.3 (already built for `os_info`; gilrs adds its `ioctl` and `event` features, which pull nothing new), `libc` |
| macOS | + `objc2-io-kit` (0.3.2, features `std`, `libc`, `hid`) | `objc2-core-foundation` 0.3.2, `bitflags`, `libc` |

So: **3 new crates on Windows (6 with the `xinput` feature we need), 6 on Linux, 4 on macOS.** Two more costs:

- **Linux links the system's `libudev`** through `libudev-sys`: the build needs `libudev-dev` and `pkg-config` (the Linux CI,
  CROSS-PLATFORM.md's `apt-get` line and the .deb's dependencies gain them; `libudev1` is on every systemd desktop). The
  AppImage must not bundle its own libudev.
- `rusty-xinput` and `winapi` are old-style crates (2023, and winapi is in maintenance); the `windows` crate we already use has
  XInput too (`Win32_UI_Input_XboxController`).

**Compared with our own code on each system** (no new crate on Windows or Linux):

| System | Direct API | What it would take |
|---|---|---|
| Windows | XInput through the `windows` crate we already have (one more feature) | XInput can only be polled. To stay at 0% when nobody touches the controller: register Raw Input for the gamepad usages (1/5 and 1/4) with `RIDEV_INPUTSINK` and `RIDEV_DEVNOTIFY` on a message-only window (the pattern of `keyboard/rawinput.rs`) and read `XInputGetState` only when a `WM_INPUT` arrives; `WM_INPUT_DEVICE_CHANGE` is the hotplug. About 200 lines. Xbox-type pads only, like gilrs's `xinput` |
| Linux | `evdev`, already a dependency | The `keyboard/linux_devices.rs` pattern: `poll()` plus a wake pipe, opened **read-only**, devices picked by `BTN_SOUTH` + `ABS_X`. The kernel's gamepad rules (xpad, hid-playstation, hid-nintendo) already give standard codes, so most pads need no SDL mappings. About 250 lines, no new crate. Hotplug needs inotify (a few `extern "C"` lines, like `poll`) |
| macOS | IOHIDManager through the `core-foundation` crate we have and a few `extern "C"` IOKit lines, or Apple's GameController framework (`objc2-game-controller`, one new crate; needs `GCController.shouldMonitorBackgroundEvents = true`, macOS 11.3+, to get input while a game is in front) | The most work: about 300 lines. GameController also knows PlayStation and Switch layouts and Xbox pads on a USB cable |

gilrs's value is its mappings for many controllers and having one code path. Its costs for us are the idle and stop behavior
above, the write access on Linux, and 3 to 6 new crates next to the keyboard hook. Recommendation: finish measuring the gilrs
spike, and offer the upstream fixes; if they can't land, build our own on Windows and Linux (no new
crates) and decide macOS separately.

## Privacy

Controller presses are input like keystrokes: memory only, sent only to the local overlay, never logged or written
(future-inputs.md §7: "buttons and analog values only, while the feature is on").

- **What is kept:** the names of held buttons, and the last value of each stick or trigger not at rest. Never a controller's name,
  serial, battery, or a history. Gone when released, paused or switched off.
- **PRIVACY.md** gets a "From v2.x, game controllers" paragraph under "What the app can see" (off by default; buttons, sticks and
  triggers of one controller; the same memory-only path), the flow diagram gains "controller", and, if gilrs stays as it is
  on Linux, one honest line: "On Linux the controller library opens the controller for writing too (it is made for rumble);
  the app never sends anything to it."
- **`tools/check-privacy.mjs` and `tools/privacy-patterns.mjs`**, each with a test in `tests/ui/privacy-patterns.test.mjs`:
  - `GAMEPAD_LIB = /\bgilrs(_core)?::/`, allowed only in `src-tauri/src/gamepad/mod.rs`.
  - The file-write rule covers `/gamepad/` (and `/mouse/`) as it covers `/keyboard/`.
  - No force feedback: `/\.with_force_feedback\s*\(\s*true|\bff::|set_ff_state|Effect(Builder)?\b/` fails anywhere, and
    `gamepad/mod.rs` must contain `with_force_feedback(false)` (the check fails if it doesn't).
  - The existing `LOG` rule already forbids installing a logger, which is what keeps gilrs's trace lines silent; its comment
    says so.
- The check only reads our code, never gilrs's. The review of gilrs's source at each version bump is the real safeguard
  (CLAUDE.md §8): its `Cargo.toml` features, any new thread, any new `open` flag.

## Tests

**Unit tests (every system, `cargo test`):**

1. `names.rs`: every gilrs `Button` maps to its name or is ignored; the Y flip; `C`, `Z`, `Unknown`, `LeftZ` are ignored.
2. `analog.rs` with a fake clock: 1,000 stick events in one second send at most 60 messages for that control; the last value is
   always sent; an unchanged rounded value sends nothing; the waiting time it returns is right; trigger press at 0.5, release
   below 0.4, no flicker at 0.45.
3. `Bus`: pause drops analog values and clears the kept ones; `set_gamepad(false)` releases held `Pad…` names; the resync sends
   `snap` and then the kept values.
4. `server.rs`: `analog_msg()` gives exactly the JSON of future-inputs.md §3 (`x`/`y` for sticks, `v` for triggers, 2 decimals).
5. Settings: the default is off; a wrong type cleans to off (one line in the hostile-input tests).
6. Overlay: the analog drawing is a small pure function in `ui/overlay/analog.js` (message → CSS variables), tested with
   `node --test tests/ui/overlay-analog.test.mjs`.

**Linux CI, the wayland job (`.github/workflows/linux-tests.yml`):** a virtual controller made with uinput, like today's virtual
keyboard. The helper lives in a `#[cfg(test)]` module of `gamepad/mod.rs`, so the privacy check's `uinput` and `VirtualDevice`
rules still pass (test modules are skipped), and it uses the `evdev` crate's `VirtualDevice` builder:

- Keys `BTN_SOUTH`, `BTN_EAST`, `BTN_NORTH`, `BTN_WEST`, `BTN_TL`, `BTN_TR`, `BTN_SELECT`, `BTN_START`, `BTN_MODE`, `BTN_THUMBL`,
  `BTN_THUMBR`; absolute axes `ABS_X`, `ABS_Y`, `ABS_RX`, `ABS_RY` (−32768…32767) and `ABS_Z`, `ABS_RZ` (0…255), `ABS_HAT0X/Y`
  (−1…1); vendor 045e, product 028e (an Xbox 360 pad, so gilrs's SDL mapping applies). udev's `input_id` marks it
  `ID_INPUT_JOYSTICK`, which is what gilrs looks for.
- `captures_a_virtual_controller` (`#[ignore]`, run by the workflow): start capture, press and release A, push the left stick fully
  right and up, pull RT to 80%, let go. Expect `PadA` down and up; `PadStickL` ending at `x: 1, y: -1`, then `0, 0`; `PadRT`
  `v: 0.8` with a `PadRT` down, then up; and, with events sent at 1 kHz, no more than 60 analog messages a second.
- `a_controller_plugged_in_later_is_seen`: the device is made after capture started (gilrs's udev hotplug; the runner has udevd).
- `stopping_closes_the_controller`: after `Handle::stop()`, `/proc/self/fd` has no link to the device and the thread count is back
  where it was. This is the test that shows gilrs's stop problem, so it is written first and must pass before step 3.
- Permissions: the test user joins the `input` group in that step (the runner has no logged-in seat, so `uaccess` doesn't apply).
- The installed-app step: the settings file turns `inputs.gamepad.enabled` on, a `type_for_the_app_test`-style helper presses A and
  moves a stick, and `tests/linux/overlay-check.mjs` gains a `pad` mode expecting `PadA` down/up and one `a` message.

**Windows:** an e2e suite `inputs` checks the switch, the error line and that turning it off ends the gamepad thread (the process's thread
count, read by the suite with PowerShell). Pressing a real controller button from a test needs a virtual controller driver (ViGEmBus),
a kernel driver on the runner: open question 6. Until then, a manual checklist in the PR (Xbox pad on USB and Bluetooth,
a game in front, on/off ten times, idle CPU in Task Manager).

**Benchmarks** (`tests/bench/run.mjs`, future-inputs.md §8.4): CPU and thread count with the setting off (must equal today), on
with no controller, on with an idle controller, and after 20 on/off switches.

## Docs to update

- [design/future-inputs.md](../design/future-inputs.md): status (controllers built), the trigger release value, "first
  controller" rule, the resync rule.
- [PROTOCOL.md](../PROTOCOL.md): `a` is sent; the resync after `snap`.
- [PRIVACY.md](../../PRIVACY.md): the paragraph above, the diagram, the check list in "How to check it yourself".
- [ARCHITECTURE.md](../ARCHITECTURE.md): `gamepad/` in the folder map, the travel diagram, threads.
- [CROSS-PLATFORM.md](../CROSS-PLATFORM.md) and [LINUX-PORT.md](../LINUX-PORT.md): `libudev-dev`, what works where, `uaccess`.
- [FILE-FORMATS.md](../FILE-FORMATS.md) and `docs/schemas/layout.schema.json`: `code` may be a controller name.
- [USER-GUIDE.md](../USER-GUIDE.md) and README.md: the switch, the Controller layout, which controllers work.
- [EXTENDING.md](../EXTENDING.md): where a new input source goes.
- `tests/README.md`: hooks, the `inputs` suite, the Linux job's new steps.
- CLAUDE.md §4 (the maintainer's call): the input folders.
- This proposal's status in [docs/proposals/README.md](README.md); once built, the proposal is deleted.

## Risks

- **Idle and stop rules** (the table above, and the step 1 numbers). Nothing ships while one is broken.
- **A dependency next to the keyboard hook.** gilrs runs in our process with 3 to 6 new crates; a bad release could do anything
  our process can. Pinned version, `Cargo.lock` review, and a source read at each bump.
- **Upstream timing.** If the fixes take months, either a pinned fork (supply chain and upkeep) or our own code.
- **Windows sees only Xbox-type pads** with XInput. PlayStation and Switch players need Steam Input or similar; the note says so.
- **Linux write access** (O_RDWR, the `EVIOCSFF` upload). Honest wording, or an upstream "input only" option.
- **gilrs's Flatpak fallback** (`/.flatpak-info` or `GILRS_DISABLE_UDEV`) opens every `/dev/input/event*` it can for writing,
  keyboards included, to look at them. We ship .deb and AppImage, not Flatpak; the risk is someone setting the variable.
- **Noisy controllers** on macOS (motion sensors over HID) could wake the thread non-stop while the controller lies still.
- **WebSocket load:** bounded by the rate limit; the overlay-speed e2e suite runs with a stick moving.

## Work order

Each step is one small commit (Conventional Commits, `npm test` and the checks between steps); stop and report on any failure.

1. **Spike behind a cargo feature** `gamepad` (off by default, so the shipped app doesn't change): `gilrs` as an optional
   dependency with `default-features = false, features = ["xinput"]`, a throwaway Debug-only switch, the names table, and the
   measurements: idle CPU, thread count over 20 on/off cycles, a game in front on Windows, Linux uaccess, macOS Input
   Monitoring. **The maintainer reviews the numbers and approves (or not) the dependency** before step 2. Built on a
   branch, measured on Windows and Linux without a controller (see "Step 1: the spike"); the controller checks are open.
2. Upstream merge requests to gilrs (stop signal for XInput and macOS, a waker, input-only open on Linux), or the decision to
   write our own per system.
3. `gamepad/names.rs` and `gamepad/analog.rs` with their unit tests (plain logic, no gilrs).
4. Settings: `inputs.gamepad.enabled` default and sanitizer line, with tests.
5. `Bus` second source slot, `forward_analog`, the command; `server.rs` analog arm and resync (second look: server.rs).
6. The privacy check rules and their tests; PRIVACY.md (second look: check-privacy.mjs, PRIVACY.md).
7. Overlay: `a` messages, the stick and trigger drawing, `analog.js` tests; the Controller layout file.
8. Settings window card, hooks, `tests/README.md`; visual baselines for the General tab (`npm run test:visual -- --update`,
   before and after shown in the pull request).
9. Linux CI virtual-controller tests; Windows e2e `inputs` suite; benchmarks.
10. Docs (the list above) and this plan's status.

## Effort

About **6 to 9 working sessions** (a rough estimate) with gilrs once its stop problems are solved (spike 1–2, Rust 2, overlay 1, UI 1, tests and
CI 1–2, docs 1). Writing our own instead adds about 2 days for Windows and Linux and 2 to 3 for macOS, minus the upstream
work.

## Open questions

1. After the spike's numbers: is gilrs approved as a dependency (3 to 6 new crates, `libudev` on Linux, zlib-licensed data)?
2. If upstream fixes are slow: a pinned, reviewed fork, or our own code?
3. Is one wake a second while the setting is on acceptable as a temporary exception, or must the wait be fully event-driven?
4. Windows: Xbox-type controllers only (XInput) for the first version?
5. CLAUDE.md §4: may it name `gamepad/` and `mouse/` as homes for system code, as future-inputs.md §1.4 already allows?
6. Windows e2e: install the ViGEmBus driver on the CI runner to press virtual controller buttons, or keep it manual?
7. Trigger release at 0.4 (press at 0.5): fine to record in future-inputs.md?
8. Should `PadLS` / `PadRS` light the stick itself instead of being separate keys on the Controller layout?
