# Changelog

All notable changes. Newest first. Performance numbers compare each release with the one before, measured in the same
run of `tests/bench/run.mjs` on one PC; numbers from different entries come from different runs and aren't comparable.

## v2.0.0 — Keystroke Overlay 2.0

**This is the release the app has been building toward.** Version 2.0 is a new Keystroke Overlay: a settings window redesigned from the ground up, downloads for Windows, Mac and Linux, a key editor that does what you expect, and many small touches that make it feel finished. It is still private by design (your key presses never leave your PC) and still uses next to nothing while you stream. If you tried an earlier version, now is the time to take another look.

### ✨ New
- **Mac and Linux downloads.** Every release now has an Apple Silicon app for macOS 11 and newer, and an AppImage and a .deb for Linux. On a Mac it lives in the menu bar, asks for keyboard access once (and again after each update), and Command+W and Command+Q work as you'd expect. On Linux it captures keys on X11 desktops, and on Wayland for users in the `input` group.
- **A new settings window.** Every tab has been redesigned: layout cards you can reorder and hide, a theme gallery and preset cards on the Style tab (with Fonts now part of it), animation cards that play their own animation when you point at them, and General in tidy section cards.
- **Eight more built-in layouts:** 60%, 65%, 75%, 96%, full-size ISO, TKL ISO, Arrows and Numpad, under **Other layouts** in the New layout popup.
- **A first-run setup** walks new users through adding the overlay to OBS.
- **Import a keyboard from KLE.** Drew your board on keyboard-layout-editor.com? **+ New layout → From a KLE file** turns it into a layout with the same keys, places and sizes, and links each key by its label. Keys the computer never sees, like Fn, stay on the board, drawn dashed in the preview so you know before you create it.
- **New layout has three ways to start:** Blank, Built-in, or From a KLE file.
- **OBS scene rules.** Hide the overlay, or show a different layout, in the OBS scenes you choose (**General → OBS scenes → Edit scenes…**). Off until you turn it on.
- **A pause shortcut** that works from any app, even in a game (**General → Pause shortcut**). Off until you set one.
- **Key labels follow your keyboard language,** live, on Windows, Mac and Linux, so an AZERTY or QWERTZ keyboard shows its own letters.
- **The header always shows where you stand:** Live in OBS, Paused or Not connected, and a red warning when the port is taken or the OBS URL has changed. **Copy OBS URL** is always at the top right, and the live preview has its own round pause button.
- **In-app updates on Linux** for the AppImage. (A copy installed from the .deb says where to get new versions instead.)
- **Trackpad support** in the key editor: two-finger panning, pinch to zoom, and Space + drag. Zoom now goes to 300%.
- **Cleaner cards:** every card is one size and shows just its name; a small dot marks a layout you customized.

