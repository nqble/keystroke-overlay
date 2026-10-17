# Architecture

A small Tauri v2 app: a Rust backend (keyboard hook + local web server + tray) and two web pages (the overlay OBS
loads, and the settings window). No framework, no bundler.

## Folder map

```
keystroke-overlay/
├── README.md  PRIVACY.md  LICENSE  SECURITY.md  CONTRIBUTING.md  CODE_OF_CONDUCT.md  CHANGELOG.md
├── .github/            CI + one-click Release workflows, issue + PR templates, dependabot
├── docs/               you are here; README.md is the index. decisions/ explains why things are the way they are;
│                       design/ holds approved designs; proposals/ holds plans (queued, in progress or just proposed;
│                       finished ones in proposals/done/); schemas/ holds the JSON schemas for layout and preset files
├── assets/             logo/: the logo as SVG (app, devbuild, tray); the app's icons are made from it
├── tests/              e2e/ (the real app, driven), ui/ (JS unit tests), visual/ (screenshot tests), install/, bench/
│                       (speed and memory), lib/ (the shared lock); see tests/README.md. Rust unit tests live next to the code
├── tools/              release.mjs (build + sign + manifests), changelog-section.mjs (release notes + their format check),
│                       check-privacy.mjs (+ privacy-patterns.mjs), check-style.mjs, vendor.mjs (copies Preact + htm), gen-layouts.mjs, preview.mjs (the overlay in a browser),
│                       ui-sandbox.mjs + sandbox/ (the settings window in a browser, docs/DEBUGGING.md), devbuild.mjs + devbuild-title.mjs (a test installer),
│                       dev-debug.mjs (npm run dev:debug)
├── src-tauri/          the Rust app
│   ├── tauri.conf.json   app + updater configuration
│   └── src/
│       ├── main.rs         entry point: starts everything
│       ├── keyboard/       key capture: two interchangeable methods feeding one pipeline
│       │   ├── mod.rs        controller (switch methods live), key bus, dispatcher thread
│       │   ├── hook.rs       Standard method: Windows low-level keyboard hook (WH_KEYBOARD_LL)
│       │   ├── rawinput.rs   Compatibility method: Windows Raw Input (hidden message-only window)
│       │   ├── tracker.rs    repeat filtering + stuck-key protection, shared by both methods
│       │   ├── keymap.rs     key-naming table (virtual key + scancode -> DOM "code"), shared
│       │   ├── x11.rs        Linux (from v1.4.0-dev): X11 key capture with XInput2 raw events
│       │   └── linux_keys.rs Linux (from v1.4.0-dev): X11 key numbers -> the same DOM "code" names
│       ├── server.rs       local web server (127.0.0.1) + WebSocket
│       ├── grid.rs         the even-grid layout style: key positions, sent with every layout
│       ├── settings.rs     settings file: defaults, versioned migrations, loading and saving, backup
│       ├── sanitize.rs     cleaning settings from outside: types, ranges and rules, one table line per setting
│       ├── downgrade.rs    going back a version and forward again without losing settings (settings.vN.json)
│       ├── state.rs        shared app state + small helpers
│       ├── window.rs       the settings window (created on demand, destroyed on close)
│       ├── tray.rs         tray icon/menu + quick actions (pause, layout, restart server)
│       ├── debug.rs        optional Debug mode: in-memory event log, health snapshot, test switches (docs/DEBUGGING.md)
│       ├── platform.rs     the few OS-specific calls (porting starts here)
│       └── commands/       what the settings window can call
│           ├── mod.rs        lists the command files
│           ├── settings.rs   state, save, port, autostart
│           ├── assets.rs     fonts, presets, layouts (create, import, export), opening folders
│           ├── actions.rs    pause / layout / restart wrappers
│           └── updates.rs    update check + install, release notes, "What's new"
└── ui/
    ├── overlay/          what OBS loads (served from inside the exe)
    │   ├── layouts/*.json     one file per keyboard layout
    │   ├── animations/*.js    one file per animation
    │   ├── themes/*.js        one file per built-in theme
    │   └── registry.js, overlay.js, overlay.css, index.html
    ├── globals.d.ts      type hints for npm run check:types (window.__TAURI__ and friends)
    └── settings/         the settings window: plain ES modules, one job per file (settings.js is the entry point)
        ├── index.html     the window's page; logo.png
        ├── settings.css   the shared look: design tokens (its :root), the page, scrollbar, scroll fade
        ├── tabs.css, header.css, pause-button.css, popups.css, debug.css, keys.css   one file per part of the window
        ├── settings.js    picks the tab, draws the window, starts everything
        ├── state.js       what the window remembers while open (settings, layouts, current tab, ...)
        ├── helpers.js     small tools: talk to the app, build page elements, toasts (imports nothing)
        ├── html.js        Preact with htm for new screens (html.d.ts: its types); the libraries are copies in vendor/
        ├── vendor/        Preact and htm, copied by tools/vendor.mjs, pinned and fingerprint-checked (never edit)
        ├── controls.js    CONTROLS: the table that draws every slider, colour picker and dropdown
        ├── preview.js     saving a change, the live preview, the OBS address bar
        ├── profiles.js    per-layout key edits: hidden keys, labels, moved keys, "Tidy up"; the snap helpers
        ├── popup.js       the shared popup: keyboard focus for every popup, and dialog()
        ├── dialogs.js     New layout and Reset all settings, built on popup.js
        ├── menu.js        the layout cards' small menu; no browser right-click menu, no dragging
        ├── blocks.js      the v2.0 building blocks as Preact components (blocks.css; choice-keys.js: their arrow keys)
        ├── notes.js       release notes: the small markdown reader, typing reveal, the notes popup
        ├── update-popup.js  the update button, its popup and the download progress
        ├── release-notes.js  the release notes' five sections, shared with the release check (tested)
        ├── messages.js    messages from the app (tray, updates, progress), re-reading its state
        ├── obs-status.js  the header's "Live in OBS / Paused / Not connected" status (plain logic, tested)
        ├── pause-button.js  the round pause button on the live preview (same switch as the tray)
        ├── scroll-fade.js   the soft fade at the edges of every scrolling area
        ├── header.js      the header's status, Copy OBS link and Update ready, drawn with Preact (paintHeader)
        ├── windowbar.js   the window's own minimize / maximize / close buttons
        ├── text.js        the longer explanations the user reads
        ├── debug.js       the optional Debug tab (docs/DEBUGGING.md)
        ├── debug-report.js  the Debug tab's reports as plain logic: scrubbing, settings diff, the bug report text (tested)
        └── tabs/*.js      one file per tab: layout, keys, style, animation, fonts, general
            The Keys tab is several files: keys.js (the tab, buttons, editor panels), keys-map.js (the keyboard picture:
            drawing, selecting, dragging), keys-toolbar.js (selection, nudge, align, history, snap and grid controls),
            keys-arrange.js (the movement maths, plain functions with unit tests) and keys-history.js (undo and redo).
            Built for the coming makeover ([design/key-editor.md](design/key-editor.md)), not used by the tab yet:
            keys-board.js (board geometry), keys-view.js (zoom and pan) and keys-guides.js (snapping guides), with unit tests.
```

