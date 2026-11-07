# Contributing

Thanks for helping! This is a small, fast, privacy-first app, and the bar for changes is "keep it that way".

**This page is all you need as a person contributing.** Use any editor, tools or AI assistant you like; you own what
you submit and should be able to explain it. [CLAUDE.md](CLAUDE.md) is the brief for Claude Code sessions (the
maintainer's, or yours if you use one): its code rules are the ones on this page, and the rest is about how those
sessions work, so you don't need it.

You don't need permission to open an issue or a pull request. For something big (a new feature, a new dependency,
moving code between files), open an issue first so we can agree on the plan before you spend time on it. Plans for
things not built yet are in [docs/proposals/](docs/proposals/README.md); ask on an issue whether one is free before
starting it.

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
| `npm run check:lint` | Finds likely JavaScript mistakes such as a name that is used but never defined, and breaks of the house rules (short functions, shallow nesting, files under ~400 lines); CI fails on either. Settings: `eslint.config.mjs` |
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
- **A bug fix** — add a test that fails without the fix. If you can't (it needs hardware, a game, another system), say
  so in the PR and we'll help.

## Code shape

`npm run format` formats everything. The linter enforces a few house rules: functions of about 40 lines at most, no
`if`s nested more than two deep, files of about 400 lines at most; split code into named steps to meet them. Prefer
plain, obvious code with descriptive names, a short header at the top of each file, and comments that say why. If a rule
gets in the way of a good change, say so in the PR.

## Pull requests

- Keep each PR focused; describe what changed and why.
- Run the checks for your kind of change (CI runs all of them on every PR, so it will tell you anyway):

  | Your change | Run |
  |---|---|
  | Docs only | `npm run check:docs`, `npm run check:format` |
  | A layout, theme or animation | `npm test`, `npm run check:format`; look at it with `npm run preview` |
  | The settings window or the overlay | `npm test`, `npm run check:format`, `npm run check:lint`, `npm run check:types`; a before and after screenshot in the PR |
  | Rust | `npm test`, `npm run check:format`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets` with no warnings |

  The end-to-end tests and the screenshot tests run on Windows; if you're not on Windows, the maintainer runs them.
- Don't add dependencies lightly: every crate is code that runs next to a keyboard hook. Mention why a new one is needed.
- Changes to the keyboard capture (`src-tauri/src/keyboard/`), the local server (`server.rs`), the privacy check or the
  release workflow get a closer review: they guard the privacy promise and every user's updates.

## Code of conduct

Be kind and assume good faith. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
