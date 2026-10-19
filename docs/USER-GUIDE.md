# User guide

How to use Keystroke Overlay: adding it to OBS, every tab of the settings window, the tray menu, updates and fixing
problems. Getting the app is in the [README](../README.md); what it can see and send is in [PRIVACY.md](../PRIVACY.md).

## Contents

- [Add it to OBS](#add-it-to-obs)
- [Using two PCs (game on one, OBS on the other)](#using-two-pcs-game-on-one-obs-on-the-other)
- [Settings](#settings)
- [Keyboard input method](#keyboard-input-method)
- [Secure link (optional)](#secure-link-optional)
- [Tray menu](#tray-menu)
- [Updating](#updating)
- [Make your own layout](#make-your-own-layout)
- [Troubleshooting](#troubleshooting)
- [Requirements](#requirements)

## Add it to OBS

1. In the app, click **Copy OBS URL** (default: `http://localhost:7878/`).
2. In OBS: **Sources → + → Browser**, then paste the URL.
3. Set **Width** and **Height** to the size shown in the app's header (for example 1085 × 403 for the TKL layout). It changes with your layout and scale. If the box is a different size, the keyboard
   scales itself to fit inside it and stays centered, so nothing is cut off.
4. Leave Custom CSS empty — the page is already transparent.

If you change the port in settings, update the URL in OBS too.

### Keep it smooth and light in OBS

These OBS settings make the biggest difference to how smooth the overlay looks and how little it costs while you stream:

- **Size the source exactly** as shown in the app's header, so there's no empty space around the keys. To make the keys
  bigger or smaller, use **Style → Scale** in the app and set the new size, instead of stretching the source in OBS: the
  keys stay sharp and OBS draws fewer pixels.
- **Frame rate:** leave **Use custom frame rate** off; OBS then matches your stream's frame rate. Only turn it on to match a
  60 fps stream if OBS runs at a different rate.
- **Shutdown source when not visible:** turn it on if the overlay is only in some of your scenes. It stops using CPU while
  hidden and reconnects in a moment when the scene shows again.
- **Refresh browser when scene becomes active:** leave it off. The overlay updates itself; reloading only adds a short gap.
- **Hardware acceleration:** in OBS, **Settings → Advanced → Sources → Enable Browser Source Hardware Acceleration** should be
  on (it is by default). The overlay's animations are designed to run on the graphics card.

## Using two PCs (game on one, OBS on the other)

Keystroke Overlay only talks to `127.0.0.1`, which means "this PC", so OBS has to run on the **same PC as the app**. If you play on
PC A and stream with OBS on PC B, there is a way to make it work **without changing the app**: carry the OBS URL from PC B to PC A
through an **SSH tunnel**. An SSH tunnel is an encrypted pipe between two computers; the program `ssh` builds it, not Keystroke Overlay.
Run it over a private network you control, such as [Tailscale](https://tailscale.com).

**What you need (one-time setup)**
- Tailscale on both PCs, signed in to the same account, so each PC has a private name (this page calls them `gaming-pc` and `stream-pc`).
- An SSH server on PC A (the gaming PC). On Windows 10/11 it is the optional feature **OpenSSH Server** (Settings → System → Optional features).
- Keystroke Overlay running on PC A as normal. Nothing to install or change on PC B except OBS.

**Each time you stream**
1. On PC A, open the app: **General → Secure link**, tick **Secure my OBS URL**, and press **Copy secure link**. Keep this link private.
2. On PC B, open a terminal and start the tunnel (use your Windows user name on PC A):

   ```
   ssh -N -L 7878:127.0.0.1:7878 your-user@gaming-pc
   ```

   `-L 7878:127.0.0.1:7878` means "send anything that arrives at port 7878 on this PC to port 7878 on PC A". `-N` means "only build
   the tunnel, don't open a shell". Leave the window open while you stream.
3. On PC B, add the OBS source as in [Add it to OBS](#add-it-to-obs), but paste the link you copied in step 1. It looks like
   `http://localhost:7878/?key=…`.

**Good to know**
- **Keep both port numbers the same as the app's port** (**General → Server → Port**, default 7878). The app only answers requests addressed to
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
  [for-claude/proposals/tailscale-dual-pc.md](for-claude/proposals/tailscale-dual-pc.md).

## Settings

| Tab | What it does |
|---|---|
| **Layout** | Pick a keyboard: Full size, Tenkeyless, WASD, Gameplay, or **make your own** with the dashed **+** card (up to 20). Right-click a layout you made to delete it. **Export / Import layouts** share them as a file. |
| **Keys** | The keyboard editor. Click a key to select it (Ctrl-click, or drag a box, to select several) and drag to move it: keys snap to a quarter key and to the edges of nearby keys, and can't leave the board. Scroll to zoom and drag with the middle mouse button to move the view. Drag the thin blue handles on the sides of a selected key to make it wider, narrower, taller or shorter. With two or more keys selected, a bar above them **aligns** them or **spaces them evenly**. The inspector on the right sets a key's label, width, height, place and whether it is shown; a **Hidden keys** switch shows or hides the dimmed keys you turned off. **Layout style** switches between **Keyboard shape** and **Even grid** (every key one key wide in neat columns); each style keeps its own moves. **Close gaps** slides keys together, **Reset** puts keys, labels or the whole layout back, **Undo** and **Redo** step through your changes, and **Snap** and **Grid** are switches that are remembered (the grid shows with or without Snap). Edits are saved automatically **per layout**. |
| **Style** | Colors (idle and pressed), borders, corner radius, fonts, key size, spacing, scale, opacity. Sliders such as border, opacity and font size can go all the way to 0. Built-in themes plus your own saved presets. |
| **Animation** | Press down, glow, fade, bounce, scale, or none — with adjustable speed, easing and intensity. |
| **Fonts** | Add your own TTF / OTF / WOFF fonts. |
| **General** | OBS URL, port and server restart, **secure link**, **keyboard input method**, start with Windows, minimize to tray, program updates (channel, release notes), **Debug mode** and **Reset all settings**. |

A live preview at the top of the window updates as you change things (the Keys tab hides it, because the editor shows the keyboard itself). You can click keys in the preview to test an animation.

**Debug mode (for developers).** **General → App → Debug mode** adds a **Debug** tab with a self-test, a live event log, a key monitor, a raw settings editor, test helpers and a one-click bug report. It is off by default; while on, nothing is sent anywhere, nothing is saved to disk (the self-test only creates and deletes one empty test file to check the folder can be written), and the log never contains key presses. Details in [docs/DEBUGGING.md](DEBUGGING.md).

## Keyboard input method

Under **General → Keyboard input** you choose how the app reads your keys. You can switch any time, no restart.

| | When to use it |
|---|---|
| **Standard** (recommended, the default) | Works with nearly every game. |
| **Compatibility** (Windows Raw Input) | Try it if keys **don't light up in one particular game**. Some games and anti-cheat tools block the standard method but not this one. It is just as light on your PC: both methods use about 0% CPU when idle. |

Both methods read keys the same way and never save or send them. If a game runs **as administrator**, start Keystroke Overlay
as administrator too — Windows doesn't let normal programs see keys typed into an elevated window, whichever method you pick.

## Secure link (optional)

Under **General → Secure link** you can choose how locked-down your OBS URL is. It is **off by default**: the link is plain
(`http://localhost:7878/`) and needs no extra step.

| | What it means |
|---|---|
| **Off (default)** | Simple link, nothing extra to do. Other programs running on your PC could read your key presses through it. |
| **On** | Your OBS URL gets a private key (`http://localhost:7878/?key=…`). Only a program that knows the full link can read your key presses, including other Windows users on the same PC. Copy the new link into OBS **once** (the old link stops working). The link is hidden on screen in the app, and you should keep it off your stream. |

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

After an update, a **What's new** window shows the release notes once. You can reopen them anytime with **General → Program updates → View release notes**.

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

## Troubleshooting

- **OBS source is blank:** make sure the app is running (tray icon) and the URL in OBS matches the port in settings. Right-click the source in OBS and choose **Refresh cache of current page**.
- **OBS runs on a different PC from the game:** the OBS URL only works on the PC that runs the app. See [Using two PCs](#using-two-pcs-game-on-one-obs-on-the-other).
- **"Port already in use" message:** another program is using that port. Pick a different one in **General → Server → Port**, then update the URL in OBS.
- **Keys don't light up in a certain game:** (1) if the game runs **as administrator**, start Keystroke Overlay as administrator too (Windows blocks normal programs from seeing keys typed into elevated windows); (2) otherwise switch **General → Keyboard input** to **Compatibility** — some games and anti-cheat tools block the standard method but not that one. Still nothing? Open an issue naming the game and its anti-cheat.
- **Your antivirus flags the app:** check the file came from this project's [Releases](https://github.com/nqble/keystroke-overlay/releases) page, then
  [open an issue](https://github.com/nqble/keystroke-overlay/issues) naming the antivirus. Each release is reported to Microsoft as a false positive when
  needed (RELEASING.md).
- **Reporting a bug:** turn on **General → App → Debug mode**, open the new **Debug** tab and press **Copy bug report**, then paste it into your GitHub issue. It has no key presses and no personal paths.
- **Something is badly misconfigured:** **General → App → Reset all settings…** puts every option back to its default (your layouts, presets, fonts, port and secure link are kept).
- **Overlay looks small or has empty space around it in OBS:** set the source's width and height to the size shown in
  the app's header. The keyboard always fits inside the box, so a box of another shape leaves space at the sides.

## Requirements

Windows 10 or 11 (64-bit) with Microsoft Edge WebView2, which is already included in current Windows 10 and 11.
