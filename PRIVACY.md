# Privacy

Keystroke Overlay shows your key presses on stream, so it has to watch your keyboard. That is a sensitive
thing for software to do, so this page says **exactly** what the app does with that access, what it never does,
and how you can check every claim yourself instead of trusting it.

*Applies to v1.1 and later. Last reviewed: 2026-10-14.*

## The short version

| | |
|---|---|
| Keystrokes are **never written to disk** | No file, log, history or cache ever contains what you typed. |
| Keystrokes are **never sent over the internet** | The only place they go is a local web page on **your own PC**, which OBS reads. |
| **No telemetry, analytics, crash reports, accounts or ads** | The app has no code for any of them. |
| The overlay server listens on **127.0.0.1 only** | It cannot be reached from another computer or from the network. |
| The only internet contact is **GitHub, for updates and release notes** | Never keystrokes, never your settings, never anything that identifies you beyond the normal facts of an HTTPS request (see below). |

## What the app can see

While it is running, the app can see **every key you press or release on this computer, in any program** — including
games, password boxes and private chats. That is unavoidable: the Windows keyboard hook (or, if you choose the Compatibility input method, Windows Raw Input) that makes the overlay work in
games sees all keys, exactly like any other keystroke-display tool.

What it records about each event is only *which physical key* and *down or up* (for example `KeyW`, down). It does not
build up the text you type, and it keeps no history: it remembers only which keys are held **right now** so a key can
never look stuck.

From v2.0, so key labels can follow your keyboard language, the app asks the system **which keyboard layout is in
use** (for example French AZERTY) and which character each letter key prints on it. It asks at start-up and again when
the layout may have changed: when you switch layout (macOS and Linux tell the app), when another window comes to the
front, or just after you let go of Shift, Alt, Ctrl or Win (on Windows, where a switch inside one window isn't
announced). For that last one it only notes that a modifier key was released, never which other keys you typed. The
layout is a fact about the keyboard, not about anything you type, and it stays in memory.

From v2.0 you can also set a **pause shortcut** (General → Pause shortcut, off by default). The app then asks Windows
to tell it about that one key combination only; it sees no other key that way, and registers nothing while the
shortcut is off. The check in `tools/check-privacy.mjs` makes sure shortcuts are registered only in `hotkeys.rs`.

Use **Pause overlay** (tray menu) whenever you are about to type something private on stream. While paused, the app
forwards nothing at all.

## Where keystrokes go

```
keyboard  ->  Windows keyboard hook (or Raw Input)  ->  memory  ->  local web server (127.0.0.1)  ->  the overlay page in OBS
```

Every step happens on your PC, in memory. When the key is released the event is gone. There is no step that writes
to disk and no step that uses the network.

### The two input methods (General → Keyboard input)

- **Standard** reads keys through a Windows *keyboard hook*. **Compatibility** reads them through Windows *Raw Input*.
- They differ only in *how Windows hands the key events to the app*. Both see the same keys, record the same two facts
  (which key, down or up), keep nothing, and send nothing anywhere except the local overlay page. Choosing one over the other
  changes nothing about your privacy.
- **On Linux** (X11 desktops, still in development), Standard reads keys through X11's *XInput2 raw key events* instead. It
  works the same way: listen-only, the same two facts per key, kept only in memory, sent only to the local overlay page. Any
  program on an X11 desktop can listen this way; the app doesn't gain a power others don't already have
  ([docs/LINUX-PORT.md](docs/LINUX-PORT.md)).
- **On macOS** (in development), Standard reads keys through a *listen-only event tap*. It gets a copy of each key event and
  can never change, block or send keys. It records the same two facts per key (which key, down or up), keeps them only in
  memory, and sends them only to the local overlay page. Because it is listen-only, macOS asks for **Input Monitoring**
  and nothing broader: the app is not given the Accessibility permission, which would allow controlling other apps.
  You switch it on yourself in System Settings > Privacy & Security > Input Monitoring, and can switch it off there at any
  time. `npm run check:privacy` fails if the code ever creates a tap that is not listen-only.
- **Passwords on macOS can't reach the overlay.** While a password field has focus, macOS turns on *Secure Event Input*,
  which stops every event tap, this app's included. The overlay simply shows nothing during that time. The app only asks
  macOS whether Secure Input is on, to explain why keys are missing; it never sees what is typed
  ([docs/MAC-PORT.md](docs/MAC-PORT.md)).

## What is stored on disk

