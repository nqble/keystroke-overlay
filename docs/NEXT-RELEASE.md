# v1.2.0 — IN PROGRESS (not released) — the first Stable release

**Status: all code is in this repo, committed and tested, but NO release has been built or published.**
To ship it, say "make the v1.2.0 release". The steps are in [RELEASING.md](RELEASING.md).

Versions in `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` and `package.json` are already 1.2.0.

## Versioning rule

`x.y.z` — the **middle number is Stable**, the **last number is Latest**. 1.2.0 goes to Stable *and* Latest;
1.2.1, 1.2.2… go to Latest only (decided automatically by `tools/release.mjs`).

## Release notes (paste into the GitHub release description)

The same text is in [CHANGELOG.md](../CHANGELOG.md) under v1.2.0.

```
**v1.2.0 — the first Stable release**

**⚡ Performance — v1.2.0 vs v1.1.2** *(same PC, same test, median of 5 runs)*
- **Settings window ready in 469 ms**, down from 550 ms: about **15% faster**, and it no longer flashes white first.
- **Background threads: 9, down from 23**: that's **61% fewer** things running while you game.
- **Idle memory: 2.9 MB, down from 3.8 MB** (about 24% less), with idle CPU at 0%.
- **Settings window memory: 342 MB, down from 385 MB** (about 11% less), using one fewer helper process.
- **Typing stays featherweight:** 8,000 key presses cost **0.25% of one CPU core**, a **4× drop** from v1.1.2's 1.04%.
- Program size: 6.1 MB (v1.1.2 was 6.0 MB). Tiny, and it now does more.

**✨ New**
- **Make your own layouts:** click the dashed **+** card in the Layout tab, name it, and it starts as the full-size keyboard. Then hide the keys you don't want in the Keys tab. You can have up to 20 (a counter shows how many you've used). Right-click a layout you made to delete it.
- **Keyboard input method:** General → Keyboard input lets you pick **Standard** (what the app always used) or **Compatibility** (Windows Raw Input). If keys don't light up in one particular game, try Compatibility. You can switch live, no restart.
- **Secure link (optional):** a new toggle in General → Secure link. Off by default, so your OBS link stays simple. Turn it on and the link carries a private key, so only a program that knows the full link can read your key presses. Paste the new link into OBS once. Hit "Make a new key" to cut off old links.
- **Update button:** a little accent-coloured circle appears in the corner when a new version is out. Click it, read the notes, hit **Update now**. It never installs behind your back.
- **Stable or Latest:** pick your pace in General → Program updates. **Stable** gets the main releases (1.2.0, 1.3.0…) and is recommended; **Latest** also gets every small fix in between (1.2.1…).
- **Automatic update check:** on by default, one click to turn off. It only peeks at GitHub, at most once every 6 hours.
- **Sliders go all the way to zero:** opacity, animation intensity and font size can hit 0 on purpose (no border, no movement, no text. Your call).

**🛠 Improved**
- **Instant, dark startup:** the settings window used to flash white like a camera. Now it opens dark, and the controls are drawn and usable in under half a second.
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

Your settings, presets and fonts are kept.
```

## One-time setup before publishing (Stable channel)

Stable users read `stable.json` from a GitHub release tagged `channel-stable` (pre-release). Create it once; 1.2.0 ends in `.0`
so `npm run release` also writes `stable.json` and you upload it there. Details in [RELEASING.md](RELEASING.md).
Installed 1.1.0–1.1.2 builds have no channels: they read `latest.json` and will be offered 1.2.0 as soon as it is the newest release.

## Measured results (for reference)

| | before (1.1.2) | after (1.2.0) |
|---|---|---|
| White flash at startup | 350–510 ms | 0 ms |
| Settings UI drawn and usable | ~814 ms | ~722 ms |
| Threads, tray-only | 23 | 9 |
| Private memory, tray-only | 4.1 MB | 3.0 MB |
| Web view memory with settings open | ~368 MB (7 processes) | ~305–335 MB (6 processes) |
