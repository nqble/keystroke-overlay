# Tests

The layers, from quick to thorough:

| Command | What it checks | Time | Disk |
|---|---|---|---|
| `npm run check:privacy` | The privacy promises in [PRIVACY.md](../PRIVACY.md): network code only in one file, server on 127.0.0.1, no file writes in keyboard/server code, no logging, no external UI requests | 1 s | none |
| `npm run check:style` | Code style basics: no tabs or trailing spaces, a final newline, and no raw colours in `settings.css` outside its `:root` design tokens | 1 s | none |
| `npm run test:ui` | JS unit tests in `tests/ui/` for the settings window's plain logic (key arrange, history, board, view, guides, bug report, release-note sections, devbuild title) | 1 s | none |
| `npm test` | Rust unit tests (settings migration/validation, key naming, key tracking, Raw Input decoding, update URLs, release notes, **hostile-input tests** that feed thousands of corrupted settings and layout files to the cleaning code, secure-link key checks) + `npm run test:ui` + the privacy check | ~1 min | ~1 GB build cache in `src-tauri/target` |
| `npm run test:e2e` | **End to end:** builds a throwaway copy of the app, drives its real settings window, injects real key presses, runs a real signed update download | ~5–8 min | ~4 GB **temporary, deleted when it finishes** |

## End-to-end tests

```bash
npm run test:e2e                         # everything, then clean up
npm run test:e2e -- --suite smoke        # one suite: smoke | input-methods | secure-link | focus | layouts | layout-preview | keys-editor | ui-sweep | csp | soak | whats-new | debug (and the optional visual)
npm run test:e2e -- --keep               # keep the build for fast re-runs (uses ~4 GB until you delete it)
```

**Suites** (`tests/e2e/suites/`):

- `input-methods` — Standard (hook) and Compatibility (Raw Input) deliver identical key sequences (repeats dropped,
  extended keys, overlapping keys, PrintScreen), switching live never doubles/loses events or leaks threads, a key held
  during a switch is released, an 8000-event flood is delivered, idle CPU is ~0, and the General-tab help text is right.
- `secure-link` — the optional secure link: off by default; when on, data endpoints and the key-press stream are refused
  without the private key (wrong/missing key → 401, right key → allowed), the key never reaches the overlay, the live preview
  keeps working, an old link shows a clear message, "Make a new key" cuts off old links, and the settings window can't weaken it.
- `focus` — keys still reach the overlay stream and light up the live preview while the settings window itself is in front and focused (the "keys vanish when I click the app" bug).
- `layouts` — the dashed **+** card and popup, creating a layout from the full-size keyboard, the 20-layout limit, right-click delete, the custom context menu, and that only text boxes are selectable.
- `layout-preview` — creating, editing and deleting a custom layout updates the live preview straight away (regression test for a stale layout list in the overlay).
- `keys-editor` — moving keys: dragging, arrow-key nudging, exact X / Y fields, the overlap outline, Tidy up (keeps the shape, closes gaps), Reset positions, that the preview and overlay size follow, and that junk positions are cleaned.
- `ui-sweep` — walks every tab, layout, theme, animation and slider (at both ends) and fails on any JavaScript error.
- `csp` — the settings window's content-security policy: normal use (every tab, dialogs, the live preview) causes no policy violations,
  while injected scripts, scripts or frames from other websites, outside fetches and object embeds are blocked.
- `soak` — two minutes of steady typing plus tab switching, layout create/delete and setting changes: every key arrives, and threads,
  handles and memory stay flat.
- `whats-new` — the "What's new" popup shows once after an update and never again (whether or not OK was clicked).
- `debug` — Debug mode: off by default (no tab, nothing recorded), the switch adds and removes the Debug tab, every tool works (this-app facts, self-test, event log, key monitor, raw settings correction, fake update, bug report read from the real clipboard), and the privacy rules hold (no key presses in the log or the report, log forgotten when switched off).
- `smoke` — every command group, tray actions (pause / layout / restart server), settings broadcast over the WebSocket, the
  update button and dialog, path-traversal and link-blocking guards, a check that **every socket the app holds is
  loopback-only**, and a real signed update: download with progress → signature verified → installer launched.

