# Proposal: analog key pressure with the Wooting Analog SDK

Status: **Open research** (Jordan, 2026-10-20: niche; kept as research that eases a future build, or a path for others to try)

How the overlay could show how far each key is pressed on Hall-effect ("analog") keyboards, using the Wooting Analog SDK
that the user installs, without breaking the idle-CPU and privacy promises.

## Goal

- On an analog keyboard, each key on the overlay fills up as it is pressed down, from 0 (at rest) to 1 (fully down), live.
- Works with Wooting boards, and with other Hall-effect boards through the SDK's plugins (Razer, NuPhy, DrunkDeer,
  Keychron HE and others through the universal-analog-plugin).
- **Off by default.** With it off, the app loads nothing new, starts no thread and behaves exactly as today.
- Costs nothing while no supported board is plugged in, and nothing while no OBS overlay is connected.

## Non-goals

- **The app does not ship, install or update the SDK.** The user installs it (Wootility does it on Windows).
- No analog *output* (no gamepad emulation, no actuation-point settings): the app only reads.
- No change to how key down and up are detected: the keyboard capture in `keyboard/` stays the source of `d` and `u`.
  Analog values are an extra layer on top.
- No per-key curves, deadzones or calibration in the first version.
- No support for boards that only work through their maker's own app, unless an SDK plugin covers them.

## How it works

### The SDK, as of 2026-10

[WootingKb/wooting-analog-sdk](https://github.com/WootingKb/wooting-analog-sdk) (MPL-2.0; latest release v0.9.1 of
2026-03-25, `main` is 0.10.0-rc.1). Read from its code and docs at that commit:

