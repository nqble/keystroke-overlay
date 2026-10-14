# Changelog

All notable changes. Newest first. Written to be read, see [docs/RELEASE-NOTES-STYLE.md](docs/RELEASE-NOTES-STYLE.md).

## v1.2.0 — the first Stable release *(unreleased)*

**✨ New**
- **Keyboard input method:** General → Keyboard input lets you pick **Standard** (what the app always used) or **Compatibility** (Windows Raw Input). If keys don't light up in one particular game, try Compatibility. You can switch live, no restart.
- **Secure link (optional):** a new toggle in General → Secure link. Off by default, so your OBS link stays simple. Turn it on and the link carries a private key, so only a program that knows the full link can read your key presses. Paste the new link into OBS once. Hit "Make a new key" to cut off old links.
- **Update button:** a little green circle appears in the corner when a new version is out. Click it, read the notes, hit **Update now**. It never installs behind your back.
- **Stable or Latest:** pick your pace in General → Program updates. **Stable** gets the main releases (1.2.0, 1.3.0…) and is recommended; **Latest** also gets every small fix in between (1.2.1…).
- **Automatic update check:** on by default, one click to turn off. It only peeks at GitHub, at most once every 6 hours.

**🛠 Improved**
- **Instant, dark startup:** the settings window used to flash white like a camera. Now it opens dark, and the controls are drawn and usable in about 0.7 s.
- **These very notes:** three loading dots, then a quick typing animation. Fancy, and under a second.
- **Tidier popups:** long release notes now scroll inside the popup, with breathing room around the text.
- **Lighter on your PC:** background threads went from 23 to 9 and idle memory dropped, so your game keeps more of your PC.
- **Fewer web requests:** the overlay now gets new settings in the same message that announces them, instead of going back to ask.

**🐛 Fixed**
- **Stuck-key check** now only looks at the keys you're actually holding, instead of scanning every possible key on every press.
- **Pause key** no longer shares a slot with Ctrl, so holding Ctrl can't swallow it.

## v1.1.2 — the "quick actions" update

**✨ New**
- **Tray quick actions:** right-click the tray icon to **pause the overlay** (handy when typing a password on stream), **switch layout**, or **restart the server**.
- **Per-layout key edits:** hidden keys and custom labels are now saved separately for each layout. Switch away and back and your edits are still there.
- **Revert to Default:** one button in the Keys tab undoes your edits for the current layout (it asks you to click twice, so no accidents).
- **Update progress bar:** watch the download instead of wondering.
- **What's new window:** after an update, the release notes pop up once. Click **OK** and carry on.

**🛠 Improved**
- **Version and release notes** now live in General → Program updates.

**🐛 Fixed**
- **Settings backup:** if the settings file ever gets corrupted, the app restores the last good copy by itself.
- **Port already in use:** you now get a clear message and the settings window opens, instead of a silently dead overlay.
- **Instant saving:** toggles save immediately, and anything pending is saved before an update.

## v1.1.1 — the tiny update with a job

**✨ New**
- **Version number** in the settings header. Small, but it proved in-app updating works.

## v1.1.0 — the "updates come to you" update

**✨ New**
- **In-app updates:** General → Program updates checks GitHub, downloads, verifies and installs. Updates that can't be done in-app point you to the installer instead.
- **TSB layout:** a compact four-number-plus-WASD layout.
- **Tray app with a keystroke overlay for OBS:** global keyboard hook, transparent overlay at `http://localhost:7878/`, staggered real-keyboard layouts, live-editable styles, animations (press down, glow, fade, bounce, scale), custom fonts, presets, and a settings window that vanishes completely when closed.
