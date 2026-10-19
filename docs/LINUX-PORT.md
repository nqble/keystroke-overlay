# Linux port

Status: **in progress.** Keyboard capture on **X11 desktops works** and is tested, in v1.4.0 for developers
who build the app (there is no Linux release yet). Wayland capture, Linux packaging and a
Linux release are not built yet. This page is the plan, so anyone on Linux can pick up the next step. For working on the
code from Linux today, see [CROSS-PLATFORM.md](CROSS-PLATFORM.md).

## What already works on Linux

| Part | Status |
|---|---|
| Overlay page, settings window, layouts, themes, animations | works (same HTML/CSS/JS; the window uses WebKitGTK) |
| Local server and WebSocket | works (same code) |
| Settings, presets, migrations | works (data folder: `~/.local/share/com.keyoverlay.app`) |
| Tray icon | works where the desktop shows tray icons (GNOME needs the "AppIndicator" extension) |
| **Keyboard capture, X11** | **works**: the Standard method (`keyboard/x11.rs`) |
| Keyboard capture, Wayland | not yet (see step 2) |
| Installer, updates, start with Windows (login) | not yet (see step 3) |

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

### Wayland (next): reading the keyboard devices (evdev)

Wayland deliberately stops apps from seeing other apps' keys, and there is no portal for "all keys" (the GlobalShortcuts
portal only covers shortcuts an app registers). The one way that works on every Wayland desktop is reading the keyboard
devices directly:

- Open the keyboards in `/dev/input/event*` (the ones that report `EV_KEY` with letter keys), read-only, **without grabbing**
  them (so input is never taken away from other apps), and watch for new keyboards being plugged in.
- Event values: 1 = press, 0 = release, 2 = repeat (ignore). The codes are the same evdev codes, so `linux_keys.rs`
  (`code_name`, `KeyFilter`) is reused as is.
- **Permission:** these files belong to the `input` group. The user must be added once
  (`sudo usermod -aG input $USER`, then log out and in). Being in that group lets **any** program the user runs read all
  input, so the app must explain this plainly, never do it silently, and PRIVACY.md must say so.
- Suggested design: a new method, shown as **Standard** on Wayland, chosen automatically when `WAYLAND_DISPLAY` is set; a
  settings-window notice with the one-line command and a "Check again" button when the devices can't be opened.
- Crate options: `evdev` (pure Rust). Ask Jordan before adding it (CLAUDE.md §7). Test logic with recorded event streams;
  the real-device test needs a Linux PC (containers usually have no `/dev/input`).

### Linux packaging and release (after Wayland)

- Tauri builds an **AppImage** (works everywhere, and the updater supports it) and a **.deb**. Add Linux targets to
  `tools/release.mjs` and the release workflow, signed like the Windows installer, with `linux-x86_64` entries in
  `stable.json` / `latest.json`.
- "Start with Windows" becomes "Start at login" (the autostart plugin writes an XDG autostart file).
- `platform.rs`: `trim_memory` and `process_stats` have Linux versions to write (`malloc_trim`, `/proc/self/status`).
- The e2e tests drive Windows with PowerShell. A Linux runner could use `xdotool` for key presses (as the manual test
  below does); that is a separate, optional piece of work.

## Testing on Linux

```bash
npm test                                         # unit tests, including the Linux key table and filter
xvfb-run -a cargo test --manifest-path src-tauri/Cargo.toml -- --ignored    # X11 capture starts and stops
```

Manual end-to-end check on an X11 desktop (or under `xvfb-run`): run `npm run dev`, open the OBS URL in a browser, and
press keys in another window; or with `xdotool key w` while a WebSocket client is connected to `ws://127.0.0.1:7878/ws`,
which should receive `{"t":"d","k":"KeyW"}` then `{"t":"u","k":"KeyW"}`. CI runs the unit tests and the X11 start/stop test
on Ubuntu for every push.
