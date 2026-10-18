# Linux port

Status: **in progress.** Keyboard capture works on **X11 desktops** (from v1.4, not released yet) and, on v2.0, on
**Wayland desktops** by reading the keyboard devices (built, unit-tested, and passing in CI on a virtual Wayland desktop since 2026-10-18).
Every release builds an **AppImage and a .deb** ([RELEASING.md](RELEASING.md), Linux download); in-app updates on Linux
are prepared but off. This page is the state and the plan, so anyone on Linux can pick up the next step. For working on the
code from Linux today, see [CROSS-PLATFORM.md](CROSS-PLATFORM.md).

## What already works on Linux

| Part | Status |
|---|---|
| Overlay page, settings window, layouts, themes, animations | works (same HTML/CSS/JS; the window uses WebKitGTK) |
| Local server and WebSocket | works (same code) |
| Settings, presets, migrations | works (data folder: `~/.local/share/com.keyoverlay.app`) |
| Tray icon | works where the desktop shows tray icons (GNOME needs the "AppIndicator" extension) |
| **Keyboard capture, X11** | **works**: the Standard method (`keyboard/x11.rs`) |
| Keyboard capture, Wayland | built on v2.0: the Standard method reads the keyboard devices (`keyboard/linux_devices.rs`), which needs the `input` group; the settings window explains it |
| Key labels that follow the keyboard layout, live | works on X11 (`keyboard/x11_labels.rs`, XKB): tested against Xvfb by changing the key map (also in CI); switching between two layout groups not yet seen, because Xvfb does not switch groups for typed keys. On Wayland the labels come from XWayland when it runs, otherwise the layout's own labels |
| Linux words in the settings window ("Start at login", Super) and Debug-tab memory | works (`ui/settings/system-words.js`, `platform::process_stats`) |
| Downloads, updates | an AppImage and a .deb on every release (`.github/workflows/linux-app.yml`); no in-app updates yet |
| Memory given back after the settings window closes | works (`platform::trim_memory`, glibc's `malloc_trim`) |

## How keys are read

Linux has two kinds of desktop, and they treat global key listening very differently.

### X11 (done): XInput2 raw key events

- `keyboard/x11.rs` connects to the X server, asks for **XInput 2.1** and listens for **raw key press and release events on
  the root window from all master devices**. That gives one event per key press, whichever app has focus, including games.
  It never grabs keys, so other apps see every key exactly as before. No permission is needed.
- The stop signal is a message to a 1×1 invisible window the capture thread owns, which wakes it from waiting.
- Key names: X11 key codes are the kernel's **evdev codes + 8**. `keyboard/linux_keys.rs` maps evdev codes to the same
  names as Windows (`KeyW`, `Space`, …); a test checks every Linux name exists in the Windows table. `KeyFilter` drops key
  repeat and stray releases, like `KeyTracker` does on Windows.
- In settings, **Standard** means X11 on Linux. **Compatibility** reports "only the Standard method is available on Linux so
  far".
- On a **Wayland** desktop this method only sees keys typed into X11 (XWayland) apps, so it is not enough there.

### Wayland (built on v2.0): reading the keyboard devices (evdev)

Wayland deliberately stops apps from seeing other apps' keys, and there is no portal for "all keys" (the GlobalShortcuts
portal only covers shortcuts an app registers). The one way that works on every Wayland desktop is reading the keyboard
devices directly, which `keyboard/linux_devices.rs` does with the `evdev` crate (approved by Jordan):

- On a Wayland desktop (`WAYLAND_DISPLAY` set, or `XDG_SESSION_TYPE=wayland`) the Standard method is this one, shown as
  "Standard (keyboard devices)"; on X11 it stays XInput2.
- It opens the devices in `/dev/input/event*` that have letter keys and Space, **read-only** (the app opens the file
  itself: evdev's own `open` asks for writing too) and **never grabs** them, so every app still gets every key.
- One thread waits on all keyboards with `poll()`, so there is no CPU use at idle. Values: 1 = press, 0 = release, 2 =
  repeat (ignored). The codes are the same evdev codes, so `linux_keys.rs` (`code_name`, `KeyFilter`) is reused as is.
- **Permission:** the files belong to the `input` group. Until the person is in it, nothing opens, the error says so, and
  the notice under the header (`ui/settings/access-notice.js`) gives `sudo usermod -aG input $USER` with a Copy button,
  says to log out and back in, and warns that every program can then read the keyboards (PRIVACY.md). The Debug self-test
  and the bug report say whether the keyboards can be read.
- `npm run check:privacy` fails on a grab, a virtual device, sent input events, evdev's own `open`, or evdev used outside
  `linux_devices.rs`.
- Not done yet: keyboards plugged in after capture started are only found after switching the method or restarting.

### Linux packaging and release

**Stage A (built, October 2026):** `.github/workflows/linux-app.yml` builds `Keystroke-Overlay_<version>_linux-x86_64.AppImage`
and `_linux-amd64.deb` on Ubuntu 22.04 with no secrets; `release.yml` attaches them after the Windows release
(`linux-publish`), and `ci.yml` builds them on every change. The steps and what to know are in
[RELEASING.md](RELEASING.md), Linux download. Built locally: both bundles, and the AppImage starts.

**In-app updates on Linux (prepared, off, Jordan to switch on):** Tauri's updater can update the AppImage (not the .deb),
with the same update key. To switch it on: sign the AppImage in `linux-app.yml` (remove `createUpdaterArtifacts: false`
and pass the signing key like the Windows job), and add a `linux-x86_64` entry to `latest.json` and `stable.json` in
`tools/release.mjs`. That changes what every installed copy sees, so it waits for Jordan.

**Stage B, Wayland:** the capture above.

### Automated Linux tests

`.github/workflows/linux-tests.yml`, called by `ci.yml` after the build, installs the .deb on two virtual desktops:
- **X11** (Xvfb, xdotool): keys reach the overlay's key stream; key labels follow a layout change (US to French);
  a two-group switch (`us,fr`, Alt+Shift) is tried as information only.
- **Wayland** (headless Weston, a uinput virtual keyboard): a test user outside the input group gets the input-group
  error; added to the group, every press and release is captured; then the installed app delivers them to the key stream.
- Both start the AppImage once.

It runs in CI on every push and passed in full on 2026-10-18 (both jobs). What it can't cover: a real
GNOME or KDE tray, games (Steam through XWayland is untested), and OBS on Linux.

## Testing on Linux

```bash
npm test                                         # unit tests, including the Linux key table and filter
xvfb-run -a cargo test --manifest-path src-tauri/Cargo.toml -- --ignored    # X11 capture starts and stops
```

Manual end-to-end check on an X11 desktop (or under `xvfb-run`): run `npm run dev`, open the overlay link in a browser, and
press keys in another window; or with `xdotool key w` while a WebSocket client is connected to `ws://127.0.0.1:7878/ws`,
which should receive `{"t":"d","k":"KeyW"}` then `{"t":"u","k":"KeyW"}`. `node tests/linux/overlay-check.mjs keys -- xdotool key w a s d`
does that check for you while the app runs. On Wayland, add yourself to the `input` group first, then type in any window.
