# Changelog

All notable changes. Newest first.

## v1.3.0 — free key placement

**✨ New**
- **Place keys anywhere.** In the Keys tab, drag any key to a new spot, for every layout (including the built-in ones). The live preview and OBS follow straight away, and the overlay window shrinks to fit a compact layout. **Reset positions** puts everything back.
- **Work with several keys at once.** Drag a box around keys (or Ctrl-click them), then move them together, nudge them with the arrow buttons, **align** them (left, centre, right, top, middle, bottom) or **space them evenly** across or down.
- **Undo and Redo** for every change to a layout's keys (moves, aligns, hidden keys, labels), up to 50 steps.
- **Snap and grid.** Choose how far keys jump while you drag (off, quarter, half or whole key) and show a grid. Your choice is remembered. A small label shows the exact position while you drag, and a line under the keyboard shows the selected key and how many keys are moved.
- **Keyboard shortcuts** on the Keys tab: arrow keys nudge (Shift = a whole key), **Delete** hides the selected keys, **Ctrl+Z** undoes, **Ctrl+Shift+Z** (or Ctrl+Y) redoes, **Ctrl+A** selects every key and **Esc** clears the selection. They never act while you are typing in a field.
- **Tidy up** closes the gaps left by hidden keys while keeping the keyboard's shape.
- **Easier to use without a mouse:** every key on the picture can be reached with Tab and selected with Enter, with clear focus outlines and spoken names for screen readers.
- **Overlap warning:** keys that sit on top of each other get a red outline.

**⚡ Performance — v1.3.0 vs v1.2.1**
- No slowdown: opens in about the same time (487 ms), 0% CPU at idle, the same 9 background threads, the same idle memory (3 MB) and settings-window memory (about 194 MB).

**🧰 Under the hood**
- Your saved key edits move to a new, roomier format (it also prepares for resizing keys and a new layout style in a later version). Your existing settings are converted automatically, and nothing is lost.
- The settings window's code is split into small files and formatted automatically, and there are many more tests.
- Updated the Windows library the keyboard capture is built on, and the build tools used by the project's automatic checks.

Your settings, presets and fonts are kept.

## v1.2.1 — the "preview keeps up" fix

**🐛 Fixed**
- **The live preview now keeps up with your custom layouts.** Make a layout, hide some keys, and the preview updates the moment you do. Before, it kept drawing a built-in layout until you closed and reopened the window, and OBS had the same blind spot until you refreshed the source. Creating, deleting or importing a layout now refreshes the overlay straight away, and the overlay re-checks by itself if it ever meets a layout it doesn't know.

## v1.2.0 — the first Stable release

**⚡ Performance — v1.2.0 vs v1.1.2**
- **18% faster** to open (436 ms vs 533 ms)
- **61% fewer** background threads (9 vs 23)
- **24% less** idle memory (2.9 MB vs 3.8 MB)
- **11% less** memory with the settings window open (342 MB vs 385 MB)

**✨ New**
- **Make your own layouts:** click the dashed **+** card in the Layout tab, name it, and it starts as the full-size keyboard. Then hide the keys you don't want in the Keys tab. You can have up to 20 (a counter shows how many you've used). Right-click a layout you made to delete it.
- **Share layouts:** Layout tab → **Export layouts** saves everything you made (with your hidden keys and labels) to one file, and **Import layouts** adds layouts from a file a friend sent you. Bad or oversized files are cleaned up or skipped, never trusted.
- **Reset all settings:** General → App → **Reset all settings…** puts every option back to its default after one confirmation. Your layouts, presets, fonts and port are kept.
- **More fonts, easier to pick:** Style → Font family is now a dropdown of 23 Windows fonts (each shown in its own font) plus your own added fonts, with an "Other" option to type any name.
- **Debug mode (for tinkerers):** General → App → Debug mode adds a Debug tab with a one-click self-test, an event log, a key monitor and a "copy bug report" button. It's off by default, lives in memory only, and never records which keys you press.
- **Keyboard input method:** General → Keyboard input lets you pick **Standard** (what the app always used) or **Compatibility** (Windows Raw Input). If keys don't light up in one particular game, try Compatibility. You can switch live, no restart.
- **Secure link (optional):** a new toggle in General → Secure link. Off by default, so your OBS link stays simple. Turn it on and the link carries a private key, so only a program that knows the full link can read your key presses. Paste the new link into OBS once. Hit "Make a new key" to cut off old links.
- **Update dot in the tray:** when a new version is out, the tray icon gets a small orange dot and the right-click menu gets **Update available** at the very top. Click it to jump straight to General → Program updates.
- **Update button:** a little accent-coloured circle appears in the corner when a new version is out. Click it, read the notes, hit **Update now**. It never installs behind your back.
- **Stable or Latest:** pick your pace in General → Program updates. **Stable** gets the main releases (1.2.0, 1.3.0…) and is recommended; **Latest** also gets every small fix in between (1.2.1…).
- **Automatic update check:** on by default, one click to turn off. It only peeks at GitHub, about once an hour while the app runs.
- **Sliders go all the way to zero:** opacity, animation intensity and font size can hit 0 on purpose (no border, no movement, no text. Your call).

**🛠 Improved**
- **Instant, dark startup:** the settings window used to flash white like a camera. Now it opens dark, and the controls are drawn and usable in under half a second.
- **Logo in the header:** the program's icon now sits next to its name.
- **Keys tab fits:** the whole keyboard now scales to the window, so there's no scrolling inside the box.
- **Matching Import / Export buttons:** Layout and Style now share the same buttons, labels and spot.
- **No blue box on sliders:** clicking a slider no longer draws an outline around it.
- **TSB layout retired:** it's no longer built in. If you had it selected, the app switches you to Tenkeyless. Make your own with the **+** card.
- **Tougher security:** the settings window now runs under a strict content-security policy, thousands of deliberately broken settings and layout files are thrown at the app on every test run, and GitHub has manual scans for known library problems and code bugs.
- **Our own window buttons:** the native Windows title bar is gone. Minimize, maximize and close now live in the header's top right, and you can drag the window by the header.
- **No animation by default:** fresh installs (and "Reset all settings") start with the animation set to None, so keys just light up. Pick any animation in the Animation tab. Your current choice is kept.
- **Cleaner, roomier settings:** a bit more breathing room between sections, and General is now in a sensible order: OBS, Server, Secure link, Keyboard input, App, then Updates.
- **Feels like a real app:** only text boxes can be selected, and right-click shows a small custom menu instead of the browser's. The live preview no longer carries a hint caption.
- **One popup style everywhere:** release notes, updates, new layouts and warnings all look and behave the same.
- **These very notes:** three loading dots, then a quick typing animation. Fancy, and under a second.
- **Tidier popups:** long release notes now scroll inside the popup, with breathing room around the text.
- **Fewer web requests:** the overlay now gets new settings in the same message that announces them, instead of going back to ask.

**🐛 Fixed**
- **Keys didn't show while the settings window was in front:** the preview (and OBS) went blind whenever you clicked the app. Fixed. Keys light up whether or not the window has focus.
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