## How a key press travels

```
key press → capture method on its own thread:
              Standard      WH_KEYBOARD_LL hook (tiny callback, never blocks input)
              Compatibility Raw Input (registers to receive a copy of keyboard input; nothing sits in the input path)
          → KeyTracker (drops OS repeats, releases keys that are really up) → channel → dispatcher thread (tracks held keys; drops everything while paused)
          → tokio broadcast → each WebSocket client (/ws on 127.0.0.1)
          → overlay page (OBS) toggles a CSS class on the key; CSS transitions do the animation
```

- The method is chosen in General → Keyboard input (`general.inputMethod`: `hook` default, `rawinput`) and can be switched
  live: `Bus::set_method` stops the old source, releases any held keys, starts the new one, and falls back to the old one if
  the new one can't start. The framework's own Raw Input registration is disabled at startup (`device_event_filter(Always)`)
  because registrations are per process and would compete with ours.
- **Secure link (on for new installs since v1.4.0-dev, `settings::apply_new_install_defaults`; `defaults()` keeps it off so older files keep their plain link):** `general.secureLink` + a random 128-bit `general.linkKey`. When on, `server.rs` requires
  `?key=` (constant-time compare) on `/api/*`, `/ws`, `/fonts/*` and `/user/*`; the page and `/overlay/*` stay open (public code). `obs_url()`
  appends the key, the overlay repeats it on every request and the WebSocket, and `public_settings()` strips the key from everything the
  overlay receives. Toggling or regenerating restarts the server so old connections drop.