**Running several tests at once.** All runs share ports 7879/7999/9222 and the keyboard, so they queue on a shared lock (`tests/lib/lock.mjs`);
`npm run test:lock` shows who is running. Runs started from different terminals or sessions simply wait their turn.

**Safety.** The test copy has its own identity (`com.keyoverlay.test`), its own data folder, port 7879 and a different
exe name (`kotest-e2e.exe`), so it can never touch an installed Keystroke Overlay. The "installer" it downloads is a
harmless copy of `whoami.exe`, signed with a throwaway key made for the run. Don't use your keyboard while it runs
(it presses keys for real — only the Right Ctrl, W, A, Space, Enter, Numpad Enter and PrintScreen keys).

**Disk space.** The test files are ~30 KB. The ~4 GB is the compiled test build, written to your TEMP folder
(or `E2E_WORK`) and **removed automatically** unless you pass `--keep`. Debug builds are also configured with
`debug = 0` in `Cargo.toml` to keep `src-tauri/target` small. To reclaim space any time: `cargo clean --manifest-path src-tauri/Cargo.toml`.

**Not in CI.** GitHub's hosted runners have no real desktop session for window and keyboard tests, so the end-to-end
suites run on your machine. CI runs the privacy check, syntax checks and the Rust tests.

## Visual tests (`npm run test:visual`)

A picture of every settings screen (each tab, the Keys tab with one key and with several keys selected, and the New layout
popup), compared with the picture saved last time, so a look that changes by accident is caught.

- `npm run test:visual` builds the test copy of the app (like the end-to-end tests), takes the pictures and compares them with
  `tests/visual/baselines/`. It prints which screens changed. For each changed screen it writes pictures to `tests/visual/diff/`
  (not saved in git): `name.diff.png` marks the changed pixels and `name.new.png` is what the window looks like now.
- `npm run test:visual -- --update` replaces the baselines with the new pictures. Do this **only when the look was changed on
  purpose**, and show Jordan the before and after pictures first (the old ones are in git, the new ones are in the working tree).
- The window is given a fixed size (1060 by 1100) and 100% scaling. Things that change between runs (the version, the overlay
  size text, animations, the blinking text cursor) are frozen or hidden. Two runs on the same PC give identical pictures, so
  only 20 differing pixels are allowed per screen.
- The baselines come from Jordan's PC and are **local**: they are not part of CI, and another PC (different Windows text
  smoothing or display scaling) will give slightly different pictures, so re-take them there with `--update`.
- It is an optional suite: `npm run test:e2e` (all suites) does not run it, because its baselines belong to one machine.
- To add a screen, add a line to `SCREENS` in `tests/visual/visual.mjs` and run `--update` once.

## Test hooks (data-test)

The end-to-end tests find things in the settings window ONLY through `data-test="..."` attributes, never by position,
CSS class, id or visible text. That way a redesign can move or restyle things without breaking the tests.

Rules:

- The name describes the **purpose**, not the looks: `layout-add`, not `dashed-card`. Kebab-case (lower case, words joined by `-`).
- A hook is an attribute only. **No CSS (and no behaviour) may use it.**
- Repeated things share one name and tell themselves apart with a `data-*` attribute that already exists or is added
  (`key-cell` + `data-code`, `layout-card` + `data-layout-id`, `tab` + `data-tab`).
- In the page code, `el('div', { test: 'name' })` and `button(text, onclick, className, 'name')` set the attribute; static
  elements in `ui/settings/index.html` have it written in directly.
- In the tests, `byTest('name', '[data-code="KeyW"]')` (from `tests/e2e/lib/cdp.mjs`) builds the selector.
- Reading a state class such as `.sel`, `.clash` or `.down` to check what an element looks like is still allowed; finding
  an element is not.

