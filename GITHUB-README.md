# ⌨ Keystroke Overlay

A tiny Windows tray app that shows your keystrokes in **OBS** — like the keyboard overlays you see in Minecraft and gameplay streams. Nothing appears on your own screen; the keys only show up in your recording or stream.

Built with [Tauri](https://tauri.app) (Rust + WebView2) and plain HTML/CSS/JavaScript, with the help of [Claude Code](https://claude.com/claude-code).

- **Lightweight:** about 12–19 MB of RAM and ~0% CPU while idle. The installer is about 2 MB.
- **Works in games:** a global keyboard hook sees your keys even when a game has focus.
- **Fully customizable:** layouts, colors, fonts, animations, per-key labels.
- **Private:** keystrokes are never saved or sent anywhere (see [Privacy](#privacy)).

## Install

1. Go to the [**Releases**](../../releases/latest) page.
2. Download `Keystroke-Overlay_x.y.z_x64-setup.exe` and run it.
3. Windows may show a SmartScreen warning because the installer isn't code-signed. Click **More info → Run anyway**.

The app starts in your system tray (bottom-right of the taskbar). Click the tray icon to open settings.

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
| **Keys** | Show or hide individual keys and give any key a custom label (e.g. Space → `⎵` or `Jump`). |
| **Style** | Colors (idle and pressed), borders, corner radius, fonts, key size, spacing, scale, opacity. Built-in themes plus your own saved presets (export/import supported). |
| **Animation** | Press down, glow, fade, bounce, scale, or none — with adjustable speed, easing and intensity. |
| **Fonts** | Add your own TTF / OTF / WOFF fonts. |
| **General** | Port, start with Windows, minimize to tray, and program updates. |

A live preview at the top of the window updates as you change things. You can click keys in the preview to test an animation.

## Updating

Open **General → Program updates** and click **Check for updates**.

- Most updates install right inside the app: click **Install update** and the app restarts.
- If an update needs a manual install, the app tells you and the button opens the download page here. Download the new installer, close the app, and run it. Your settings are kept.

The app only contacts GitHub when you check for updates (or if you turn on the automatic check), and sends nothing but its version number.

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

- Keystrokes are **never written to disk** and **never sent over the internet**.
- The overlay server listens on your own PC only (`127.0.0.1`) and rejects requests from other websites, so a web page can't watch your typing.
- Your settings, presets and fonts are stored locally in `%APPDATA%\com.keyoverlay.app`.

## Troubleshooting

- **OBS source is blank:** make sure the app is running (tray icon) and the URL in OBS matches the port in settings. Right-click the source in OBS and choose **Refresh cache of current page**.
- **"Port unavailable" message:** another program is using that port. Pick a different one in **General → Port**, then update the URL in OBS.
- **Keys don't light up in a certain game:** some games with anti-cheat block keyboard hooks. If that happens, the overlay can't see keys in that game.
- **Overlay is cut off in OBS:** raise the source's width and height to the size shown in the app's header.

## Requirements

Windows 10 or 11 (64-bit) with Microsoft Edge WebView2, which is already included in current versions of Windows.
