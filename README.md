# ⌨ Keystroke Overlay

A Windows app that shows your keyboard presses live in OBS, for streams and recordings. Customizable layouts and style.

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/nqble/keystroke-overlay)](../../releases/latest)

Built with [Tauri](https://tauri.app) (Rust + WebView2) and plain HTML/CSS/JavaScript, with the help of [Claude Code](https://claude.com/claude-code).

- **Lightweight:** about 3 MB of RAM and ~0% CPU while idle (measured for each release with `tests/bench/run.mjs`, see
  the CHANGELOG). The installer is about 2.3 MB.
- **Works in games:** a global keyboard reader sees your keys even when a game has focus, with a second
  "Compatibility" method for games that block the standard one.
- **Fully customizable:** pick or build your own layouts, then change colors, fonts, animations and per-key labels.
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

### Keep it smooth and light in OBS

These OBS settings make the biggest difference to how smooth the overlay looks and how little it costs while you stream:

- **Size the source exactly** as shown in the app's header. To make the keys bigger or smaller, use **Style → Scale** in the app
  instead of stretching the source in OBS: the keys stay sharp and OBS draws fewer pixels.
- **Frame rate:** leave **Use custom frame rate** off; OBS then matches your stream's frame rate. Only turn it on to match a
  60 fps stream if OBS runs at a different rate.
- **Shutdown source when not visible:** turn it on if the overlay is only in some of your scenes. It stops using CPU while
  hidden and reconnects in a moment when the scene shows again.
- **Refresh browser when scene becomes active:** leave it off. The overlay updates itself; reloading only adds a short gap.
- **Hardware acceleration:** in OBS, **Settings → Advanced → Sources → Enable Browser Source Hardware Acceleration** should be
  on (it is by default). The overlay's animations are designed to run on the graphics card.

## Using two PCs (game on one, OBS on the other)

Keystroke Overlay only talks to `127.0.0.1`, which means "this PC", so OBS has to run on the **same PC as the app**. If you play on
PC A and stream with OBS on PC B, there is a way to make it work **without changing the app**: carry the overlay link from PC B to PC A
through an **SSH tunnel**. An SSH tunnel is an encrypted pipe between two computers; the program `ssh` builds it, not Keystroke Overlay.
Run it over a private network you control, such as [Tailscale](https://tailscale.com).

**What you need (one-time setup)**
- Tailscale on both PCs, signed in to the same account, so each PC has a private name (this page calls them `gaming-pc` and `stream-pc`).
- An SSH server on PC A (the gaming PC). On Windows 10/11 it is the optional feature **OpenSSH Server** (Settings → System → Optional features).
- Keystroke Overlay running on PC A as normal. Nothing to install or change on PC B except OBS.

**Each time you stream**
1. On PC A, open the app: **General → Secure link**, tick **Secure my OBS link**, and press **Copy secure link**. Keep this link private.
2. On PC B, open a terminal and start the tunnel (use your Windows user name on PC A):

   ```
   ssh -N -L 7878:127.0.0.1:7878 your-user@gaming-pc
   ```

   `-L 7878:127.0.0.1:7878` means "send anything that arrives at port 7878 on this PC to port 7878 on PC A". `-N` means "only build
   the tunnel, don't open a shell". Leave the window open while you stream.
3. On PC B, add the OBS source as in [Add it to OBS](#add-it-to-obs), but paste the link you copied in step 1. It looks like
   `http://localhost:7878/?key=…`.

**Good to know**
- **Keep both port numbers the same as the app's port** (**General → Port**, default 7878). The app only answers requests addressed to
  `localhost:<its port>`, so a different number on PC B would be refused.
- **Keep the secure link on.** Without it, any program on either PC that can reach the port could read your key presses. With it, the
  stream and data are refused without the private key (`?key=…`), as described in [Secure link](#secure-link-optional). If you use **Make a new key**,
  copy the new link into OBS again.
- **Nothing changes inside the app.** Its server still listens on `127.0.0.1` only and never accepts connections from other computers
  (the SSH server on PC A hands the data over locally), and the app itself still uses the network for nothing except update checks.
  Your key presses travel only through the encrypted tunnel you started, between your own two PCs.
- **Safety of the tunnel is your job.** Use a normal SSH login (a key or password) and let only your own devices reach the SSH port, for
  example with Tailscale access rules. **Pause overlay** still works, because the pause happens in the app on PC A.
- Closing the terminal window on PC B stops the tunnel, and the overlay goes blank until you start it again.
- If the overlay looks slightly ahead of or behind your video, that is normal for two PCs; a capture card adds its own delay.
- More background, and why the app does not have a built-in network mode:
  [docs/proposals/tailscale-dual-pc.md](docs/proposals/tailscale-dual-pc.md).

## Settings

| Tab | What it does |
|---|---|
| **Layout** | Pick a keyboard: Full size, Tenkeyless, WASD, Gameplay, or **make your own** with the dashed **+** card (up to 20). Right-click a layout you made to delete it. **Export / Import layouts** share them as a file. |
| **Keys** | Show or hide individual keys, give any key a custom label (e.g. Space → `⎵` or `Jump`), and **drag keys to move them** anywhere. Select several keys by dragging a box around them (or Ctrl-click), then move them together, nudge them with the arrow buttons, **align** them or **space them evenly**; **Undo** and **Redo** step back through your changes. Choose how far keys jump with **Snap** (off, quarter, half or whole key) and show a **grid** if you like; both are remembered. X / Y fields give exact spots for a single key. **Tidy up** closes the gaps left by hidden keys while keeping the keyboard's shape. Edits are saved automatically **per layout**, and **Revert to Default** undoes them for the current layout. |
| **Style** | Colors (idle and pressed), borders, corner radius, fonts, key size, spacing, scale, opacity. Sliders such as border, opacity and font size can go all the way to 0. Built-in themes plus your own saved presets. |
| **Animation** | Press down, glow, fade, bounce, scale, or none — with adjustable speed, easing and intensity. |
| **Fonts** | Add your own TTF / OTF / WOFF fonts. |
| **General** | OBS link, port and server restart, **secure link**, **keyboard input method**, start with Windows, minimize to tray, program updates (channel, release notes), **Debug mode** and **Reset all settings**. |

A live preview at the top of the window updates as you change things. You can click keys in the preview to test an animation.

**Debug mode (for developers).** **General → App → Debug mode** adds a **Debug** tab with a self-test, a live event log, a key monitor, a raw settings editor, test helpers and a one-click bug report. It is off by default; while on, nothing is sent anywhere, nothing is saved to disk (the self-test only creates and deletes one empty test file to check the folder can be written), and the log never contains key presses. Details in [docs/DEBUGGING.md](docs/DEBUGGING.md).

## Keyboard input method

Under **General → Keyboard input** you choose how the app reads your keys. You can switch any time, no restart.

| | When to use it |
|---|---|
| **Standard** (recommended, the default) | Works with nearly every game. |
| **Compatibility** (Windows Raw Input) | Try it if keys **don't light up in one particular game**. Some games and anti-cheat tools block the standard method but not this one. It is just as light on your PC: both methods use about 0% CPU when idle. |

Both methods read keys the same way and never save or send them. If a game runs **as administrator**, start Keystroke Overlay
as administrator too — Windows doesn't let normal programs see keys typed into an elevated window, whichever method you pick.

## Secure link (optional)

Under **General → Secure link** you can choose how locked-down your OBS link is. It is **off by default**: the link is plain
(`http://localhost:7878/`) and needs no extra step.

| | What it means |
|---|---|
| **Off (default)** | Simple link, nothing extra to do. Other programs running on your PC could read your key presses through it. |
| **On** | Your OBS link gets a private key (`http://localhost:7878/?key=…`). Only a program that knows the full link can read your key presses, including other Windows users on the same PC. Copy the new link into OBS **once** (the old link stops working). The link is hidden on screen in the app, and you should keep it off your stream. |

**Make a new key** creates a fresh key and cuts off every link made with the old one.

## Tray menu

Right-click the tray icon for quick actions without opening settings:

- **Pause overlay** — instantly hides the overlay and stops sending keys (handy when typing a password on stream). Click again to resume.
- **Layout** — switch between layouts.
- **Restart server** — restarts the overlay server if something gets stuck. OBS reconnects by itself.
- **Update available** — only appears (at the very top, with a small orange dot on the tray icon) when a newer version exists. Click it to jump to General → Program updates.
- **Open settings**, **Copy OBS URL**, **Quit**.

## Updating

While the app runs it quietly checks GitHub about once an hour, so a new version shows up as a small **orange dot on the tray icon** and an **Update available** entry in the tray menu, even if you never open settings. In the settings window a small download button in the app's accent color also appears in the bottom-left corner (hover it: "New update"). Click it, read the notes, and choose **Update now** — **nothing is ever installed without your click**. You can also use **General → Program updates → Check for updates** any time.

**Update channel** (General → Program updates). Version numbers look like `x.y.z`: **the middle number is Stable, the last number is Latest.**
- **Stable (recommended)** — the main, well-tested releases (the middle number goes up: 1.2.0, 1.3.0, …).
- **Latest** — every release as soon as it is published, including the small fixes in between (1.2.1, 1.2.2, …).

After an update, a **What's new** window shows the release notes once. You can reopen them anytime with **General → View release notes**.

## Make your own layout

**In the app (easiest):** open the **Layout** tab and click the dashed **+** card. Give it a name and it starts as a copy of the
full-size keyboard. Then, in the **Keys** tab, hide the keys you don't want and relabel the ones you do. You can make up to **20**
layouts (a counter shows how many you've used). To remove one, **right-click it and choose Delete layout**. Built-in layouts can't be deleted.

**Share layouts:** in the Layout tab, **Export layouts** saves every layout you made (plus your hidden keys and labels) into one `.json` file, and **Import layouts** adds layouts from such a file. Imported layouts are checked and cleaned, they never replace a layout you already have (a number is added to the name instead), and they count toward the 20-layout limit.

**By hand (for full control):** a layout is a single JSON file. Put it in the app's `layouts` folder (**General → App → Open data folder → layouts**) and restart the app.

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
| **Update check** | When you click *Check for updates*, or — if you leave *Check for updates automatically* on — about once an hour while the app is running (and when the settings window opens). Turn that setting off and the app **never** checks by itself. | An ordinary web request for a small file (`latest.json` / `stable.json`). GitHub sees your IP address, the time, and the app's name and version. |
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
  You can close this gap with the optional **Secure link** (General → Secure link): your OBS link then carries a private key and
  the app refuses everything without it. It is off by default, so the link stays simple, and turning it on means pasting the new link into OBS once.
- Three components are outside our control: **Microsoft Edge WebView2** (draws the settings window; Microsoft's diagnostic-data
  settings apply to it), **OBS**, and **Windows** itself.

### Don't trust — verify
- **Read the code.** It's small, and the network code is in exactly one file (`src-tauri/src/commands/updates.rs`).
- **Watch it.** With the app running, `netstat -ano | findstr <its process id>` shows one listening socket on `127.0.0.1` and nothing else.
- **Block it.** Deny the app internet access in your firewall: the overlay keeps working, only updates stop.
- **Let the computer check.** `npm run check:privacy` (it also runs on every change on GitHub) fails the build if network access,
  file writes in the keyboard code, logging, or an external request ever appears where it shouldn't. It is a tripwire
  that reads the code line by line, not a proof (it can't see inside dependencies), so changes to that code also get a
  careful review. An automated test
  (`npm run test:e2e`) also confirms every socket the running app holds is loopback-only.
- **Hostile-input tests.** Thousands of randomly corrupted settings files and imported layout files are thrown at the cleaning code on every
  `npm test`; nothing may crash, escape its folder or get past the limits.
- **Strict page policy.** The settings window runs under a content-security policy: it can only run its own scripts, talk to the app itself
  and embed the local preview. A test confirms injected scripts and other websites are blocked.
- **Security scans.** Every Monday (and on demand: **Actions → Security scan → Run workflow**) GitHub checks the libraries the
  app is built from against public lists of known vulnerabilities. **Actions → CodeQL → Run workflow** has GitHub's code
  scanner read our own code (on demand only).
  More in [SECURITY.md](SECURITY.md).

## Troubleshooting

- **OBS source is blank:** make sure the app is running (tray icon) and the URL in OBS matches the port in settings. Right-click the source in OBS and choose **Refresh cache of current page**.
- **OBS runs on a different PC from the game:** the overlay link only works on the PC that runs the app. See [Using two PCs](#using-two-pcs-game-on-one-obs-on-the-other).
- **"Port already in use" message:** another program is using that port. Pick a different one in **General → Port**, then update the URL in OBS.
- **Keys don't light up in a certain game:** (1) if the game runs **as administrator**, start Keystroke Overlay as administrator too (Windows blocks normal programs from seeing keys typed into elevated windows); (2) otherwise switch **General → Keyboard input** to **Compatibility** — some games and anti-cheat tools block the standard method but not that one. Still nothing? Open an issue naming the game and its anti-cheat.
- **Reporting a bug:** turn on **General → App → Debug mode**, open the new **Debug** tab and press **Copy bug report**, then paste it into your GitHub issue. It has no key presses and no personal paths.
- **Something is badly misconfigured:** **General → App → Reset all settings…** puts every option back to its default (your layouts, presets, fonts and port are kept).
- **Overlay is cut off in OBS:** raise the source's width and height to the size shown in the app's header.

## Building from source

You need Windows 10/11, [Rust](https://rustup.rs) (MSVC toolchain) with Visual Studio Build Tools, and [Node.js](https://nodejs.org) 20+.

```bash
git clone https://github.com/nqble/keystroke-overlay.git
cd keystroke-overlay
npm install
npm run dev          # run it
npm run dev:debug    # run a separate development copy with Debug mode on (see docs/DEBUGGING.md)
npm test             # unit tests (including hostile-input tests) + privacy check
npm run format       # format the code (Prettier + rustfmt); CI checks it
npm run check:style  # tabs, trailing spaces, final newline
npm run test:e2e     # end-to-end tests (builds a throwaway copy, cleans up after itself)
npm run test:install # clean install + upgrade + uninstall with real installers (throwaway identity)
npm run build        # installer in src-tauri/target/release/bundle/nsis/
```

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). How the code is organised:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Debugging tools: [docs/DEBUGGING.md](docs/DEBUGGING.md). A Mac port has been researched: [docs/MAC-PORT.md](docs/MAC-PORT.md).
Maintaining the project without coding: [docs/OPEN-SOURCE-GUIDE.md](docs/OPEN-SOURCE-GUIDE.md).

## Requirements

Windows 10 or 11 (64-bit) with Microsoft Edge WebView2, which is already included in current Windows 10 and 11.

## License

[MIT](LICENSE) © 2026 Jordan Phoutthavone. Third-party components keep their own licenses.

### Name and logo

The MIT license covers the **code**. It does not cover the **name "Keystroke Overlay"**, the **logo** or the **author's
name**, which identify the official app by Jordan Phoutthavone. You're welcome to fork, change and share the code, but if
you publish your own version:

- give it a **different name and logo**, so people can tell it apart from the official app;
- don't present it as the official app, or as made or endorsed by Jordan Phoutthavone;
- keep the copyright and license notice, as the MIT license requires. Saying "based on Keystroke Overlay by Jordan
  Phoutthavone" is welcome.

Official releases are only published at [github.com/nqble/keystroke-overlay](https://github.com/nqble/keystroke-overlay/releases)
and are signed, so the app's built-in updater only installs updates from there.