### 🛠 Improved
- **Shorter, plainer wording** everywhere, with each system's own words (tray or menu bar, Ctrl or ⌘, Start with Windows or Open at login).
- **One look for every popup,** with the same size rules and soft fades on every scrolling area.
- **New app icon:** the keycap logo, on every system.
- **A clearer user guide:** two tested ways to use two PCs (an SSH tunnel, or Tailscale's port forward), other streaming apps (Streamlabs, XSplit, vMix, Meld), and using the app fully offline.

### 🐛 Fixed
- **Going back to v1.4.0 no longer loses v2.0's settings:** v2.0 saves a newer settings version, so v1.4.0 keeps a copy first.
- **No background wake-ups on Linux** when no pause shortcut is set.
- **The overlay redraws its keys when their letters change.**
- **The locked notice in the overlay** names the right place for the secure link.
- **The key editor's view stays where you leave it:** editing, Undo, and switching layout style no longer move it.
- **Close gaps fills the holes hidden keys leave in a row,** and changes nothing else: an untouched layout stays as it is, and keys no longer look selected afterwards.
- **The Grid switch** no longer moves the board or changes the key font.
- **The glow is no longer cut off** at the edge of the overlay. The overlay's suggested size in OBS grows a little (about 16 px each side at the default glow), so in a fixed-size source the keyboard gets very slightly smaller.
- **The Style tab's color boxes** keep their size in a narrow window.
- **Animation and theme cards** always come in the same order.

### ⚡ Performance — v2.0.0 vs v1.4.0
- **Just as fast:** a key press reaches the app in 0.27 ms (median; 0.26 ms in v1.4.0), and none are missed.
- **Still idle when idle:** 0% CPU and about 3 MB of memory with only the tray icon (on a Mac, 0.0% CPU in the menu bar).
- **Lighter under load:** 0.3% CPU while 8,000 keys are pressed fast (0.6% in v1.4.0).
- **The new settings window costs a little:** it opens in 440 ms (397 ms), and uses about 25 MB more while open. It still closes completely when you close it.
- Measured with `tests/bench/run.mjs` on the same Windows PC, 5 rounds each, 2026-10-24.

### 🧰 Under the hood
- The settings window is built with Preact (small, pinned and fingerprint-checked; still no build step), one component per tab.
- The privacy check also catches WebSocket clients and any way a macOS event tap could do more than listen.
- A UI sandbox runs the settings window in a browser with a fake app, for designing and testing screens.
- CI builds and tests Windows, macOS and Linux (X11 and Wayland) on every change.

## v1.4.0 — the new key editor

### ✨ New
- **A new key editor on the Keys tab.** The keyboard comes first, on a board you can zoom (mouse wheel, up to 200%) and move around (hold the middle mouse button and drag). Keys can never leave the board, and an inspector on the right shows the selected key's label, width and place. The live preview steps aside on this tab.
- **Make keys wider, narrower, taller or shorter** by dragging the thin handles on any side of the selected key, or by typing a width or height. The OBS overlay draws the new sizes.
- **Two layout styles.** Keyboard shape keeps the keys as the layout draws them; Even grid puts every key one key wide in neat columns. Each style keeps its own moves, so you can switch back and forth.
- **Keys stick to each other.** While you drag, a key's edges snap to the edges of nearby keys, and an orange guide line shows it.
- **Line keys up faster.** Select two or more keys and a small bar appears above them to align them or space them evenly.
- **Close gaps and a Reset menu.** Close gaps slides keys together and centres them. The Reset menu puts selected keys, all keys, hidden keys or labels back, or resets the whole layout, and every one of these can be undone.
- **The overlay fits its box in OBS.** The keyboard is scaled to fit the Browser Source's size and centred in it, so a wide layout is no longer cut off and nothing sticks to the top-left corner.
- **A crash note.** If the app ever crashes, the next start says so in the event log and the bug report (only where in the code and how long it had been running, never what you typed).

### 🛠 Improved
- **Easier with the keyboard and screen readers.** Every setting's label is linked to its control, popups keep keyboard focus inside them and give it back when they close, layout cards can be picked with Enter and deleted with the Menu key (or Shift+F10), the tab bar says which tab is open, and slider outlines show when you reach them with the keyboard.
- **Clearer to read.** White text on blue buttons is easier to read, fields, dropdowns, buttons and cards have visible borders, and buttons that cannot be used yet look dimmed.
- **The Keys board is centred on your keyboard,** with room on every side, and keys can be placed left of or above the layout's own corner. A new **Hidden keys** switch shows or hides the dimmed keys you turned off, and **Grid** shows its dots with or without Snap.
- **Snap and Grid are simple switches** in the Keys toolbar, and the arrow keys move the selected keys (Shift for a whole key). The old arrow buttons, the "Whole key" tickbox and the Snap menu are gone.
- **Tabs open instantly.** The Layout, Style, Animation and Fonts tabs are built once and kept until something changes, and they are prepared while the window is idle.
- **A bug report that reads top to bottom.** "Copy bug report" gives a short summary first, then what you changed from the defaults, the self-test and the recent event log, and it removes your user name from file paths. The important events are kept at all times; the details only in Debug mode.
- **Updates install quietly.** Updating in the app no longer flashes the Windows installer; the app just restarts on the new version.
- **"What's new" is easier to scan.** Each section of the release notes has its own colour.
- **"Reset all settings" keeps your port and your secure link,** so your OBS link stays the same.

### 🐛 Fixed
- **The keyboard capture comes back if Windows drops it.** While an overlay is connected, the app checks every 30 seconds and puts the keyboard hook back if Windows removed it.
- **Pausing can no longer leave a key stuck** or let one key press through.
- **Restoring a settings backup is no longer treated as a new install.**
- **Going back to an older version no longer loses settings from a newer one,** and they come back when you update again.
- **"Copy secure link" and "Make a new key" no longer show while the secure link is off.**
- **A secure link with a missing key repairs itself** instead of leaving the overlay locked.
- **No more failed request for a missing icon** every time the overlay loads in OBS.

### ⚡ Performance — v1.4.0 vs v1.3.0
- No slowdown: the settings window opens in about the same time (455 ms against 449 ms), 0% CPU at idle and under 8,000 key presses, the same 9 background threads and the same idle memory (3 MB). A key press still reaches the overlay in about 0.6 ms (median), with none missed.
- The settings window uses about 5 MB more memory (195 MB against 190 MB), because tabs are kept and prepared in advance. Switching to a tab you have seen takes under 2 ms of work.
- No background timer runs for update checks while automatic checks are off.

### 🧰 Under the hood
- The settings window's colours, sizes and spacing live in one list of design tokens, with a picture-by-picture test (now also of the overlay in every built-in theme) that catches any accidental change in the look.
- The local server refuses requests with two Host headers or addressed to another site, and the privacy check reads all of the code, with tests for its own patterns.
- Third-party licence notices ship with the installer, the release workflow is pinned and hardened, and the app's name, repository and identifiers are kept in one place.
- Type checking for the interface code, a benchmark for key-press delay, and key capture on Linux X11 desktops (for developers; there is no Linux release yet).

## v1.3.0 — free key placement

### ✨ New
- **Place keys anywhere.** In the Keys tab, drag any key to a new spot, for every layout (including the built-in ones). The live preview and OBS follow straight away, and the overlay window shrinks to fit a compact layout. **Reset positions** puts everything back.
- **Work with several keys at once.** Drag a box around keys (or Ctrl-click them), then move them together, nudge them with the arrow buttons, **align** them (left, centre, right, top, middle, bottom) or **space them evenly** across or down.
- **Undo and Redo** for every change to a layout's keys (moves, aligns, hidden keys, labels), up to 50 steps.
- **Snap and grid.** Choose how far keys jump while you drag (off, quarter, half or whole key) and show a grid. Your choice is remembered. A small label shows the exact position while you drag, and a line under the keyboard shows the selected key and how many keys are moved.
- **Keyboard shortcuts** on the Keys tab: arrow keys nudge (Shift = a whole key), **Delete** hides the selected keys, **Ctrl+Z** undoes, **Ctrl+Shift+Z** (or Ctrl+Y) redoes, **Ctrl+A** selects every key and **Esc** clears the selection. They never act while you are typing in a field.
- **Tidy up** closes the gaps left by hidden keys while keeping the keyboard's shape.
- **Easier to use without a mouse:** every key on the picture can be reached with Tab and selected with Enter, with clear focus outlines and spoken names for screen readers.
- **Overlap warning:** keys that sit on top of each other get a red outline.

### ⚡ Performance — v1.3.0 vs v1.2.1
- No slowdown: opens in about the same time (487 ms), 0% CPU at idle, the same 9 background threads, the same idle memory (3 MB) and settings-window memory (about 194 MB).

### 🧰 Under the hood
- Your saved key edits move to a new, roomier format (it also prepares for resizing keys and a new layout style in a later version). Your existing settings are converted automatically, and nothing is lost.
- The settings window's code is split into small files and formatted automatically, and there are many more tests.
- Updated the Windows library the keyboard capture is built on, and the build tools used by the project's automatic checks.

Your settings, presets and fonts are kept.

## v1.2.1 — the "preview keeps up" fix

### 🐛 Fixed
- **The live preview now keeps up with your custom layouts.** Make a layout, hide some keys, and the preview updates the moment you do. Before, it kept drawing a built-in layout until you closed and reopened the window, and OBS had the same blind spot until you refreshed the source. Creating, deleting or importing a layout now refreshes the overlay straight away, and the overlay re-checks by itself if it ever meets a layout it doesn't know.

## v1.2.0 — the first Stable release

### ✨ New
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

### 🛠 Improved
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

### 🐛 Fixed
- **Keys didn't show while the settings window was in front:** the preview (and OBS) went blind whenever you clicked the app. Fixed. Keys light up whether or not the window has focus.
- **Stuck-key check** now only looks at the keys you're actually holding, instead of scanning every possible key on every press.
- **Pause key** no longer shares a slot with Ctrl, so holding Ctrl can't swallow it.

### ⚡ Performance — v1.2.0 vs v1.1.2
- **18% faster** to open (436 ms vs 533 ms)
- **61% fewer** background threads (9 vs 23)
- **24% less** idle memory (2.9 MB vs 3.8 MB)
- **11% less** memory with the settings window open (342 MB vs 385 MB)

## v1.1.2 — the "quick actions" update

### ✨ New
- **Tray quick actions:** right-click the tray icon to **pause the overlay** (handy when typing a password on stream), **switch layout**, or **restart the server**.
- **Per-layout key edits:** hidden keys and custom labels are now saved separately for each layout. Switch away and back and your edits are still there.
- **Revert to Default:** one button in the Keys tab undoes your edits for the current layout (it asks you to click twice, so no accidents).
- **Update progress bar:** watch the download instead of wondering.
- **What's new window:** after an update, the release notes pop up once. Click **OK** and carry on.

### 🛠 Improved
- **Version and release notes** now live in General → Program updates.

### 🐛 Fixed
- **Settings backup:** if the settings file ever gets corrupted, the app restores the last good copy by itself.
- **Port already in use:** you now get a clear message and the settings window opens, instead of a silently dead overlay.
- **Instant saving:** toggles save immediately, and anything pending is saved before an update.

## v1.1.1 — the tiny update with a job

### ✨ New
- **Version number** in the settings header. Small, but it proved in-app updating works.

## v1.1.0 — the "updates come to you" update

### ✨ New
- **In-app updates:** General → Program updates checks GitHub, downloads, verifies and installs. Updates that can't be done in-app point you to the installer instead.
- **TSB layout:** a compact four-number-plus-WASD layout.
- **Tray app with a keystroke overlay for OBS:** global keyboard hook, transparent overlay at `http://localhost:7878/`, staggered real-keyboard layouts, live-editable styles, animations (press down, glow, fade, bounce, scale), custom fonts, presets, and a settings window that vanishes completely when closed.