| Hook | What it is |
|---|---|
| `app-header`, `brand-logo`, `brand-title`, `dev-badge` | The top bar, its logo, its title and (devbuilds only) the DEV badge |
| `obs-status`, `obs-copy` | The header's OBS status (click: General) and its Copy OBS link button (always shown) |
| `window-buttons`, `window-minimize`, `window-maximize`, `window-close` | The window's own buttons |
| `server-banner`, `pause-overlay` | The server-problem banner, and the round pause button on the live preview |
| `preview-frame` | The live preview frame |
| `tab-bar`, `tab` + `data-tab` (`layout`, `keys`, `style`, `animation`, `fonts`, `general`, `debug`) | The tab bar and its buttons |
| `pane` | The area that shows the current tab |
| `section-heading` | Every heading made by `heading()` inside a tab |
| `toast` | The message at the bottom |
| `notes-popup`, `notes-title`, `notes-body`, `notes-ok` | The "What's new" / release-notes popup |
| `update-button` | The header's Update ready chip, shown when an update exists |
| `update-popup`, `update-title`, `update-body`, `update-progress`, `update-progress-text`, `update-later`, `update-go` | The update dialog |
| `dialog`, `dialog-title`, `dialog-body`, `dialog-footer` | The shared dialog |
| `dialog-ok`, `dialog-cancel`, `dialog-create`, `dialog-reset-confirm`, `dialog-layout-name` | Buttons and the name box inside dialogs |
| `context-menu`, `context-menu-item` | The right-click menu and its entries |
| `layout-card` + `data-layout-id` | One layout card |
| `layout-add` | The dashed "+" card |
| `layout-import`, `layout-export`, `style-import`, `style-export` | The Import / Export buttons of the Layout and Style tabs |
| `keymap`, `keymap-canvas` | The keyboard picture and the area inside it that draws the grid |
| `key-cell` + `data-code` | One key on the picture |
| `key-toolbar`, `key-tool-group` | The toolbar and each of its groups |
| `key-selection-summary`, `key-clear-selection` | "N keys selected" text and the Clear selection button |
| `key-nudge` + `data-direction` (`left`, `up`, `down`, `right`), `key-nudge-whole` | The four arrow buttons and the "Whole key" tickbox |
| `key-align-left`, `key-align-center`, `key-align-right`, `key-align-top`, `key-align-middle`, `key-align-bottom` | Align buttons |
| `key-distribute-across`, `key-distribute-down` | Space evenly buttons |
| `key-undo`, `key-redo` | History buttons |
| `key-snap`, `key-grid` | The Snap menu and the Show grid tickbox |
| `key-status`, `key-readout` | The line under the picture, the position label shown while dragging |
| `keys-shortcut-hint` | The one-line list of keyboard shortcuts under the picture |
| `keys-enable-all`, `keys-disable-all`, `keys-reset-labels`, `keys-tidy`, `keys-reset-positions`, `keys-revert` | The buttons under the picture |
| `key-editor`, `key-editor-title`, `key-show`, `key-label`, `key-label-reset`, `key-x`, `key-y`, `key-position-reset`, `key-group-put-back` | The editor under the picture (one key or several) |
| `theme-card-<id>` (for example `theme-card-neon`), `style-themes` | Style's theme gallery: one card per theme file (`aria-pressed` on the one in use) |
| `style-presets`, `preset-new`, `preset-card`, `preset-menu`, `preset-name`, `preset-save` | My presets: the "+ Save current look" card, each preset (click loads it) and its ⋯ menu; the name box and Save in the save popup |
| `style-reset`, `style-colors`, `style-shape`, `style-text`, `style-size` | Style's Reset ▾ menu and its cards |
| `control-<path>` (for example `control-style-radius`, `control-style-key-fill`, `control-animation-type`) | Every slider, colour picker and dropdown made from `CONTROLS`; the name is the settings path in kebab-case |
| `control-<path>-alpha`, `control-<path>-name` | A colour's transparency slider; the typed font name box |
| `fonts-add`, `fonts-open-folder`, `font-item` + `data-font`, `font-use`, `font-remove` | Style → Text: your font files (there is no Fonts tab since v2.0) |
| `toggle-<path>` (for example `toggle-general-debug-mode`) | A tickbox made by `toggle()` (`ui/settings/controls.js`); in General, the same names are its switches (`role="switch"`, `aria-checked`) |
| `obs-url`, `general-obs-copy`, `general-size-note` | General's OBS link: the link box (the only one; a password field while the secure link is on), Copy, the size in OBS |
| `app-version` | The version number shown in the About part of General |
| `general-connection`, `general-input`, `general-startup`, `general-updates`, `general-advanced`, `general-advanced-toggle` | General's cards, and the button that opens Advanced (collapsed at first; its controls stay in the page) |
| `server-port`, `server-port-apply` | Connection: the port; `server-restart` is in Advanced |
| `secure-link-toggle`, `secure-link-note`, `secure-link-copy`, `secure-link-new-key` | Connection: the secure-link switch (`aria-checked`), its note, and its buttons |
| `input-method-select`, `input-method-info`, `input-method-error` | Keyboard input: the segmented choice (a radiogroup; the chosen button has `aria-checked="true"`), its note, its error |
| `general-open-folder`, `general-reset`, `general-quit` | Advanced's buttons |
| `update-channel`, `update-check`, `update-install`, `update-status`, `update-release-notes`, `general-update-progress`, `general-update-progress-text` | Updates (the channel is a segmented choice) |
| `debug-card` + `data-card`, `debug-card-title` | One box of the Debug tab and its title |
| `debug-facts`, `debug-open-folder` | "This app" |
| `debug-self-test-run`, `debug-test` | Self-test button, one result row |
| `debug-log`, `debug-log-copy`, `debug-log-clear` | Event log |
| `debug-monitor-toggle`, `debug-monitor-status`, `debug-monitor-log` | Key monitor (the Start / Stop button is one button) |
| `debug-json`, `debug-raw-apply`, `debug-raw-reload`, `debug-raw-copy`, `debug-raw-result` | Raw settings |
| `debug-fake-update`, `debug-clear-fake-update`, `debug-whats-new`, `debug-new-layout`, `debug-toast`, `debug-error-toast`, `debug-restart-server`, `debug-reload-window` | Test helpers |
| `debug-copy-command`, `debug-bug-report` | Developer tools and Bug report |

