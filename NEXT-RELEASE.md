# v1.1.3 — IN PROGRESS (not released)

**Status: all code is in this folder and committed in git, tested, but NO release has been built or published.**
To ship it, tell Claude "make the v1.1.3 release" (it will run `npm run release -- --stable "notes"` if you want
it on the Stable channel too, then you upload the files — see "To publish" below).

Version numbers in `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` are already 1.1.3.

## What is in this patch
1. **No white flash, instant window** — native dark window background + dark first paint.
   Measured: white flash 350–510 ms (old) -> 0 ms (new); window visible at ~60 ms either way.
2. **Faster settings UI** — start-up IPC calls in parallel, UI drawn without waiting for the preview.
   Measured: UI usable 814 ms -> ~722 ms (median); preview finishes in the background (~810 ms).
3. **Release-notes loading dots** (`.` 0.3 s, `..` 0.3 s, `...` 0.1 s, repeat) — pure CSS, no timers.
4. **Typing animation** for the notes (under 1 s, no layout shift).
5. **Green update button** (bottom-left, #91E048 circle, white download icon, shakes every 7.5 s, tooltip "New update").
   Click -> dialog with notes -> "Update now" / "Later". Never installs without a click.
6. **Update channels: Stable (recommended) / Latest** — selector in General -> Program updates.
   Background check on window open (at most every 6 h, setting "Check for updates automatically", ON by default).
7. **Subtle optimizations** (measured, tray-only idle): threads 23 -> 9, private memory 4.1 -> 3.0 MB;
   overlay receives settings inside the WebSocket message (3 fewer HTTP requests per change);
   stuck-key check only scans held keys; single WebView2 renderer process (about -35 to -60 MB while the settings window is open).

## One-time setup BEFORE publishing 1.1.3 (for the Stable channel)
Stable users read `stable.json` from a GitHub release tagged `channel-stable`. Without it, users on Stable see
"no stable release published yet". Steps (also in README.md):
1. GitHub -> Releases -> Draft a new release -> tag `channel-stable`, tick **pre-release**, title "Stable channel", publish.
2. Release 1.1.3 with `npm run release -- --stable "notes"` and upload `stable.json` to the `channel-stable` release.
   (Or leave Stable alone until you have tested 1.1.3 for a while — Latest users get it immediately either way.)

NOTE: installed 1.1.0–1.1.2 builds have no channels; they keep reading `latest.json` from the newest release,
so they will be offered 1.1.3 as soon as it is published as the latest release.

## To publish (when you say go)
1. `npm run release -- --stable "notes"` (or without `--stable`)
2. GitHub release `v1.1.3`: upload `release/1.1.3/Keystroke-Overlay_1.1.3_x64-setup.exe` + `latest.json` (+ release notes text).
3. If promoting: upload `stable.json` to the `channel-stable` release (replace the old one).

## Draft release notes
```
**v1.1.3**

**New**
- **Update button:** a small green button in the bottom-left corner appears when a new version is available. Click it to read the notes and update. Nothing installs without your click.
- **Update channels:** choose **Stable (recommended)** or **Latest** in General → Program updates.
- **Automatic update check** (on by default, can be turned off).

**Improved**
- The settings window now opens instantly with no white flash and draws faster.
- "What's new" shows animated loading dots, then types out the release notes.
- Lower background resource use: fewer threads and less memory while idle and while the settings window is open.

Your settings, presets and fonts are kept.
```