| Piece | What it is |
|---|---|
| System SDK | `wooting_analog_sdk.dll` in `C:\Program Files\wooting-analog-sdk\` (installed and kept up to date by **Wootility** from v3.4, or by the `.msi`); `/usr/lib/libwooting_analog_sdk.so` on Linux (`.deb`); `/usr/local/lib/libwooting_analog_sdk.dylib` on macOS (manual copy; the Homebrew package is marked outdated) |
| `wooting_analog_sdk_dist` | A library apps are meant to ship. It loads the system SDK when one is installed and compatible, otherwise runs its own copy |
| Plugins | Native libraries in subfolders of `C:\Program Files\WootingAnalogPlugins\` (Windows) or `/usr/local/share/WootingAnalogPlugins/` (Linux, macOS). The SDK loads every plugin it finds there. From 0.10 the Wooting plugin is built into the SDK |
| [universal-analog-plugin](https://github.com/AnalogSense/universal-analog-plugin) | An MIT plugin for other makers' boards (Razer Huntsman analog models with Synapse running, NuPhy, DrunkDeer, Keychron and Lemokey HE, Madlions). Its README notes that some boards' stock firmware only supports polling |
| Rust crate | 0.10 is written as a Rust library (`AnalogSdk::new()…`), but no `wooting-analog-sdk` crate is on crates.io yet; 0.9.1's docs say "The updated Rust crate is coming soon!". The old `wooting-analog-wrapper` is gone since 0.9 |

The C API the app would use (from `includes/wooting-analog-sdk.h` and `src/ffi.rs`):

| Function | Use |
|---|---|
| `wooting_analog_version()` | The major version; refuse to go on if it isn't the one the app was written for |
| `wooting_analog_initialise()` | Start the SDK and its plugins; returns the number of boards found, or a negative error (`NoPlugins` and others) |
| `wooting_analog_read_full_buffer(codes, values, len)` | Fills two arrays with every key that is pressed (and once with 0.0 just after a key is released); returns how many |
| `wooting_analog_set_device_event_cb(cb)` / `wooting_analog_clear_device_event_cb()` | A callback, on the SDK's own thread, when a board is connected or disconnected |
| `wooting_analog_uninitialise()` | Stop the SDK and unload the plugins |

Keys come as USB HID usage codes by default (the "HID" key code mode), which name the physical key, the same idea as the
DOM `KeyboardEvent.code` names the overlay uses.

**There is no "value changed" event.** Reading values is polling only. And while the SDK is started, it runs its own
threads: the Wooting plugin wakes every 10 ms and looks for new boards every 500 ms, each board has a reader thread that
waits on HID reports (up to 50 ms at a time), and the universal plugin has the same kind of loop (every 10 ms, a device
search every second). So "started" is never idle. The design below starts the SDK only when it is needed and stops it
otherwise.

### Which way to load it

| | Load the system SDK ourselves (recommended) | Ship `wooting_analog_sdk_dist` | Use the Rust crate |
|---|---|---|---|
| What ships with the app | Nothing | A native library (MPL-2.0) per system, in the installer | The SDK compiled in, with `hidapi`, `libloading`, `env_logger` and more |
| Works without the user installing the SDK | No (says how to install it) | Yes for Wooting boards | Yes for Wooting boards |
| New dependency | `libloading` (or the `windows` crate's `LoadLibraryExW`, already in the build, for Windows only) | The library, plus a loader | Several crates, one with C code |
| Third-party code in the app's process | Only if the user installed it | Always, when the feature is on | Always |
| Available today | Yes (v0.9.1) | Yes | Not published |

Recommended: **load the system SDK at run time, from its fixed install path only**, and only while the feature is on.
Nothing new ships, the license question is the SDK's own (we don't copy or change MPL-2.0 code, we call its C interface),
and a user who never turns the feature on never has Wooting code in the process. Never search `PATH` or the current folder
for the library (the dist library does that as a fallback; we don't), so another program can't plant a fake one.

### When the SDK runs

The analog source runs only while **all** of these are true. Each change is an event, so nothing polls to find out:

1. `inputs.analog.enabled` is on (the settings window says so).
2. An OBS overlay or the live preview is connected (the same counter that `bus.watch_guard()` already keeps for the
   keyboard-hook watch).
3. The overlay is not paused (pausing already drops all key events; it stops the analog source too).
4. A supported board is present.

Point 4 is the hard one, because finding boards is what the SDK does. The plan:

- When 1 to 3 become true, start the SDK once. If it finds no board, stop it straight away, so its 10 ms threads end.
- Then wait for the system to say "a device was plugged in", and only then try again. On Windows that is a device-change
  notification for HID devices on a hidden message-only window (no polling; the Compatibility method already uses such a
  window, and the code goes behind the seam in `platform.rs`). On Linux and macOS (udev and IOKit notifications) the first
  version has no notification: it tries once when 1 to 3 become true, and the settings window has **Look again**.
- While the SDK is running, its disconnect callback tells the app when the last board is gone; the app then stops the SDK
  and goes back to waiting.

**Reading the values.** While the SDK runs, one thread of ours calls `wooting_analog_read_full_buffer` 60 times a second
(`ANALOG_READS_PER_SECOND = 60`, the "about 60 per second per control" limit in
[future-inputs.md section 3](../../design/future-inputs.md)). It rounds each value to 2 decimals, compares with the last
value it sent for that key, and sends only the changes. A key that comes back at 0.0 is sent once as 0 and then forgotten.
When nothing changes, nothing is sent; the thread itself still wakes 60 times a second while the four conditions hold. That
is the price of a polling-only SDK, and the reason the conditions are strict. The benchmark measures it (budget below).

### Names

A table maps HID usage codes to the DOM `code` names the overlay already uses (`0x1A` → `KeyW`, `0xE1` → `ShiftLeft`,
`0x2C` → `Space`), in its own file next to `keyboard/keymap.rs`, with unit tests that every name in it is a name
`keymap.rs` also produces. Codes with no entry (maker-specific keys such as Fn, which plugins number from `0x200`) are
dropped. The W3C UI Events `code` specification lists the USB HID usage for each code, so the table can be checked
against it.

### Protocol

Follow the analog rules reserved in [future-inputs.md section 3](../../design/future-inputs.md) and
[PROTOCOL.md](../../PROTOCOL.md):

```json
{"t":"a","k":"KeyW","v":0.42}
```

- `k` is the same key name as in `d` and `u`; `v` from 0 to 1. Sent only on change, rounded to 2 decimals, at most about
  60 per second per key, never when idle, never while paused.
- **No `d` or `u` from analog values.** future-inputs.md says a trigger past 0.5 also sends `d` / `u`; for keyboard keys the
  keyboard capture already sends them at the board's real actuation point, so analog must not send a second set.
- `snap` gains an optional field `"analog": {"KeyW": 0.42}` with the keys not at rest, only while the analog source runs,
  so a freshly connected overlay doesn't show a half-pressed key as empty. Old overlays ignore it.
- Additive, so the protocol stays "1". Older overlays ignore `t: "a"`.

The values live in memory only, in the same place as the held keys, and are cleared on pause, when the source stops, and
when the overlay disconnects. They never reach the event log (only "analog board found" or "analog SDK not installed",
never a key or a value).

### Overlay drawing

Only `transform` and `opacity` move, as the overlay's rule says.

- `overlay.js` builds one more element per key only while analog is on: `.press`, inside a clip box with the key's
  `border-radius` and `overflow: hidden` (the clip never moves).
- On each `a` message, `overlay.js` sets one CSS variable on that key: `el.style.setProperty('--press', v)`.
- `overlay.css`:
  - **Fill** (the default look): `.press { transform: translateY(calc((1 - var(--press, 0)) * 100%)); }` with the theme's
    pressed fill color. A slide, not a `scaleY`, so the rounded corners keep their shape.
  - **Fade**: `.press { opacity: var(--press, 0); }`.
  - A very short `transition` (one frame, 16 ms, linear), because the values already arrive at up to 60 a second.
- The existing `.down` class still switches the face at actuation, so every theme and animation works as before; the fill
  sits under the label.
- The settings window's live preview gets the same messages, so the user sees it there too. The Keys tab's editor is not
  changed.

### Settings

Under the reserved `inputs` section ([future-inputs.md section 5](../../design/future-inputs.md)):

```json
"inputs": { "analog": { "enabled": false, "look": "fill" } }
```

- Additive, so no migration; a default in `settings.rs`, `look` as a choice (`fill` | `fade`) in `sanitize.rs`, a line in
  `CONTROLS` for the look, used in `overlay.js`, the sandbox copy (the steps in [EXTENDING.md](../../EXTENDING.md)).
- **Settings window:** a card **Analog keys** (General, or Style → Text if Jordan prefers it with the looks): the switch, the
  look, and a status line: "Not installed: install Wootility or the Wooting Analog SDK" (with the SDK's install page),
  "No analog keyboard found" with **Look again**, or "Found: Wooting 60HE". The board's name is the only device fact
  shown; it is never saved or sent to the overlay.

### Systems

| System | First version | Notes |
|---|---|---|
| Windows | Yes | Wootility installs the SDK and keeps it updated; plugins in `C:\Program Files\WootingAnalogPlugins\` (writing there needs administrator rights, which also protects it). Device notifications for "Look again" without polling |
| Linux | Yes, without plug-in notifications | The `.deb` installs the SDK; reading the boards needs the maker's udev rule (Wooting documents one); **Look again** instead of a notification |
| macOS | Later | The SDK is a manual copy into `/usr/local/lib`, the docs mention Gatekeeper warnings, only an `x86_64-apple-darwin` download is named (Apple silicon to check), and a signed app with the hardened runtime can't load another team's library without an entitlement. "Not available on this system yet" until checked |

Code goes behind the seam ([CROSS-PLATFORM.md](../../CROSS-PLATFORM.md)): the loader and device notifications in
`keyboard/analog.rs` and `platform.rs`, a fallback that says "not available on this system yet" elsewhere.

## Files to change

| File | Change |
|---|---|
| `src-tauri/src/keyboard/analog.rs` (new) | The source: load the library from the fixed path, check the version, start and stop the SDK, the 60-a-second reader, the change filter. `start(tx) -> Handle` and `Handle::stop()` like the other sources ([future-inputs.md section 4](../../design/future-inputs.md)) |
| `src-tauri/src/keyboard/analog_source.rs` (new) | The `AnalogSource` trait (`read(&mut Vec<(u16, f32)>)`, `boards()`), the real SDK behind it, and a `FakeAnalogSource` for tests |
| `src-tauri/src/keyboard/hid_keys.rs` (new) | HID usage → DOM `code` names, with tests |
| `src-tauri/src/keyboard/mod.rs` | `Bus` gets an `analog_tx` channel and the current values; pause clears them; the source starts and stops with the watch counter |
| `src-tauri/src/platform.rs` | Windows device-change notification for HID devices; a no-op elsewhere |
| `src-tauri/src/server.rs` | `client()` forwards `a` messages; `snapshot()` adds `analog` |
| `src-tauri/src/settings.rs`, `sanitize.rs`, `tools/sandbox/default-settings.json` | `inputs.analog` |
| `src-tauri/src/debug.rs` | A Debug-mode test switch that feeds the fake source (for the e2e and screenshots) |
| `ui/overlay/overlay.js`, `overlay.css` | The `.press` element, `--press`, the two looks |
| `ui/settings/` (the card, `CONTROLS`, `TEXT`, `system-words.js` if a word differs per system) | The card and status |
| `tools/check-privacy.mjs`, `privacy-patterns.mjs` | The new rules below |
| `src-tauri/Cargo.toml` | `libloading`, if approved |

## Privacy

Key pressure is key data, so it is held to the same rules as key presses
([decision 0005](../../decisions/0005-keystrokes-live-in-memory-only.md)): only which key and how far, only in memory,
only to the local overlay, never logged, never stored, nothing while paused.

What is new, and needs a **decision record** (the next free number) plus a PRIVACY.md section:

- **The app loads native code it didn't build:** the user's SDK and every plugin in the plugins folder run inside the
  app's process, next to the keyboard capture, while the feature is on. PRIVACY.md says so plainly, names the folder, and
  says that turning the feature off unloads it.
- What the SDK does is outside the app's control, like the web view or OBS ("Things outside this app's control"). As read
  at 0.10.0-rc.1: the SDK library itself has no network code (its separate updater program does, and the app never runs
  it); it logs through `env_logger`, off unless the `RUST_LOG` environment variable is set, and its log lines checked
  name plugins and errors, not keys. That is a reading of one version, not a promise.
- The only device fact the app keeps is the board's name for the settings window, in memory.

New rules in `tools/check-privacy.mjs` (with tests), so later changes keep it this way:

- Loading a library (`libloading`, `LoadLibrary`, `dlopen`) only in `keyboard/analog.rs`.
- The library path is a constant from a fixed list (no `PATH`, no `env::var`, no path from settings).
- The analog code writes no files and logs nothing, like the rest of `keyboard/`.

## Tests

No hardware is needed for any automatic test.

- **Rust unit tests:** the HID table (every entry is a known overlay name; no duplicates); the change filter with
  `FakeAnalogSource` (rounding to 2 decimals, only changes sent, a release sent once as 0, at most 60 a second per key,
  nothing while paused); the start and stop rules (feature off → the library is never loaded; no overlay → stopped; no board
  → stopped after one look; a disconnect callback → stopped); a version mismatch refuses cleanly; the settings default and
  sanitizer (`look` falls back to `fill`).
- **UI unit test** (`tests/ui/`): the overlay's handling of `a` (sets `--press`, ignores unknown keys, resets on pause and on
  `snap`).
- **E2E** (a new suite, or a part of `smoke`): with the Debug test switch feeding the fake source, the overlay WebSocket gets
  the `a` messages, the live preview's key gets `--press`, pause stops them, and with the feature off there are none and no
  new thread (thread count compared with the feature off).
- **Screenshots:** one overlay picture with W at 0.5 in the Fill look (the overlay pictures need Jordan's OK).
- **Benchmark** (`tests/bench/run.mjs`): with the feature off, nothing changes (threads, memory, idle CPU). Measured on a PC
  with a Wooting board: CPU with the feature on, a board present and hands off the keyboard (budget: under 0.5% of one core,
  to be confirmed by measuring), and back to 0.0% when OBS closes.
- **Manual:** a Wooting board on Windows; the SDK's debug `wooting-analog-virtual-control` (debug builds of the SDK only)
  for a run without a board; one other board through the universal plugin if one is at hand.

## Docs to update

- The decision record and its line in `docs/decisions/README.md`.
- [future-inputs.md](../../design/future-inputs.md): add "Analog keyboard keys" to the names table (same names as the
  keyboard) and `inputs.analog` to section 5; say that analog keys send no `d` / `u`; update the status line.
- [PROTOCOL.md](../../PROTOCOL.md): `t: "a"` for keys, the `analog` field in `snap`.
- [PRIVACY.md](../../../PRIVACY.md): the analog section above.
- [USER-GUIDE.md](../../USER-GUIDE.md): "Analog keyboards": install Wootility (or the SDK), add plugins for other boards,
  turn it on, the looks, Linux's udev rule.
- [ARCHITECTURE.md](../../ARCHITECTURE.md) (the new files), [FILE-FORMATS.md](../../FILE-FORMATS.md) (the setting),
  [CROSS-PLATFORM.md](../../CROSS-PLATFORM.md) (macOS later), the README feature list.

## Risks

- **CPU while it runs.** The SDK's own threads and our reader wake often. Mitigated by the four conditions; measured before
  and after; if the budget can't be met the feature waits.
- **The SDK changes.** It is pre-1.0 and changed shape at 0.9; the version check refuses an unknown major version, and the
  status line says "This version of the Wooting Analog SDK isn't supported yet".
- **A misbehaving plugin crashes or slows the app**, taking the keyboard overlay with it. The release builds abort on panic
  (`panic = "abort"`), and a crash in a C plugin can't be caught at all. Mitigation: the feature is off by default, the
  status line names the problem after a crash (the crash note says where), and the guide says how to remove a plugin.
- **Boards that report only when polled** (universal plugin's note) may look laggy; that is the board's firmware.
- **Two readers of one key:** the overlay must not get stuck half-filled; `snap`, pause and disconnect all clear the values.

## Work order

Each step its own commit, all checks between steps, stop on any failure.

1. Decision record, the future-inputs.md and PROTOCOL.md changes, for Jordan's review. Ask about `libloading`.
2. `hid_keys.rs` and the `AnalogSource` trait with `FakeAnalogSource`, the change filter, unit tests.
3. The overlay side: `a` messages, `--press`, both looks, the UI unit test, the preview (driven by the fake source).
4. The setting (off), the settings card with its status, the Debug test switch, the e2e checks.
5. The Windows loader (fixed path, version check, start and stop rules, device notifications), the privacy-check rules.
6. Measure on Windows with and without a board; record the numbers in the pull request.
7. Linux (with **Look again**), then docs: PRIVACY.md, USER-GUIDE.md, ARCHITECTURE.md, FILE-FORMATS.md, README.
8. macOS only after the signing and Apple-silicon questions are answered.

## Effort

About 6 to 10 days for Windows and Linux: 1 for names and the fake source, 2 for the overlay and settings, 2 to 3 for the
loader and the start and stop rules, 1 to 2 for tests and measuring, 1 for docs. macOS is extra and depends on signing.

## Open questions for Jordan

1. Is loading a user-installed native library (and its plugins) into the app acceptable at all, given it sits next to
   the keyboard capture? It needs your decision record either way.
2. May the app add `libloading` (ISC license) for loading on every system, or should the first version be Windows-only
   with the `windows` crate's `LoadLibraryExW`, which is already in the build?
3. Is "SDK runs while an overlay is connected and a board is present" a fair reading of "about 0% CPU at idle", given
   the SDK can't be used without its own polling threads? Or should it also stop after a minute with no key moving, and
   start again on the next digital key press?
4. Where does the card go: General, or Style next to the looks?
5. Should the overlay show pressure on top of the existing animation (the proposal) or replace the press animation while
   analog is on?
6. Which version, and is a Wooting board available for the manual test?