The live preview frame is a different page (the real overlay); the tests keep using its own selectors.

## Clean install and upgrade test

`node tests/install/run.mjs` builds an older release (v1.1.2 by default; `INSTALL_OLD=name:commit:version` picks another) and the current code as **real installers** under a throwaway identity
(`KOTest`, `com.keyoverlay.test`), so an installed Keystroke Overlay is never touched. It then installs v1.1.2 on a clean slate, checks the first launch,
creates user data, installs the current version over it (an upgrade) and checks that settings, layouts and key edits survived and the
What's new popup appeared, uses the new features, and finally uninstalls (program and uninstall entry gone, your data folder kept).
It needs ~4 GB temporarily in your TEMP folder and deletes everything when it finishes (`--keep` to keep it).

## Performance comparison

`node tests/bench/run.mjs` builds v1.2.1, v1.3.0 and the current code as throwaway test copies and measures them side by side:
startup time, background threads, idle memory, settings-window memory, CPU while 8,000 key presses flood in, and how long a
key press takes to reach the overlay (`tests/bench/latency.mjs`) (median of 5 runs). The results are printed, not saved: copy
the ones that matter into the release's Performance section in CHANGELOG.md.
It needs ~6 GB temporarily in your TEMP folder; delete `keyoverlay-bench` there when it finishes.

## One test run at a time

All the runners (end-to-end, install, benchmark) use the same ports and press real keys, so they take a shared lock
(`tests/lib/lock.mjs`). If another run is in progress, a new one waits its turn and prints who is ahead: what it is,
which step it is on, its process, folder, start time and roughly when it should finish. An abandoned lock (its process is
gone, or it is over 3 hours old) is taken over automatically.

```bash
npm run test:lock                  # who holds the lock right now?  (add "-- --clear" to remove an abandoned one)
KO_TEST_LOCK=fail npm run test:e2e # fail immediately instead of waiting
```

## Adding a test

Copy a suite in `tests/e2e/suites/`, use the helpers in `tests/e2e/lib/cdp.mjs` (`connect`, `invoke`, `inject`,
`listenKeys`, `check`, `finish`), and add its name to `SUITES` in `run.mjs`. Rust unit tests live next to the code
(`#[cfg(test)]` modules).
