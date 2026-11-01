# Keystroke Overlay: user guide

Everything about using the app, in one place. The short version is in the [README](../README.md); how your data is
handled, with the ways to check it, is in [PRIVACY.md](../PRIVACY.md).

## Contents

- [Add it to OBS](#add-it-to-obs)
- [Using two PCs (game on one, OBS on the other)](#using-two-pcs-game-on-one-obs-on-the-other)
- [Settings](#settings)
- [Keyboard input method](#keyboard-input-method)
- [Secure link (optional)](#secure-link-optional)
- [Tray menu](#tray-menu)
- [Updating](#updating)
- [Make your own layout](#make-your-own-layout)
- [On a Mac](#on-a-mac)
- [On Linux](#on-linux)
- [Privacy](#privacy)
- [Troubleshooting](#troubleshooting)
- [Requirements](#requirements)

## Add it to OBS

The first time the app opens, it walks you through these steps (to see them again: **General → Connection → First run setup**).

1. In the app, click **Copy OBS URL** (default: `http://localhost:7878/`).
2. In OBS: **Sources → + → Browser**, then paste the link.
3. Set **Width** and **Height** to the size the app shows (General → Connection, for example 1085 × 403 for the TKL layout). It changes with your layout and scale. If the box is a different size, the keyboard scales itself to fit inside it and stays centered, so nothing is cut off.
4. Leave Custom CSS empty — the page is already transparent.

If you change the port in settings, update the URL in OBS too.

### Keep it smooth and light in OBS

These OBS settings make the biggest difference to how smooth the overlay looks and how little it costs while you stream:

- **Size the source exactly** as shown in **General → Connection** (*Size in OBS*). To make the keys bigger or smaller, use **Style → Size → Overall scale** in the app
  instead of stretching the source in OBS: the keys stay sharp and OBS draws fewer pixels.
- **Frame rate:** leave **Use custom frame rate** off; OBS then matches your stream's frame rate. Only turn it on to match a
  60 fps stream if OBS runs at a different rate.
- **Shutdown source when not visible:** turn it on if the overlay is only in some of your scenes. It stops using CPU while
  hidden and reconnects in a moment when the scene shows again.
- **Refresh browser when scene becomes active:** leave it off. The overlay updates itself; reloading only adds a short gap.
- **A different overlay per scene:** turn on **General → OBS scenes**, click **Edit scenes…** and list the scenes by name: for each, **Hide the
  overlay** keeps the keys out of that scene, and **Show:** a layout draws that layout there. **Save** keeps the list. Names must match OBS's (upper and lower case don't
  matter). In OBS, right-click the Browser source, choose **Properties** and set **Page permissions** to **Read access to
  user information**, so the overlay knows the scene as soon as OBS starts; without it, it follows from the first scene
  switch on. The Browser source's box keeps one size, so a smaller layout is drawn larger to fill it. The live preview in
  the settings window always shows your chosen layout. **Pause overlay** still hides everything.
- **Hardware acceleration:** in OBS, **Settings → Advanced → Sources → Enable Browser Source Hardware Acceleration** should be
  on (it is by default). The overlay's animations are designed to run on the graphics card.

### Other streaming apps

The overlay is an ordinary web page, so any streaming app that can show one should work the same way: Streamlabs
Desktop (**Browser Source**), XSplit (**Webpage**), vMix (**Web Browser** input), Meld Studio (**Browser**), and others.
Paste the OBS URL, set the size the app shows, and leave the background transparent. Two things are OBS-only:
**General → OBS scenes** (it listens for OBS's scene changes) and the **Page permissions** setting. These apps aren't
tested by this project; if one doesn't work, [open an issue](https://github.com/nqble/keystroke-overlay/issues) naming it.

### Showing your mouse too

Keystroke Overlay shows the keyboard only. To show your mouse as well, add a mouse overlay from another program as a
second source in OBS, next to this one: for example the **input-overlay** OBS plugin, or **Zergatul.Obs.InputOverlay**.
The two don't talk to each other; each draws its own part in its own look, and you place them side by side in OBS.

Two things to know:

- **They read your input on their own terms.** Keystroke Overlay's privacy promises ([Privacy](#privacy)) cover this app
  only; check what another program does with your mouse and keys before you install it.
- **Pause both** before you type something private: **Pause overlay** here doesn't pause the other program.

## Using two PCs (game on one, OBS on the other)

Keystroke Overlay only talks to `127.0.0.1`, which means "this PC", so OBS has to run on the **same PC as the app**. If you play on
PC A and stream with OBS on PC B, you can still use it **without changing the app**: carry the OBS URL from PC B to PC A through a
private, encrypted connection that you set up yourself. Both ways below were tested on a Windows PC A and a Mac PC B over
[Tailscale](https://tailscale.com) (a private network between your own devices): a key-protected request took about 18 ms.

| | **SSH tunnel** (recommended) | **Tailscale port forward** |
|---|---|---|
| PC A (gaming PC) needs | Tailscale and an SSH server | Tailscale |
| PC B (OBS) needs | Tailscale and `ssh` (built into Windows, macOS and Linux) | Tailscale and `socat` (Mac or Linux) |
| Who can reach the app's port | Only someone who can log in to PC A | Every device on your Tailscale network (the secure link's key still protects your key presses) |
| Each time you stream | Start the tunnel in a terminal on PC B | Nothing on PC A once set up; start `socat` on PC B |

**Before either way**
- Install Tailscale on both PCs and sign in to the same account, so each PC gets a private name (this page calls them `gaming-pc`
  and `stream-pc`; the Tailscale app shows the real ones).
- On PC A, open the app: **General → Connection**, tick **Secure my OBS URL**, and press **Copy secure link**. Keep this link private.
- **If PC B runs Keystroke Overlay too,** its app already uses port 7878, so give PC A's app another port first (**General →
  Connection → Port**, for example 7880) and use that number everywhere below. A page that lights up from PC B's own keyboard is
  PC B's app, not the tunnel.

### Way 1: an SSH tunnel

An SSH tunnel is an encrypted pipe between two computers; the program `ssh` builds it, not Keystroke Overlay.

1. **Once, on PC A:** turn on an SSH server. On Windows 10/11, open PowerShell as administrator and run
   `Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0`, then `Start-Service sshd` (Windows adds the firewall rule
   itself). On a Mac: **System Settings → General → Sharing → Remote Login**. On Linux: install `openssh-server`.
2. **Each time, on PC B:** open a terminal and start the tunnel, with your user name on PC A:

   ```
   ssh -N -L 7878:127.0.0.1:7878 your-user@gaming-pc
   ```

   `-L 7878:127.0.0.1:7878` means "send anything that arrives at port 7878 on this PC to port 7878 on PC A", and `-N` means "only
   build the tunnel, don't open a shell". The first time, answer `yes` to the question about the PC's key. Leave the window open
   while you stream; closing it stops the tunnel and the overlay goes blank.
3. On PC B, add the OBS source as in [Add it to OBS](#add-it-to-obs), but paste the link you copied on PC A. It looks like
   `http://localhost:7878/?key=…`.

Things that tripped up the test: a **user name with a space** needs quotes (`"Your Name"@gaming-pc`); on Windows the password is
the **Windows account password, not a PIN**; and the local port on PC B must be free (stop anything else listening on it first).

### Way 2: Tailscale's port forward

Tailscale passes the app's port to your other devices, and `socat` on PC B makes it reachable as `localhost` again (the app only
answers requests addressed to `localhost`).

1. **Once, on PC A** (the PC that runs the app, not PC B): open a terminal and run
   `tailscale serve --bg --tcp 7878 tcp://127.0.0.1:7878`. It stays on until you run `tailscale serve reset`.
2. **Each time, on PC B:** install `socat` once (on a Mac with Homebrew: `brew install socat`), then run
   `socat TCP-LISTEN:7878,fork,bind=127.0.0.1 TCP:gaming-pc:7878` and leave the window open.
3. Add the OBS source on PC B with the link you copied, as in Way 1.

Tailscale's **HTTPS** address for a PC (`https://gaming-pc.<your-tailnet>.ts.net`, from `tailscale serve --bg 7878`) **doesn't
work**: the app refuses requests addressed to any name but `localhost`. That is on purpose; the app has no built-in network mode.

### Good to know
- **Keep both port numbers the same as PC A's app port** (**General → Connection → Port**, default 7878). The app only answers
  requests addressed to `localhost:<its port>`, so a different number on PC B would be refused.
- **Keep the secure link on.** Without it, anything that can reach the port could read your key presses. With it, the stream and
  data are refused without the private key (`?key=…`), as described in [Secure link](#secure-link-optional). If you use **Make a new
  key**, copy the new OBS URL into OBS again.
- **After changing the address or the key, reload the source in OBS** (right-click it → **Refresh cache of current page**). In the
  test, a page opened before the key was right drew the keyboard but never lit up until it was reloaded.
- **Nothing changes inside the app.** Its server still listens on `127.0.0.1` only (the SSH server or Tailscale on PC A hands the
  data over locally), and the app itself uses the network only for updates and release notes. Your key presses travel only through the
  encrypted connection you set up, between your own devices.
- **Safety of the connection is your job.** Use a normal SSH login, and let only your own devices reach PC A, for example with
  Tailscale access rules. If you set up an SSH server only for this, you can turn it off afterwards (Windows, as administrator:
  `Stop-Service sshd; Set-Service sshd -StartupType Disabled`). **Pause overlay** still works, because the pause happens on PC A.
- **Fonts come from the computer that shows the overlay.** OBS draws the overlay with the fonts installed on PC B. If the
  font you picked isn't there, it falls back to Segoe UI, then to that computer's own system font (San Francisco on a
  Mac). Pick a font both PCs have, or add a font file in **Style → Text → Add font file…**: the app hands its own fonts to OBS, so
  they look the same everywhere.
- If the overlay looks slightly ahead of or behind your video, that is normal for two PCs; a capture card adds its own delay.
- More background, and why the app does not have a built-in network mode:
  [the two-PC plan](https://github.com/nqble/keystroke-overlay/blob/9f1ac68/docs/for-claude/proposals/done/tailscale-dual-pc.md) (in git history).

## Settings

| Tab | What it does |
|---|---|
| **Layout** | Pick a keyboard, or **make your own** with **+ New layout** (up to 20), starting **Blank**, from a **Built-in** layout, **From a KLE file** (a keyboard you drew on keyboard-layout-editor.com) or, on Windows, **From a NohBoard file**. Drag the cards (or Alt+← / Alt+→) to reorder them; each card's **⋯** menu (or right-click) renames, moves, hides or deletes it (**Rename…** is for layouts you made). A card's picture shows the layout as you edited it, hidden keys left out. More keyboards (60%, 65%, 75%, 96%, ISO, Arrows, Numpad) wait under **Built-in** in the New layout popup. **Import… / Export…** share your layouts as a file. |
| **Keys** | Show or hide individual keys, give any key a custom label (e.g. Space → `⎵` or `Jump`), and **drag keys to move them** anywhere. Select several keys by dragging a box around them (or Ctrl-click; ⌘-click on a Mac), then move them together, nudge them with the arrow keys, **align** them or **space them evenly**; **Undo** and **Redo** step back through your changes. Drag the thin handles on any side of a selected key to make it **wider, narrower, taller or shorter** (or type its width and height), and drag the round handle at its top-right corner to **turn it** (or type its angle; 15° steps with Snap, in the keyboard's own shape only). **Snap** makes keys jump a quarter key, **Grid** shows faint dots, and **Hidden keys** shows or hides the keys you hid (dimmed); all three are remembered. X / Y fields give exact spots for a single key. **Layout style** switches between the keyboard's own shape and an **Even grid** (each keeps its own positions). **Close gaps** fills the holes hidden keys leave in a row: the keys to their right slide over. Edits are saved automatically **per layout**; the **Reset ▾** menu puts labels, or the whole layout, back the way the layout file has them (you can undo it). |
| **Style** | Pick a **theme**, or save your own look as a **preset**; then fine-tune colors, shape, text and size. **Text** is also where you add your own TTF / OTF / WOFF fonts, and where **Key labels** chooses between the letters your keyboard prints (**My keyboard**) and the layout file's own. |
| **Animation** | A card per animation (hover one to see it), then speed, strength and easing. |
| **General** | **Connection** (OBS URL, port, **secure link**, **First run setup**), **OBS scenes**, **Keyboard input**, **Startup**, **Pause shortcut**, **Updates**, **Appearance** (18 looks for this window, from Default to Paper and High contrast, or **+ New theme** to pick your own six colors in a bar along the bottom, which warns if text gets hard to read; **Export…** and **Import…** share a theme as a file; the overlay in OBS keeps its own look), and under **Advanced**: Debug mode, Restart server, Open data folder, **Reset all settings…** and Quit app. |

A live preview at the top of the window updates as you change things. You can click keys in the preview to test an animation. Its round buttons in the top right are **Pause** and, under it, the **eye**: point at the eye (or click it) and **Keyboard**, **Mouse** and **Controller** slide out; click one to show or hide it on the overlay. Hiding the keyboard keeps the keys you hid one by one as they were. The choice is saved for each layout. Mouse and Controller are grayed out until the app reads them.

**Debug mode (for developers).** **General → Advanced → Debug mode (for developers)** adds a **Debug** tab with a self-test, a live event log, a key monitor, a raw settings editor, test helpers and a one-click bug report. It is off by default; while on, nothing is sent anywhere, nothing is saved to disk (the self-test only creates and deletes one tiny test file to check the folder can be written), and the log never contains key presses. Details in [docs/DEBUGGING.md](DEBUGGING.md).

## Keyboard input method

Under **General → Keyboard input** you choose how the app reads your keys. You can switch any time, no restart.

| | When to use it |
|---|---|
| **Standard** (recommended, the default) | Works with nearly every game. |
| **Compatibility** (Windows Raw Input; Windows only) | Try it if keys **don't light up in one particular game**. Some games and anti-cheat tools block the standard method but not this one. It is just as light on your PC: both methods use about 0% CPU when idle. |

Both methods read keys the same way and never save or send them. If a game runs **as administrator**, start Keystroke Overlay
as administrator too — Windows doesn't let normal programs see keys typed into an elevated window, whichever method you pick.

## Secure link (optional)

Under **General → Connection** (**Secure my OBS URL**) you can choose how locked-down your OBS URL is. It is **off by default**: the link is plain
(`http://localhost:7878/`) and needs no extra step.

| | What it means |
|---|---|
| **Off (default)** | Simple link, nothing extra to do. Other programs running on your PC could read your key presses through it. |
| **On** | Your OBS URL gets a private key (`http://localhost:7878/?key=…`). Only programs with the full OBS URL can read your key presses, including other users on the same PC. Copy the new OBS URL into OBS **once** (the old one stops working). The OBS URL is hidden on screen in the app, and you should keep it off your stream. |

**Make a new key** creates a fresh key and cuts off every link made with the old one.

## Tray menu

Right-click the tray icon for quick actions without opening settings:

- **Pause overlay** — instantly hides the overlay and stops sending keys (handy when typing a password on stream). Click again to resume. You can also set a key combination for it that works from any app, even in a game: **General → Pause shortcut** (off until you set one).
- **Show** — **Keyboard**, **Mouse** and **Controller**: show or hide each on the overlay, for the current layout (the same as the eye button under the live preview's pause button). Mouse and Controller can be picked once the app reads them.
- **Layout** — switch between layouts.
- **Restart server** — restarts the overlay server if something gets stuck. OBS reconnects by itself.
- **Update available** — only appears (at the very top, with a small orange dot on the tray icon) when a newer version exists. Click it to jump to **General → Updates**.
- **Open settings**, **Copy OBS URL**, **Quit**.

## Updating

While the app runs it quietly checks GitHub about once an hour, so a new version shows up as a small **orange dot on the tray icon** and an **Update available** entry in the tray menu, even if you never open settings. In the settings window an **Update ready** chip also appears at the top right. Click it, read the notes, and choose **Update now** — **nothing is ever installed without your click**. You can also use **General → Updates → Check now** any time. On a Mac, and with the Linux .deb, new versions are a download from the Releases page instead (see [On a Mac](#on-a-mac) and [On Linux](#on-linux)).

**Update channel** (General → Updates). Version numbers look like `x.y.z`: **the middle number is Stable, the last number is Latest.**
- **Stable (recommended)** — the main, well-tested releases (the middle number goes up: 1.2.0, 1.3.0, …).
- **Latest** — every release as soon as it is published, including the small fixes in between (1.2.1, 1.2.2, …).

After an update, a **What's new** window shows the release notes once. You can reopen them anytime with **General → Updates → Release notes**.

**Using it offline.** The app never needs the internet: capturing keys, the overlay, OBS and every setting work without
it. To make sure it never goes online, turn off **General → Updates → Check automatically**; then it only contacts
GitHub when you click **Check now**, **Update now** or **Release notes**. You can also block it in your firewall. You then
update by downloading a new version from the [Releases](https://github.com/nqble/keystroke-overlay/releases) page
yourself. [PRIVACY.md](../PRIVACY.md) lists each request.

## Make your own layout

**In the app (easiest):** open the **Layout** tab and click the dashed **+ New layout** card. Give it a name and it starts as a copy of the
full-size keyboard. Then, in the **Keys** tab, hide the keys you don't want and relabel the ones you do. You can make up to **20**
layouts (a counter shows how many you've used). To remove one, open its **⋯** menu (or right-click it) and choose **Delete…**.
Built-in layouts can be hidden the same way (**Hide**) and brought back from **Built-in** in the New layout popup, which
also has more keyboards (60%, 65%, 75%, 96%, ISO, Arrows, Numpad). Drag the cards, or press **Alt+←** / **Alt+→**, to put
them in the order you like; the tray menu uses the same order.

**From a keyboard you drew on keyboard-layout-editor.com (KLE):** save it there with **Download → Download JSON**, then in
the New layout popup choose **From a KLE file** and click **Choose file…**. A popup shows the layout with its key labels,
its name (you can change it) and one line on what was found ("61 keys · 60 light up · 1 can't: Fn"); **Create layout**
makes it and opens the **Keys** tab, and **Back** returns to New layout. Keys
keep their places and sizes. Turned keys (thumb clusters, Alice-style boards) keep their angle, and
odd-shaped keys such as an ISO Enter become one rectangle. Decorations, faint "ghost" keys and the file's colors and fonts
are left out. A key the app can't link (an **Fn** key, a macro key, a blank key) is still drawn, so the board looks like
yours, but it never lights up; the popup draws these keys dashed and names them before you create the layout, and the Keys tab
calls them, for example, "Fn · can't light up" (delete one there if you'd rather not see it). The
file itself is only read: nothing is sent anywhere, and the app never opens the KLE website.

**From a NohBoard keyboard (Windows only):** NohBoard keeps each keyboard in its own folder, under the `keyboards` folder
next to `NohBoard.exe`. In the New layout popup choose **From a NohBoard file**, click **Choose file…** and pick the
`keyboard.json` in your keyboard's folder. The same review popup as for KLE shows the layout, named after its folder.
NohBoard files say which key is which, so almost every key lights up by itself; the app asks Windows what your keyboard
language is, so an AZERTY or QWERTZ keyboard links the right keys. Key places and sizes are kept, an ISO Enter becomes one
rectangle, and NohBoard's colors and fonts are left out. **Mouse buttons and the scroll wheel** are kept and drawn dashed:
they will light up by themselves once the app supports the mouse, with no need to import again. The mouse speed indicator
is left out (the app never reads where the mouse is). NohBoard is a Windows program, so the choice is only there on
Windows; on a Mac or Linux, From a KLE file works for any keyboard. The file is only read and nothing is sent anywhere.
NohBoard and the keyboards shared for it are under the GPL license; a layout you make from one is a file in your own
data folder.

**Share layouts:** in the Layout tab, **Export…** saves every layout you made (plus your hidden keys and labels) into one `.json` file, and **Import…** adds layouts from such a file. Imported layouts are checked and cleaned, they never replace a layout you already have (the copy gets its own file; its name stays the same), and they count toward the 20-layout limit.

**By hand (for full control):** a layout is a single JSON file. Put it in the app's `layouts` folder (**General → Advanced → Open data folder → layouts**) and restart the app.

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
the long version, with the ways to check every line, is in **[PRIVACY.md](../PRIVACY.md)**.

### What the app can see
Every key you press or release on this PC **while it is running** — in games, chats, and password boxes too. That is how every
keystroke-display tool works (it is the only way to show keys while a game has focus). It records only *which key* and *down or
up* (for example `W`, down). It does **not** build up the text you type, and it keeps **no history**: it remembers only which
keys are held *right now*, so a key can never look stuck. Use **Pause overlay** before typing anything private on stream.

### Where your keystrokes go
```
your keyboard → your system → Keystroke Overlay (in memory) → a web page on YOUR PC (127.0.0.1) → OBS on your PC
```
Every step happens on your computer, in memory. The moment a key is released, the event is gone.

### What is saved on your PC
Only things you chose, in the app's data folder (`%APPDATA%\com.keyoverlay.app\` on Windows, `~/Library/Application Support/com.keyoverlay.app` on a Mac, `~/.local/share/com.keyoverlay.app` on Linux; **General → Advanced → Open data folder**): your settings (style, layout, hidden keys, labels, port,
preferences), presets, fonts, and layouts you added; a backup of your previous settings, and a copy kept if you go back to an older
version; if the app ever crashes, a one-line note of where (read and deleted
at the next start). **Nothing in there contains keystrokes.** Uninstall and delete that folder to
remove everything.

### What touches the internet
Exactly three things, all with GitHub, all optional or user-triggered, and none of them involve your keys or settings:

| What | When | What is sent |
|---|---|---|
| **Update check** | When you click *Check now*, or — if you leave *Check automatically* on — about once an hour while the app is running (and when the settings window opens). Turn that setting off and the app **never** checks by itself. | An ordinary web request for a small file (`latest.json` / `stable.json`). GitHub sees your IP address, the time, and the updater library's name and version. |
| **Update download** | Only after you click *Update now*. The file is verified against a signing key built into the app; anything that doesn't match is rejected and never run. | An ordinary file download. |
| **Release notes** | When the *What's new* window or *Release notes* opens. | An ordinary request for one version's notes. |

There is no account, no user ID, no device ID, no cookies, no analytics, no telemetry, no crash reporting, no ads. If you never
use updates you can block the app in your firewall and everything else keeps working.

### What it never does
- never writes keystrokes to a file, log, cache or history
- never sends keystrokes (or settings) over the network, to us or anyone
- never accepts connections from other computers: the overlay server listens on `127.0.0.1` only, and it also refuses requests coming from web pages
- never takes screenshots, reads your clipboard, or reads other programs' contents (it never reads the clipboard; it only writes to it when you press a Copy button, such as *Copy OBS URL* or *Copy secure link*)

### Limits, stated plainly
- The app can see **every** key while it runs, including in password boxes. That is inherent to the job, so use **Pause overlay**.
- The local overlay server does **not** authenticate other *programs* on the same PC, including other users logged in at the
  same time. A program already running as you could receive key events from it (though it could also install its own keyboard hook).
  You can close this gap with the optional **Secure link** (General → Connection → Secure my OBS URL): your OBS URL then carries a private key and
  the app refuses everything without it. It is off by default, so the link stays simple, and turning it on means pasting the new link into OBS once.
- Three components are outside our control: the system's web view that draws the settings window (**Microsoft Edge WebView2** on Windows,
  where Microsoft's diagnostic-data settings apply to it; WKWebView on a Mac; WebKitGTK on Linux), **OBS**, and the
  operating system itself.

### Don't trust — verify
- **Read the code.** It's small, and the network code is in exactly one file (`src-tauri/src/commands/updates.rs`).
- **Watch it.** With the app running, `netstat -ano | findstr <its process id>` on Windows, `lsof -iTCP -a -p <pid>` on a Mac or `ss -tlnp` on Linux shows one listening socket on `127.0.0.1` and nothing else.
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
  More in [SECURITY.md](../SECURITY.md).

## On a Mac

The Mac version needs macOS 11 or newer (the app is built for that), and has only been tried on the newest macOS (26), on an Apple
Silicon MacBook Air (M1). From v2.0 each release has an Apple Silicon download on the Releases page; you can also build the app yourself (the steps are in the [README](../README.md#building-from-source)). How it works and what has been tested: [MAC-PORT.md](MAC-PORT.md).

- **Where it lives.** In the menu bar. Click its icon and choose **Open settings**, or open the app again from Finder or
  Launchpad. While the settings window is open, the app also shows in the Dock.
- **Closing and quitting.** ⌘W and the red button close the window to the menu bar; the app keeps running. The yellow
  button minimizes it into the Dock. ⌘Q quits it.
- **Open at login.** When the app starts by itself at login, it stays in the menu bar and doesn't open the settings window, even with **Open this window on launch** on. Click the menu-bar icon and choose **Open settings** when you want it.
- **Opening the download the first time.** The download is signed ad hoc, not notarized, so macOS blocks its first launch. Open it once, then go to System Settings → Privacy & Security and click **Open Anyway** next to Keystroke Overlay. An app you built yourself isn't blocked.
- **First launch: allow keyboard access.** macOS won't give an app your key presses until you say yes. In the settings
  window, click **Allow keyboard access** (the blue bar under the header). In System Settings → Privacy & Security →
  **Input Monitoring**, switch on Keystroke Overlay. Come back to the app and click **Restart now**. Your keys now light
  up. The blue bar only shows while keys are not being captured.
- **After you update or rebuild the app.** macOS ties the permission to the exact build, so a new build needs it again,
  even though the old entry still looks switched on. If keys stop lighting up, clear the old entry in Terminal:
  `tccutil reset ListenEvent com.keyoverlay.app`. Then click **Allow keyboard access** in the app, switch Keystroke
  Overlay on in the list that opens, and click **Restart now**. If Keystroke Overlay is not in that list (macOS sometimes
  leaves it out after the reset), click the **+** under the list, press ⌘⇧G, paste the folder the app is in, choose
  Keystroke Overlay and switch it on. (Switching the old entry off and on, or removing it
  with the minus button, was not enough in testing.)
- **The F row.** On a Mac laptop, F1 to F12 only light up while you hold **Fn**. Without it they are brightness and volume
  keys, which macOS doesn't send as F keys.
- **Key names.** The overlay shows your own keyboard's names: ⌘ ⌥ ⌃, **delete** and **return**. To use the layout file's
  names instead, set **Style → Text → Key labels** to **Layout file**.
- **Passwords.** While a password box has focus, macOS blocks key capture on purpose, so passwords can never reach the
  overlay. If the app says capture is blocked and it doesn't clear, lock and unlock the screen, or quit the app that is
  holding it.
- **Where your settings live.** In `~/Library/Application Support/com.keyoverlay.app` (settings, layouts, presets and
  fonts). **General → Advanced → Open data folder** opens it.
- **Uninstall.** Turn off **Open at login** first if you turned it on. Quit the app from its menu-bar icon, delete
  Keystroke Overlay, and delete the data folder above if you want your settings gone too. To remove its keyboard
  permission, run `tccutil reset ListenEvent com.keyoverlay.app` in Terminal.
- **Updates.** The app can't install updates on a Mac yet. **General → Updates → Check now** tells you to get new versions from the Releases page.
- **If the build stops** with a linker error that says "malformed file" or "unknown architecture", your Xcode Command Line
  Tools are older than your newest macOS SDK. Update them in System Settings → Software Update, then build again.
- **Running with `npm run dev`.** macOS may then ask for Input Monitoring for the program that started it, such as
  Terminal, instead of for Keystroke Overlay.

## On Linux

The Linux version is early (v2.0 and later). Each release has two downloads for 64-bit PCs: the **AppImage** (one file
for most distributions: make it executable and open it) and the **.deb** for Debian and Ubuntu. The AppImage
updates itself in the app, like the Windows version; a copy installed from the .deb doesn't (it tells you so when you
check for updates): download each new version of it. The plan and what has been tested: [LINUX-PORT.md](LINUX-PORT.md).

- **X11 desktops** need nothing more: keys show straight away.
- **Wayland desktops** (the default on recent Ubuntu, Fedora and others) don't let one app see another app's keys, so
  Keystroke Overlay reads the keyboards directly. That needs the `input` group, and the app shows how under the header:
  run `sudo usermod -aG input $USER`, then log out and back in. Be aware that **every program you run can then read the
  keyboards**, not just this one ([PRIVACY.md](../PRIVACY.md)). To undo it: `sudo gpasswd -d $USER input`.
- **The tray icon** needs a desktop that shows tray icons (GNOME needs the "AppIndicator" extension).
- A keyboard plugged in while the app runs is picked up after a restart of the app.

## Troubleshooting

- **OBS source is blank:** make sure the app is running (tray icon) and the URL in OBS matches the port in settings. Right-click the source in OBS and choose **Refresh cache of current page**.
- **OBS runs on a different PC from the game:** the OBS URL only works on the PC that runs the app. See [Using two PCs](#using-two-pcs-game-on-one-obs-on-the-other).
- **A scene rule does nothing:** the name in **General → OBS scenes** must match the scene's name in OBS exactly
  (upper and lower case don't matter; spaces do). If you renamed the scene in OBS, rename it in the app too: the app
  can't see OBS's list of scenes. If the rule only works after you switch scenes once, set the Browser source's **Page
  permissions** to **Read access to user information** (right-click the source → **Properties**).
- **"Port already in use" message:** another program is using that port. Pick a different one in **General → Connection → Port** (then **Apply**), then update the URL in OBS.
- **Keys don't light up in a certain game:** (1) if the game runs **as administrator**, start Keystroke Overlay as administrator too (Windows blocks normal programs from seeing keys typed into elevated windows); (2) otherwise switch **General → Keyboard input** to **Compatibility** — some games and anti-cheat tools block the standard method but not that one. Still nothing? Check [the games tested so far](GAMES.md), then open an issue naming the game and its anti-cheat.
- **Your antivirus flags the app** (for example, Windows Security names it `Trojan:Win32/Bearfoos.A!ml` and removes it):
  a program that reads every key press and starts with Windows looks like a keylogger to antivirus tools, so a new,
  unsigned version is sometimes flagged by mistake. The `!ml` in a Windows Security name means its machine-learning model
  guessed; it did not recognize known malware. Still, only the antivirus maker can say a detection is wrong. What to do:
  1. [Open an issue](https://github.com/nqble/keystroke-overlay/issues) naming the antivirus, the detection name and
     the file you downloaded. Each flagged release is sent to the antivirus maker for a second look
     (docs/RELEASING.md), and the issue says when it has been cleared; the warning then goes away with the antivirus's
     normal updates.
  2. Check that your copy is official: it must come from this project's
     [Releases](https://github.com/nqble/keystroke-overlay/releases) page. Each download there shows its SHA-256
     fingerprint; compare it with `Get-FileHash <the file>` in PowerShell. A match proves the file is the one this
     project published, not that the antivirus is wrong.
  3. Restoring it (**Windows Security → Virus & threat protection → Protection history**, the entry, **Actions →
     Restore**) is your decision. If you're unsure, wait for the issue to say the detection was cleared, or build the
     app yourself from the source.

  Don't turn your antivirus off for the app, and don't add an exclusion for a copy you didn't check. A **SmartScreen**
  warning ("Windows protected your PC") is not a detection: it only means the download isn't signed yet.
- **Reporting a bug:** turn on **General → Advanced → Debug mode**, open the new **Debug** tab and press **Copy bug report**, then paste it into your GitHub issue. It has no key presses and no personal paths.
- **Something is badly misconfigured:** **General → Advanced → Reset all settings…** puts every option back to its default (your layouts, presets, fonts, port and secure link are kept).
- **Overlay looks small or has empty space around it in OBS:** set the source's width and height to the size the app
  shows. The keyboard always fits inside the box, so a box of another shape leaves space at the sides.

## Requirements

Windows 10 or 11 (64-bit) with Microsoft Edge WebView2, which is already included in current Windows 10 and 11. On a Mac, see [On a Mac](#on-a-mac); on Linux, [On Linux](#on-linux).
