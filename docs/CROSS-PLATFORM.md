# Working on Linux and macOS

Keystroke Overlay is made first for Windows and also ships for macOS (Linux builds too), and you don't need Windows to work on most of it. Everything builds, runs and is
tested on Linux and macOS too. Keyboard capture also works on **Linux X11 desktops** (from
v1.4); macOS capture works on v2.0 (it needs the Input Monitoring permission; tested on one Apple Silicon Mac). Wayland capture is
built on v2.0 (it needs the `input` group; [LINUX-PORT.md](LINUX-PORT.md), [MAC-PORT.md](MAC-PORT.md)). CI checks this on every pull request and every push to `main` and the work branches (the `other-systems` job in
`.github/workflows/ci.yml`), so it stays that way.

## What works where

| Work | Windows | Linux / macOS |
|---|---|---|
| Themes, layouts, animations, with `npm run preview` | yes | yes |
| UI unit tests (`npm run test:ui`) | yes | yes |
| Rust lints and unit tests (`cargo clippy`, `cargo test`) | yes | yes |
| Privacy and formatting checks | yes | yes |
| Running the app: tray, settings window, local server, overlay in OBS | yes | yes |
| Keyboard capture | yes | Linux X11: yes (from v1.4). macOS: yes (v2.0; needs Input Monitoring). Linux Wayland: yes (v2.0; needs the `input` group) |
| End-to-end tests (`npm run test:e2e`), install test, benchmark | yes | no (they drive Windows with PowerShell) |
| Building the installer, releasing (`npm run build`, `npm run release`, `npm run devbuild`) | yes | no (the Linux and Mac downloads are built on GitHub) |

Where capture can't start (for example Wayland without the `input` group), the app still starts normally. The settings window shows
why keys aren't captured where it would show a capture problem on Windows. The overlay, settings, layouts and every other tab work,
so you can try visual changes in the real app.

## Set up on Linux

You need [Rust](https://rustup.rs) (stable), [Node.js](https://nodejs.org) 20+, and the libraries Tauri uses for the
window and the tray. On Debian or Ubuntu:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev build-essential pkg-config
git clone https://github.com/nqble/keystroke-overlay.git
cd keystroke-overlay
npm install
npm run dev          # the app (keys are captured on X11, and on Wayland once you are in the input group)
npm test             # Rust tests, UI tests, the privacy check and the every-system check
```

Other distributions: see Tauri's [prerequisites](https://v2.tauri.app/start/prerequisites/) for the same libraries.

## Set up on macOS

Install the Xcode Command Line Tools (`xcode-select --install`), [Rust](https://rustup.rs) and
[Node.js](https://nodejs.org) 20+, then the same `git clone`, `npm install`, `npm run dev` and `npm test` as above. If the build stops with a "malformed file" linker error, see "On a Mac" in [USER-GUIDE.md](USER-GUIDE.md).

## How the code is split

- **Windows-only code** lives in `src-tauri/src/keyboard/hook.rs`, `src-tauri/src/keyboard/rawinput.rs`,
  `src-tauri/src/keyboard/windows_labels.rs` (key labels for the layout in front), the `#[cfg(windows)]` part of
  `keyboard/tracker.rs` and the `#[cfg(windows)]` functions in `src-tauri/src/platform.rs`. The `windows` and `webview2-com`
  crates are only dependencies on Windows (`[target.'cfg(windows)'.dependencies]` in `src-tauri/Cargo.toml`;
  `webview2-com` switches off the settings window's browser shortcuts, `platform::lock_browser_features`).
- **Everything else is shared**, including the key naming table (`keyboard/keymap.rs`) and the repeat and stuck-key
  logic (`keyboard/tracker.rs`), so their tests run on every system.
- **Linux-only code:** `keyboard/x11.rs` (X11 capture), `keyboard/linux_devices.rs` (Wayland capture from the keyboard
  devices), `keyboard/x11_labels.rs` (key labels from XKB, and the layout watcher) and the `#[cfg(target_os = "linux")]`
  functions in `platform.rs`, with the `x11rb` crate (features `xinput` and `xkb`) and the `evdev` crate as Linux-only
  dependencies. The Linux key
  names and repeat filter (`keyboard/linux_keys.rs`) are plain logic, built and tested everywhere.
- **macOS-only code:** the settings window's native frame, the template tray icon and the Dock icon that shows only while the settings window is open are small functions in `platform.rs` (`style_settings_window`, `tray_icon`, `set_dock_icon_visible`, `restart_app`, `watch_keyboard_layout`, `install_app_menu`, `on_run_event`); the key capture is `keyboard/macos.rs` (the event tap) and the key labels that follow the keyboard layout are `keyboard/macos_labels.rs`, with the `core-graphics` and `core-foundation` crates as macOS-only
  dependencies. The key names and repeat filter (`keyboard/macos_keys.rs`) are plain logic, built and tested everywhere.
- On other systems, starting a capture method returns an error instead of capturing keys (`Source::start` in
  `keyboard/mod.rs`). A port adds its own method there: [LINUX-PORT.md](LINUX-PORT.md) has the next Linux steps,
  [MAC-PORT.md](MAC-PORT.md) the macOS plan.

## Keeping it cross-platform

- Put any new operating-system call in `platform.rs` (or `keyboard/` for key capture), with a `#[cfg(not(windows))]`
  version that does nothing or reports "not supported". Never call the `windows` crate anywhere else.
- If CI's `other-systems` job fails on your change, the usual cause is a Windows call outside those files.
- Line endings are fixed by `.gitattributes` (LF everywhere, CRLF only for PowerShell scripts), so editors on any system
  produce the same files.
