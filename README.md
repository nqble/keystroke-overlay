# ⌨ Keystroke Overlay

A tiny Windows tray app that shows your keystrokes in **OBS** — like the keyboard overlays you see in Minecraft and
gameplay streams. Nothing appears on your own screen; the keys only show up in your recording or stream.

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/nqble/keystroke-overlay)](../../releases/latest)

Built with [Tauri](https://tauri.app) (Rust + WebView2) and plain HTML/CSS/JavaScript, with the help of [Claude Code](https://claude.com/claude-code).

- **Lightweight:** about 13 MB of RAM and ~0% CPU while idle. The installer is about 2 MB.
- **Works in games:** a global keyboard hook sees your keys even when a game has focus.
- **Fully customizable:** layouts, colors, fonts, animations, per-key labels.
- **Private by design:** keystrokes are never saved or sent anywhere — see [Privacy](#privacy).
- **Open source** under the [MIT license](LICENSE).

## Install

1. Go to the [**Releases**](../../releases/latest) page.
2. Download `Keystroke-Overlay_x.y.z_x64-setup.exe` and run it.
3. Windows may show a SmartScreen warning because the installer isn't code-signed. Click **More info → Run anyway**.

The app starts in your system tray (bottom-right of the taskbar). Click the tray icon to open settings.
Prefer to build it yourself? See [Building from source](#building-from-source).

## Add it to OBS

1. In the app, click **Copy OBS URL** (default: `http://localhost:7878/`).
2. In OBS: **Sources → + → Browser**, then paste the URL.
3. Set **Width** and **Height** to the size shown in the app's header (for example 1085 × 403 for the TKL layout). It changes with your layout and scale.
4. Leave Custom CSS empty — the page is already transparent.

If you change the port in settings, update the URL in OBS too.

## Settings

| Tab | What it does |
|---|---|
| **Layout** | Pick a keyboard: Full size, Tenkeyless, WASD, Gameplay, TSB, or your own. |
| **Keys** | Show or hide individual keys and give any key a custom label (e.g. Space → `⎵` or `Jump`). Edits are saved automatically **per layout**, and **Revert to Default** undoes them for the current layout. |
| **Style** | Colors (idle and pressed), borders, corner radius, fonts, key size, spacing, scale, opacity. Built-in themes plus your own saved presets (export/import supported). |
| **Animation** | Press down, glow, fade, bounce, scale, or none — with adjustable speed, easing and intensity. |
| **Fonts** | Add your own TTF / OTF / WOFF fonts. |
| **General** | Port, restart server, start with Windows, minimize to tray, update channel, program updates, and release notes. |

A live preview at the top of the window updates as you change things. You can click keys in the preview to test an animation.

## Tray menu

Right-click the tray icon for quick actions without opening settings:

- **Pause overlay** — instantly hides the overlay and stops sending keys (handy when typing a password on stream). Click again to resume.
- **Layout** — switch between layouts.
- **Restart server** — restarts the overlay server if something gets stuck. OBS reconnects by itself.
- **Open settings**, **Copy OBS URL**, **Quit**.

## Updating

When a new version is available, a small green download button appears in the bottom-left corner of the settings window (hover it: "New update"). Click it, read the notes, and choose **Update now** — **nothing is ever installed without your click**. You can also use **General → Program updates → Check for updates** any time.

**Update channel** (General → Program updates):
- **Stable (recommended)** — only releases that have been promoted as stable.
- **Latest** — every release as soon as it is published, including small fixes in between.

After an update, a **What's new** window shows the release notes once. You can reopen them anytime with **General → View release notes**.

## Make your own layout

A layout is a single JSON file. Put it in the app's `layouts` folder (**General → Open data folder → layouts**) and restart the app.

```json
{
  "id": "mine",
  "name": "My layout",
  "keys": [
    { "code": "KeyW", "label": "W", "x": 1, "y": 0 },
    { "code": "KeyA", "label": "A", "x": 0, "y": 1 },
    { "code": "Space", "label": "", "x": 0, "y": 2, "w": 3 }
  ]
}
```

`x` / `y` are the key's position and `w` / `h` its size, in key units (1 = one normal key). `code` uses standard key names such as `KeyW`, `Digit1`, `ShiftLeft`, `Space`, `ArrowUp`, `Numpad5`.

## Privacy

This app has to watch your keyboard to work, so here is exactly what it does with that access:

- Keystrokes are **never written to disk** — not in a file, a log, a cache or a history.
- Keystrokes are **never sent over the internet**. They go only to a local page on **your own PC** that OBS reads.
- There is **no telemetry, analytics, crash reporting, account or ad code** of any kind.
- The overlay server listens on **127.0.0.1 only**, and refuses requests coming from websites.
- The **only** internet contact is GitHub: the update check, the update download (only after you click *Update now*), and release notes. Never keystrokes, never your settings. You can turn the automatic check off.

Two honest limits: the app can see *every* key you press while it runs (including in password boxes; use **Pause overlay**), and other programs on the same PC — including other logged-in Windows users — can connect to the local overlay port.

**Don't trust, verify:** the full explanation is in [PRIVACY.md](PRIVACY.md), including how to check each claim yourself
(read the code, watch its network sockets, block it in your firewall). The promises are also enforced in code:
`npm run check:privacy` fails the build if network access, file writes, logging or external requests appear where they shouldn't.

## Troubleshooting

- **OBS source is blank:** make sure the app is running (tray icon) and the URL in OBS matches the port in settings. Right-click the source in OBS and choose **Refresh cache of current page**.
- **"Port already in use" message:** another program is using that port. Pick a different one in **General → Port**, then update the URL in OBS.
- **Keys don't light up in a certain game:** the most common cause is that the **game runs as administrator** (or its launcher does). Windows doesn't let a normal program see keys typed into an elevated window. Try starting Keystroke Overlay as administrator (right-click → *Run as administrator*) and see if the keys come back. Less often, an anti-cheat system blocks keyboard hooks; if keys still don't show, please open an issue naming the game and anti-cheat so we can investigate.
- **Overlay is cut off in OBS:** raise the source's width and height to the size shown in the app's header.

## Building from source

You need Windows 10/11, [Rust](https://rustup.rs) (MSVC toolchain) with Visual Studio Build Tools, and [Node.js](https://nodejs.org) 20+.

```bash
git clone https://github.com/nqble/keystroke-overlay.git
cd keystroke-overlay
npm install
npm run dev      # run it
npm test         # unit tests + privacy check
npm run build    # installer in src-tauri/target/release/bundle/nsis/
```

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). How the code is organised:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). A Mac port has been researched: [docs/MAC-PORT.md](docs/MAC-PORT.md).

## Requirements

Windows 10 or 11 (64-bit) with Microsoft Edge WebView2, which is already included in current versions of Windows.

## License

[MIT](LICENSE) © 2026 Jordan Phoutthavone. Third-party components keep their own licenses.
