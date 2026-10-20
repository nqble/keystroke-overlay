# Contributing

Thanks for helping! This is a small, fast, privacy-first app, and the bar for changes is "keep it that way".

Code conventions (for people and AI sessions alike) are in [CLAUDE.md](CLAUDE.md). The working notes of the Claude sessions that help
build this project are in [docs/for-claude/](docs/for-claude/README.md); you can ignore them, they are not instructions for contributors.

## The three rules

1. **Privacy first.** Keystrokes must never touch disk, logs or the network. `npm run check:privacy` enforces this
   (and runs in CI). If you think a change needs network access or a new file write, open an issue first.
2. **Stay light.** The app should idle at ~0% CPU with no timers or polling, and the settings window must be fully
   destroyed when closed. Animations use `transform`/`opacity` only.
3. **Keep it simple to extend.** Layouts, animations and themes are plain files (see below).

## Set up

You need **Windows 10/11**, [Rust](https://rustup.rs) (stable, MSVC toolchain + Visual Studio Build Tools),
and [Node.js](https://nodejs.org) 20+. WebView2 is already included in current Windows 10 and 11.

**On Linux or macOS?** You can still work on almost everything: the app builds, runs (keys are captured on macOS and on Linux, X11 and Wayland) and passes
its tests there. See [docs/CROSS-PLATFORM.md](docs/CROSS-PLATFORM.md) for setup and what works where.

```bash
git clone https://github.com/nqble/keystroke-overlay.git
cd keystroke-overlay
npm install
npm run dev          # run the app (rebuilds Rust on change)
```

Useful commands:

| Command | What it does |
|---|---|
| `npm test` | Rust unit tests, the UI unit tests (`tests/ui/`), the privacy check and the every-system check |
| `npm run check:privacy` | Verifies the promises in [PRIVACY.md](PRIVACY.md) |
| `npm run format` | Formats all the code (Prettier for web files, rustfmt for Rust, 120 columns). Run it before you commit |
| `npm run check:format` | Checks the formatting without changing anything (CI runs it) |
| `npm run check:style` | No tabs, no trailing spaces, files end with a newline in every source file; no raw colors outside the `:root` design tokens and no inline styles in the settings scripts (CI runs it) |
| `npm run check:types` | Type-checks the UI JavaScript with no build step (`jsconfig.json`, loose mode, CI runs it). Your editor (e.g. VS Code) shows the same hints as you type. To describe a value's type, use a JSDoc comment such as `/** @type {HTMLElement} */`; the app's globals are described in `ui/globals.d.ts` |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Rust lints; CI requires zero warnings |
| `npm run dev:debug` | Runs a separate development copy with **Debug mode** on (a Debug tab with self-test, event log, key monitor and more). See [docs/DEBUGGING.md](docs/DEBUGGING.md) |
| `npm run build` | Builds the app + installer into `src-tauri/target/release/bundle/` |

Formatting is automatic, so you never have to think about it: run `npm run format` before you commit. Web files are formatted by
Prettier and Rust files by rustfmt, both at 120 columns (`.prettierrc`, `src-tauri/rustfmt.toml`); CI runs `npm run check:format`.
Editor settings are in `.editorconfig` (most editors pick them up automatically). The one-time reformat of the whole project is listed in
`.git-blame-ignore-revs`; to make `git blame` skip it, run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once.

Tip: if the linker complains about opening files, build outside OneDrive/synced folders, or set `CARGO_TARGET_DIR`
to a normal local folder.

## Where things are

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full map, [docs/EXTENDING.md](docs/EXTENDING.md) for adding a layout, theme or
animation, [docs/PROTOCOL.md](docs/PROTOCOL.md) and [docs/FILE-FORMATS.md](docs/FILE-FORMATS.md) for the exact data formats, and
[docs/decisions/](docs/decisions/README.md) for why things are built the way they are. In short: `src-tauri/` is the Rust app (keyboard
hook, local server, tray, settings storage), `ui/overlay/` is the page OBS loads, `ui/settings/` is the settings window.

## Common contributions

- **A keyboard layout** — add one JSON file to `ui/overlay/layouts/` (copy `wasd.json` and edit it). That is the whole change.
- **An animation or theme** — one `.js` file in `ui/overlay/animations/` or `themes/` using `registerAnimation` /
  `registerTheme` (copy an existing one).
- **A setting** — default in `src-tauri/src/settings.rs`, a line in `CONTROLS` in `ui/settings/controls.js`, and use it
  in `ui/overlay/overlay.js`. If you rename or restructure one, add a migration step (and a unit test).
- **See your layout, theme or animation without building the app** — `npm run preview` serves the overlay at http://127.0.0.1:7883/ with fake key presses (see the top of `tools/preview.mjs`).
- **See the settings window without Windows or a build** — `npm run ui-sandbox` serves the real `ui/settings/` at
  http://127.0.0.1:7882/ with a stand-in for the app. Pick a state and tab in the address, e.g.
  `?state=paused-no-obs&tab=general` (the list is at the top of `tools/sandbox/fake-app.js`). Handy for screenshots and for
  Claude sessions on Linux or macOS; check anything Windows draws (tray, WebView2) on Windows.
- **A bug fix** — please add a test when it is practical.

## Pull requests

- Keep each PR focused; describe what changed and why.
- `npm test` must pass. For UI changes, include a screenshot.
- Don't add dependencies lightly: every crate is code that runs next to a keyboard hook. Mention why a new one is needed.

## Code of conduct

Be kind and assume good faith. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
