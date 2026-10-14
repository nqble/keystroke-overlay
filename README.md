# ⌨ Keystroke Overlay

A tiny Windows tray app that shows your keystrokes in **OBS** — like the keyboard overlays you see in Minecraft and
gameplay streams. Nothing appears on your own screen; the keys only show up in your recording or stream.

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/nqble/keystroke-overlay)](../../releases/latest)

Built with [Tauri](https://tauri.app) (Rust + WebView2) and plain HTML/CSS/JavaScript, with the help of [Claude Code](https://claude.com/claude-code).

- **Lightweight:** about 13 MB of RAM and ~0% CPU while idle. The installer is about 2 MB.
- **Works in games:** a global keyboard reader sees your keys even when a game has focus, with a second
  "Compatibility" method for games that block the standard one.
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
| **General** | Port, restart server, **keyboard input method**, start with Windows, minimize to tray, update channel, program updates, and release notes. |

A live preview at the top of the window updates as you change things. You can click keys in the preview to test an animation.

## Keyboard input method

Under **General → Keyboard input** you choose how the app reads your keys. You can switch any time, no restart.

| | When to use it |
|---|---|
| **Standard** (recommended, the default) | What the app has always used. Works with nearly every game. |
| **Compatibility** (Windows Raw Input) | Try it if keys **don't light up in one particular game**. Some games and anti-cheat tools block the standard method but not this one. It is just as light on your PC (in testing it used *less* CPU under a heavy flood of key presses). |

Both methods read keys the same way and never save or send them. If a game runs **as administrator**, start Keystroke Overlay
as administrator too — Windows doesn't let normal programs see keys typed into an elevated window, whichever method you pick.

## Tray menu

Right-click the tray icon for quick actions without opening settings:

- **Pause overlay** — instantly hides the overlay and stops sending keys (handy when typing a password on stream). Click again to resume.
- **Layout** — switch between layouts.
- **Restart server** — restarts the overlay server if something gets stuck. OBS reconnects by itself.
- **Open settings**, **Copy OBS URL**, **Quit**.

## Updating

When a new version is available, a small green download button appears in the bottom-left corner of the settings window (hover it: "New update"). Click it, read the notes, and choose **Update now** — **nothing is ever installed without your click**. You can also use **General → Program updates → Check for updates** any time.

**Update channel** (General → Program updates). Version numbers look like `x.y.z`: **the middle number is Stable, the last number is Latest.**
- **Stable (recommended)** — the main, well-tested releases (the middle number goes up: 1.2.0, 1.3.0, …).
- **Latest** — every release as soon as it is published, including the small fixes in between (1.2.1, 1.2.2, …).

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

This app has to watch your keyboard to work, so it owes you a precise account of what it does with that access. Here it is;
the long version, with the ways to check every line, is in **[PRIVACY.md](PRIVACY.md)**.

### What the app can see
Every key you press or release on this PC **while it is running** — in games, chats, and password boxes too. That is how every
keystroke-display tool works (it is the only way to show keys while a game has focus). It records only *which key* and *down or
up* (for example `W`, down). It does **not** build up the text you type, and it keeps **no history**: it remembers only which
keys are held *right now*, so a key can never look stuck. Use **Pause overlay** before typing anything private on stream.

### Where your keystrokes go
```
your keyboard → Windows → Keystroke Overlay (in memory) → a web page on YOUR PC (127.0.0.1) → OBS on your PC
```
Every step happens on your computer, in memory. The moment a key is released, the event is gone.

### What is saved on your PC
Only things you chose, in `%APPDATA%\com.keyoverlay.app\`: your settings (style, layout, hidden keys, labels, port,
preferences), presets, fonts, and layouts you added. **Nothing in there contains keystrokes.** Uninstall and delete that folder to
remove everything.

### What touches the internet
Exactly three things, all with GitHub, all optional or user-triggered, and none of them involve your keys or settings:

| What | When | What is sent |
|---|---|---|
| **Update check** | When you click *Check for updates*, or — if you leave *Check for updates automatically* on — when the settings window opens, at most every 6 hours. Turn that setting off and the app **never** checks by itself. | An ordinary web request for a small file (`latest.json` / `stable.json`). GitHub sees your IP address, the time, and the app's name and version. |
| **Update download** | Only after you click *Update now*. The file is verified against a signing key built into the app; anything that doesn't match is rejected and never run. | An ordinary file download. |
| **Release notes** | When the *What's new* window or *View release notes* opens. | An ordinary request for one version's notes. |

There is no account, no user ID, no device ID, no cookies, no analytics, no telemetry, no crash reporting, no ads. If you never
use updates you can block the app in your firewall and everything else keeps working.

### What it never does
- never writes keystrokes to a file, log, cache or history
- never sends keystrokes (or settings) over the network, to us or anyone
- never accepts connections from other computers: the overlay server listens on `127.0.0.1` only, and it also refuses requests coming from web pages
- never takes screenshots, reads your clipboard, or reads other programs' contents (it uses the clipboard only to *copy* the OBS address when you press *Copy OBS URL*)

### Limits, stated plainly
- The app can see **every** key while it runs, including in password boxes. That is inherent to the job, so use **Pause overlay**.
- The local overlay server does **not** authenticate other *programs* on the same PC, including other Windows users logged in at the
  same time. A program already running as you could receive key events from it (though it could also install its own keyboard hook).
  An optional access key to close this gap is planned.
- Three components are outside our control: **Microsoft Edge WebView2** (draws the settings window; Microsoft's diagnostic-data
  settings apply to it), **OBS**, and **Windows** itself.

### Don't trust — verify
- **Read the code.** It's small, and the network code is in exactly one file (`src-tauri/src/commands/updates.rs`).
- **Watch it.** With the app running, `netstat -ano | findstr <its process id>` shows one listening socket on `127.0.0.1` and nothing else.
- **Block it.** Deny the app internet access in your firewall: the overlay keeps working, only updates stop.
- **Let the computer check.** `npm run check:privacy` (it also runs on every change on GitHub) fails the build if network access,
  file writes in the keyboard code, logging, or an external request ever appears where it shouldn't. An automated test
  (`npm run test:e2e`) also confirms every socket the running app holds is loopback-only.

## Troubleshooting

- **OBS source is blank:** make sure the app is running (tray icon) and the URL in OBS matches the port in settings. Right-click the source in OBS and choose **Refresh cache of current page**.
- **"Port already in use" message:** another program is using that port. Pick a different one in **General → Port**, then update the URL in OBS.
- **Keys don't light up in a certain game:** (1) if the game runs **as administrator**, start Keystroke Overlay as administrator too (Windows blocks normal programs from seeing keys typed into elevated windows); (2) otherwise switch **General → Keyboard input** to **Compatibility** — some games and anti-cheat tools block the standard method but not that one. Still nothing? Open an issue naming the game and its anti-cheat.
- **Overlay is cut off in OBS:** raise the source's width and height to the size shown in the app's header.

## Building from source

You need Windows 10/11, [Rust](https://rustup.rs) (MSVC toolchain) with Visual Studio Build Tools, and [Node.js](https://nodejs.org) 20+.

```bash
git clone https://github.com/nqble/keystroke-overlay.git
cd keystroke-overlay
npm install
npm run dev          # run it
npm test             # unit tests + privacy check
npm run test:e2e     # end-to-end tests (builds a throwaway copy, cleans up after itself)
npm run build        # installer in src-tauri/target/release/bundle/nsis/
```

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). How the code is organised:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). A Mac port has been researched: [docs/MAC-PORT.md](docs/MAC-PORT.md).
Maintaining the project without coding: [docs/OPEN-SOURCE-GUIDE.md](docs/OPEN-SOURCE-GUIDE.md).

## Requirements

Windows 10 or 11 (64-bit) with Microsoft Edge WebView2, which is already included in current versions of Windows.

## License

[MIT](LICENSE) © 2026 Jordan Phoutthavone. Third-party components keep their own licenses.
