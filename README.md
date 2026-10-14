# Keystroke Overlay

Tray app that shows your keystrokes in OBS. A global keyboard hook feeds a local
web server; OBS loads `http://localhost:7878/` as a Browser Source.
Nothing is drawn on your screen, and keystrokes are never written to disk or sent
off-machine (the server binds to 127.0.0.1 only and rejects foreign Host/Origin headers).

## OBS setup
1. Run the app (tray icon). Click **Copy OBS URL** (default `http://localhost:7878/`).
2. OBS → Sources → **+** → **Browser** → paste the URL.
3. Set Width/Height to the size shown in the settings header (e.g. 1085×403 for TKL).
4. Leave "Custom CSS" empty (the page is already transparent). Done.

## Layout of the code
```
src-tauri/src/main.rs      tray, windows, Tauri commands (settings, presets, fonts)
src-tauri/src/keyhook.rs   WH_KEYBOARD_LL hook thread + dispatcher thread
src-tauri/src/server.rs    axum: overlay files, read-only API, /ws WebSocket
src-tauri/src/settings.rs  defaults, versioned JSON, migrations
ui/overlay/                what OBS loads (served from the exe)
  layouts/*.json           one file per keyboard layout
  animations/*.js          one file per animation (registerAnimation)
  themes/*.js              one file per built-in theme (registerTheme)
  registry.js              the registration helpers + easings
ui/settings/               the settings window (created on demand)
```
User data lives in `%APPDATA%\com.keyoverlay.app\` (settings.json, fonts/, presets/,
and optional layouts/ animations/ themes/ folders that are loaded in addition to the built-ins).

## Add a layout
Create `ui/overlay/layouts/mine.json` (or drop it in the user `layouts/` folder, no rebuild needed):
```json
{ "id": "mine", "name": "My layout",
  "keys": [ { "code": "KeyW", "label": "W", "x": 1, "y": 0 },
            { "code": "Space", "label": "", "x": 0, "y": 1, "w": 3 } ] }
```
`x/y/w/h` are in key units. `code` is a DOM `KeyboardEvent.code` name (see `code_name` in keyhook.rs).

## Add an animation
Create `ui/overlay/animations/wobble.js`:
```js
import { registerAnimation } from '/overlay/registry.js';
registerAnimation({ id: 'wobble', name: 'Wobble',
  apply: ({ ms, intensity }) => ({
    down: `rotate(${3 * intensity}deg)`,            // transform when pressed
    press:   { ms: ms * 0.5, ease: 'ease-out' },
    release: { ms: ms * 2,   ease: 'cubic-bezier(.34,1.9,.64,1)' },
    glow: 0 }) });                                   // 0..1 glow opacity
```
Use only `transform`/`opacity` so it stays on the GPU. It appears in Animation → Type automatically.
Built-in themes work the same way with `registerTheme`.

## Settings format (v2)
Per-layout key edits live in `layout.profiles[layoutId] = { disabledKeys, labels }`. v1 files (one global
list) are migrated automatically (`v1_to_v2` in settings.rs, covered by unit tests). `general.lastSeenVersion`
is app-managed (it decides when "What's new" is shown) and is never overwritten by the settings window.
`settings.json.bak` is the last good copy and is used automatically if the main file is corrupt.

## Tray quick actions
Implemented in `main.rs` (`toggle_pause_inner`, `set_layout_inner`, `restart_server_inner`) and exposed as
commands, so the settings window can call the same code. Pause is a flag on the key bus (`Bus.paused`).

## Add a setting
1. Default value in `defaults()` in `settings.rs` (additive changes need no migration).
2. A line in `CONTROLS` in `ui/settings/settings.js` (renders the control + live preview).
3. Use it in `ui/overlay/overlay.js` (`applyVars` for style values).
Renaming/moving a setting: bump `CURRENT_VERSION` and add a step to `MIGRATIONS` in `settings.rs`.

## Develop / build
```
npm install
set CARGO_TARGET_DIR=C:\some\normal\folder   # recommended
npx tauri dev            # run
npx tauri build          # installer in <target>\release\bundle\nsis
```

## Releasing an update (in-app updater)
Users click **General → Updates → Check for updates**; the app reads
`https://github.com/nqble/keystroke-overlay/releases/latest/download/latest.json`,
verifies the download against the public key in `tauri.conf.json`, installs and restarts.

1. Raise `version` in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (same number).
   Write the release notes in the GitHub release description in step 3. The in-app "What's new" window
   fetches the notes for tag `v<version>` from GitHub's API (markdown: headings, bullets, **bold**, `code`).
2. `npm run release -- "What changed"` → builds, signs, and writes `release/<version>/`.
3. On GitHub: Releases → Draft a new release → tag `v<version>` → upload BOTH files from `release/<version>/` → Publish.

The private signing key lives at `%USERPROFILE%\.keystroke-overlay-keys\updater.key` (NOT in this project).
Back it up somewhere private. If it is lost, installed copies can never auto-update again and must be reinstalled
with the setup .exe; if it leaks, anyone could ship updates to your users — never commit or upload it.
Changes the updater can't handle (rare) can always be shipped by sharing the setup .exe instead.
