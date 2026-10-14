# Architecture

A small Tauri v2 app: a Rust backend (keyboard hook + local web server + tray) and two web pages (the overlay OBS
loads, and the settings window). No framework, no bundler.

## Folder map

```
keystroke-overlay/
├── README.md  PRIVACY.md  LICENSE  SECURITY.md  CONTRIBUTING.md  CODE_OF_CONDUCT.md  CHANGELOG.md
├── .github/            CI workflow, issue + PR templates, dependabot
├── docs/               you are here (ARCHITECTURE, RELEASING, MAC-PORT, RELEASE-NOTES-STYLE, NEXT-RELEASE)
├── assets/             icon source image
├── tools/              release.mjs (build + sign + manifests), check-privacy.mjs, gen-layouts.mjs, make-icon.ps1
├── src-tauri/          the Rust app
│   ├── tauri.conf.json   app + updater configuration
│   └── src/
│       ├── main.rs         entry point: starts everything (≈90 lines)
│       ├── keyhook.rs      Windows keyboard hook + key dispatcher
│       ├── server.rs       local web server (127.0.0.1) + WebSocket
│       ├── settings.rs     settings file: defaults, versioned migrations, validation, backup
│       ├── state.rs        shared app state + small helpers
│       ├── window.rs       the settings window (created on demand, destroyed on close)
│       ├── tray.rs         tray icon/menu + quick actions (pause, layout, restart server)
│       ├── platform.rs     the few OS-specific calls (porting starts here)
│       └── commands/       what the settings window can call
│           ├── settings.rs   state, save, port, autostart
│           ├── assets.rs     fonts, presets, opening folders
│           ├── actions.rs    pause / layout / restart wrappers
│           └── updates.rs    update check + install, release notes, "What's new"
└── ui/
    ├── overlay/          what OBS loads (served from inside the exe)
    │   ├── layouts/*.json     one file per keyboard layout
    │   ├── animations/*.js    one file per animation
    │   ├── themes/*.js        one file per built-in theme
    │   └── registry.js, overlay.js, overlay.css, index.html
    └── settings/         the settings window (settings.js is organised in labelled sections)
```

## How a key press travels

```
key press → WH_KEYBOARD_LL hook (own thread; tiny callback, never blocks input)
          → channel → dispatcher thread (tracks held keys; drops everything while paused)
          → tokio broadcast → each WebSocket client (/ws on 127.0.0.1)
          → overlay page (OBS) toggles a CSS class on the key; CSS transitions do the animation
```

- Only *state changes* are sent (OS key-repeat is filtered). Nothing is stored; see [PRIVACY.md](../PRIVACY.md).
- When settings change, the server pushes them **inside the WebSocket message** (`{"t":"cfg","s":{…}}`), so the overlay
  doesn't re-fetch anything. Fonts/layout changes send `{"t":"assets"}` instead.
- The overlay animates **only `transform` and `opacity`** (GPU friendly) and has no timers while connected.

## Threads and idle cost

Hook thread, dispatcher thread, two async worker threads (tokio), plus Tauri's own: ~9 threads at idle, ~13 MB working set,
0.0% CPU. The settings window is created on demand and fully destroyed on close (the web view's processes exit), after which
the app trims its working set.

## Settings

`settings.json` is versioned (`version`). On load it is migrated one step at a time (`MIGRATIONS` in `settings.rs`),
merged over `defaults()`, then **sanitized** (wrong types → defaults, numbers clamped, ids/colors validated) so a hand-edited
file or imported preset can never break the overlay. The previous good file is kept as `settings.json.bak` and used if the
main file is corrupt. Per-layout key edits live in `layout.profiles[layoutId]`.

## Extending it

- **Layout:** add `ui/overlay/layouts/mine.json` (`id`, `name`, `keys[]` with `code`, `label`, `x`, `y`, optional `w`, `h`).
  Users can also drop one into their data folder's `layouts/`. `code` is a DOM `KeyboardEvent.code` name (the table is
  `code_name()` in `keyhook.rs`).
- **Animation:** add `ui/overlay/animations/wobble.js`:
  ```js
  import { registerAnimation } from '/overlay/registry.js';
  registerAnimation({ id: 'wobble', name: 'Wobble',
    apply: ({ ms, intensity }) => ({ down: `rotate(${3 * intensity}deg)`,
      press: { ms: ms * 0.5, ease: 'ease-out' }, release: { ms: ms * 2, ease: 'cubic-bezier(.34,1.9,.64,1)' }, glow: 0 }) });
  ```
  Use only `transform`/`opacity`. It shows up in the Animation tab automatically. Themes work the same with `registerTheme`.
- **Setting:** (1) default in `settings.rs` (sanitizer range/rule if needed), (2) a descriptor in `CONTROLS` in
  `ui/settings/settings.js`, (3) use it in `ui/overlay/overlay.js`. Renaming or restructuring needs a migration + test.
- **Command for the settings window:** a `#[tauri::command]` in the matching `commands/*.rs`, registered in
  `main.rs` (`generate_handler!`).

## Updates

The only code that uses the network is `commands/updates.rs`. Channels (Stable/Latest), the signed manifests and how to
publish are in [RELEASING.md](RELEASING.md).

## Guard rails

`npm run check:privacy` (also in CI) fails the build if network code appears outside `commands/updates.rs`, a server binds
anything but `127.0.0.1`, the keyboard/server code writes files, anything logs or prints, or the UI calls an external address.
`npm test` runs it together with the Rust unit tests (settings migration/validation, key mapping, update URLs, release notes).

## Porting

OS-specific calls are isolated in `platform.rs`; the Windows keyboard hook is `keyhook.rs`. See [MAC-PORT.md](MAC-PORT.md).
