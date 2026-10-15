# Contributing

Thanks for helping! This is a small, fast, privacy-first app, and the bar for changes is "keep it that way".

## The three rules

1. **Privacy first.** Keystrokes must never touch disk, logs or the network. `npm run check:privacy` enforces this
   (and runs in CI). If you think a change needs network access or a new file write, open an issue first.
2. **Stay light.** The app should idle at ~0% CPU with no timers or polling, and the settings window must be fully
   destroyed when closed. Animations use `transform`/`opacity` only.
3. **Keep it simple to extend.** Layouts, animations and themes are plain files (see below).

## Set up

You need **Windows 10/11**, [Rust](https://rustup.rs) (stable, MSVC toolchain + Visual Studio Build Tools),
and [Node.js](https://nodejs.org) 20+. WebView2 is already part of Windows 11.

```bash
git clone https://github.com/nqble/keystroke-overlay.git
cd keystroke-overlay
npm install
npm run dev          # run the app (rebuilds Rust on change)
```

Useful commands:

| Command | What it does |
|---|---|
| `npm test` | Rust unit tests + the privacy check |
| `npm run check:privacy` | Verifies the promises in [PRIVACY.md](PRIVACY.md) |
| `npm run check:style` | No tabs, no trailing spaces, files end with a newline (CI runs it) |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Rust lints; CI requires zero warnings |
| `npm run dev:debug` | Runs a separate development copy with **Debug mode** on (a Debug tab with self-test, event log, key monitor and more). See [docs/DEBUGGING.md](docs/DEBUGGING.md) |
| `npm run build` | Builds the app + installer into `src-tauri/target/release/bundle/` |

Editor settings are in `.editorconfig` (most editors pick them up automatically). The code uses wide lines (up to ~160 characters)
and compact one-line structs; `src-tauri/rustfmt.toml` matches that as closely as stable rustfmt allows, but `cargo fmt` is not
enforced yet, so please don't reformat code you aren't changing.

Tip: if the linker complains about opening files, build outside OneDrive/synced folders, or set `CARGO_TARGET_DIR`
to a normal local folder.

## Where things are

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full map. In short: `src-tauri/` is the Rust app (keyboard
hook, local server, tray, settings storage), `ui/overlay/` is the page OBS loads, `ui/settings/` is the settings window.

## Common contributions

- **A keyboard layout** — add one JSON file to `ui/overlay/layouts/` (copy `wasd.json` and edit it). That is the whole change.
- **An animation or theme** — one `.js` file in `ui/overlay/animations/` or `themes/` using `registerAnimation` /
  `registerTheme` (copy an existing one).
- **A setting** — default in `src-tauri/src/settings.rs`, a line in `CONTROLS` in `ui/settings/settings.js`, and use it
  in `ui/overlay/overlay.js`. If you rename or restructure one, add a migration step (and a unit test).
- **A bug fix** — please add a test when it is practical.

## Pull requests

- Keep each PR focused; describe what changed and why.
- `npm test` must pass. For UI changes, include a screenshot.
- Don't add dependencies lightly: every crate is code that runs next to a keyboard hook. Mention why a new one is needed.
- Release notes are written in a friendly but direct tone; see [docs/RELEASE-NOTES-STYLE.md](docs/RELEASE-NOTES-STYLE.md)
  if you add a [CHANGELOG](CHANGELOG.md) entry.

## Code of conduct

Be kind and assume good faith. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