- Only *state changes* are sent (OS key-repeat is filtered). Nothing is stored; see [PRIVACY.md](../PRIVACY.md).
- When settings change, the server pushes them **inside the WebSocket message** (`{"t":"cfg","s":{…}}`), so the overlay
  doesn't re-fetch anything. Fonts/layout changes send `{"t":"assets"}` instead.
- The overlay animates **only `transform` and `opacity`** (GPU friendly) and has no timers while connected.

## Threads and idle cost

Capture thread (hook or Raw Input), dispatcher thread, two async worker threads (tokio), plus Tauri's own: ~9 threads at idle, ~13 MB working set,
0.0% CPU. The settings window is created on demand and fully destroyed on close (the web view's processes exit), after which
the app trims its working set.

## Settings

`settings.json` is versioned (`version`). On load it is migrated one step at a time (`MIGRATIONS` in `settings.rs`),
merged over `defaults()`, then **sanitized** (wrong types → defaults, numbers clamped, ids/colors validated) so a hand-edited
file or imported preset can never break the overlay. The previous good file is kept as `settings.json.bak` and used if the
main file is corrupt. A file from a newer version is copied aside before it is cleaned, and put back when that version
returns (`downgrade.rs`). Per-layout key edits live in `layout.profiles[layoutId]`.

## Extending it

- **Layout:** add `ui/overlay/layouts/mine.json` (`id`, `name`, `keys[]` with `code`, `label`, `x`, `y`, optional `w`, `h`).
  Users can also drop one into their data folder's `layouts/`. `code` is a DOM `KeyboardEvent.code` name (the table is
  `code_name()` in `keyboard/keymap.rs`).
- **Animation:** add `ui/overlay/animations/wobble.js`:
  ```js
  import { registerAnimation } from '/overlay/registry.js';
  registerAnimation({ id: 'wobble', name: 'Wobble',
    apply: ({ ms, intensity }) => ({ down: `rotate(${3 * intensity}deg)`,
      press: { ms: ms * 0.5, ease: 'ease-out' }, release: { ms: ms * 2, ease: 'cubic-bezier(.34,1.9,.64,1)' }, glow: 0 }) });
  ```
  Use only `transform`/`opacity`. It shows up in the Animation tab automatically. Themes work the same with `registerTheme`.
- **Setting:** (1) default in `settings.rs` (a range or rule line in `sanitize.rs` if needed), (2) a descriptor in `CONTROLS` in
  `ui/settings/controls.js`, (3) use it in `ui/overlay/overlay.js`. Renaming or restructuring needs a migration + test.
- **Command for the settings window:** a `#[tauri::command]` in the matching `commands/*.rs`, registered in
  `main.rs` (`generate_handler!`).

## Updates

The only code that uses the network is `commands/updates.rs`. Channels (Stable/Latest), the signed manifests, the versioning
rule (`x.Y.0` = Stable, `x.y.Z` = Latest) and the one-click GitHub release workflow are in [RELEASING.md](RELEASING.md).

## Guard rails

`npm run check:privacy` (also in CI) fails the build if network code appears outside `commands/updates.rs`, a server binds
anything but `127.0.0.1`, the keyboard/server code writes files, anything logs or prints, or the UI calls an external address.
Its patterns live in `tools/privacy-patterns.mjs` with their own tests; it is a line-by-line tripwire, not a proof.
`npm test` runs it together with the Rust unit tests and the JS unit tests in `tests/ui/` (settings migration/validation, key naming and tracking, Raw Input decoding,
update URLs, release notes). `npm run test:e2e` builds a throwaway copy of the app and drives it for real (settings window, injected
key presses through both input methods, a signed update download); it cleans up after itself — see [tests/README.md](../tests/README.md).

## Porting

OS-specific calls are isolated in `platform.rs`; the keyboard capture methods are in `keyboard/`. Everything else builds and runs on Linux and macOS too: see [CROSS-PLATFORM.md](CROSS-PLATFORM.md). Linux X11 capture is in `keyboard/x11.rs`, in development and in no release yet ([LINUX-PORT.md](LINUX-PORT.md)); for macOS, see [MAC-PORT.md](MAC-PORT.md).