Only things you chose, in `%APPDATA%\com.keyoverlay.app\` (and the web view's normal cache in `%LOCALAPPDATA%`):

- `settings.json` (+ `settings.json.bak`, the previous copy): your style, layout choices, hidden keys, custom labels, port, preferences
- from v1.4.0: `settings.vN.json`, a copy kept if the settings were written by a newer version of the app (you went back
  a version). When you go forward to that version again, its settings are put back and the copy is deleted. This works
  between versions from v1.4.0 on; going back to v1.3.0 or earlier still loses the newer settings
- `presets/`, `fonts/`, `layouts/`: files you created or added
- from v1.4.0, only if the app crashes: `crash-note.txt`, one line saying which version crashed, where in the app's code
  and how long after starting (never the crash message, never a key). The next start reads it into the event log and
  deletes it
- the app's installed files

Nothing in there contains keystrokes. To remove everything: uninstall, then delete that folder.

**The event log.** The app keeps a short event log **in memory only**, so a bug report can say what happened: what the
app did (the server started, keyboard input failed, an update check ran), never which keys were pressed. At all times it
holds the last 100 important events; it is never written to disk, never sent anywhere, and gone when the app closes.

**Debug mode** (off by default; General → App) adds a developer tab, and the event log then also records everyday steps
(the last 300 lines; turning Debug mode off forgets them). Nothing is written to disk (apart from the self-test's empty test file, created and deleted at once), and nothing is sent anywhere. Its optional Key monitor shows key presses in the settings window only, for at most 60 seconds, only after you press Start. See [docs/DEBUGGING.md](docs/DEBUGGING.md).

## When the app talks to the internet

Exactly three things, all with `github.com` / `api.github.com`, and all visible in the settings window:

1. **Update check** — fetches a small manifest file (`latest.json` or `stable.json`) from this project's GitHub releases.
   Runs when you click *Check for updates*, and — if you leave *Check for updates automatically* on — 45 seconds after the app
   starts, then about once an hour while it runs (and when the settings window opens). The setting is on by default;
   turn it off and the app **never** checks by itself.
2. **Update download** — only after you click *Update now*. The download is verified against a signing key built into
   the app; a file that does not match is rejected and never run.
3. **Release notes** — the "What's new" window / *View release notes* fetches the notes for one version from
   `api.github.com`.

What GitHub can see in those requests is what any website can see: your **IP address**, the time, and a user-agent
that names the app and its version (for example `tauri-plugin-updater/2.x`). The app sends **no** user ID, device ID,
settings or keystrokes, and sets no cookies. GitHub's own privacy statement governs what GitHub does with its logs.

If you never use updates, you can block the app in your firewall and everything else keeps working.

## The one limit you should know about

The local server only accepts connections from this computer, and it refuses requests that come from websites
(it checks the `Host` and `Origin` headers, so a web page cannot open a connection to it). But it does **not
authenticate** other *programs* on the same computer. So:

- A program already running on your PC, as you, could connect to the overlay port and receive key events. (Such a
  program could also install its own keyboard hook, so this does not give it a power it did not already have.)
- On a PC where **other people are logged in at the same time** (Windows fast user switching, shared or terminal
  servers), their programs could connect to your port too.

If that matters to you: use *Pause overlay*, use the app only on a PC you alone use, or turn on the optional **Secure link** (General → Secure link). With it on, your OBS link carries a private key and the
server refuses every data request and the key-press stream without it, so other programs and other Windows users can't listen in.
It is off by default (the link stays simple); turning it on means pasting the new link into OBS once, and "Make a new key"
cuts off old links. The overlay's own public page and scripts stay open because they contain nothing private, and the key itself is
never sent to the overlay. The key is part of the link, so it is stored wherever the link is: in OBS's scene files, and
anywhere you paste it. Treat the link like a password, keep it off your stream, and use "Make a new key" if it got out.

## Things outside this app's control

- **Microsoft Edge WebView2** draws the settings window. It is a Microsoft component; Microsoft's diagnostic-data
  settings in Windows apply to it. The settings window only ever loads this app's own local pages.
- **OBS Studio** (or whatever browser source you use) renders the overlay. Its behaviour is its own.
- **Windows** itself, and any other software on your PC.

## How to check it yourself

You do not have to take our word for any of this.

1. **Read the code.** It is small. These searches in `src-tauri/src/` show everything:
   - network access: `grep -rnE "reqwest|updater_builder|TcpStream|UdpSocket" src-tauri/src` → only `commands/updates.rs`
   - servers: `grep -rnE "bind\(|TcpListener" src-tauri/src` → only `server.rs`, bound to `127.0.0.1`
   - disk writes: `grep -rnE "fs::write|fs::copy|File::create|OpenOptions" src-tauri/src` → only settings, presets, fonts, layouts, files you export (to a place you pick), and the Debug self-test's empty
     `.write-test` file, created and deleted at once
     (never the keyboard or server code)
   - logging: `grep -rnE "println!|eprintln!|dbg!|log::" src-tauri/src` → nothing
2. **Watch its sockets.** With the app running, `netstat -ano | findstr <its process id>` shows one listening socket on
   `127.0.0.1` and nothing else (the process id is in Task Manager). The only outward connections are the update check and download
   above: with *Check for updates automatically* on (the default), the first one comes about 45 seconds after start.
3. **Block it.** Add a firewall rule blocking the app's outbound traffic: the overlay keeps working, only updates stop.
4. **Watch the disk.** Process Monitor (Microsoft Sysinternals) filtered to the app shows writes only inside its data folder.
5. **Build it yourself.** See [CONTRIBUTING.md](CONTRIBUTING.md) — compile from source and compare behaviour.

## Reporting a problem

Think you found a privacy or security problem? Please use GitHub's private vulnerability reporting on this repository
(Security tab → *Report a vulnerability*) rather than a public issue. See [SECURITY.md](SECURITY.md).
