# Tests

Three layers, from quick to thorough:

| Command | What it checks | Time | Disk |
|---|---|---|---|
| `npm run check:privacy` | The privacy promises in [PRIVACY.md](../PRIVACY.md): network code only in one file, server on 127.0.0.1, no file writes in keyboard/server code, no logging, no external UI requests | 1 s | none |
| `npm test` | Rust unit tests (settings migration/validation, key naming, key tracking, Raw Input decoding, update URLs, release notes) + the privacy check | ~1 min | ~1 GB build cache in `src-tauri/target` |
| `npm run test:e2e` | **End to end:** builds a throwaway copy of the app, drives its real settings window, injects real key presses, runs a real signed update download | ~5–8 min | ~4 GB **temporary, deleted when it finishes** |

## End-to-end tests

```bash
npm run test:e2e                         # everything, then clean up
npm run test:e2e -- --suite smoke        # one suite: smoke | input-methods | secure-link | focus | layouts | ui-sweep
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
- `ui-sweep` — walks every tab, layout, theme, animation and slider (at both ends) and fails on any JavaScript error.
- `smoke` — every command group, tray actions (pause / layout / restart server), settings broadcast over the WebSocket, the
  update button and dialog, path-traversal and link-blocking guards, a check that **every socket the app holds is
  loopback-only**, and a real signed update: download with progress → signature verified → installer launched.

**Safety.** The test copy has its own identity (`com.keyoverlay.test`), its own data folder, port 7879 and a different
exe name (`kotest-e2e.exe`), so it can never touch an installed Keystroke Overlay. The "installer" it downloads is a
harmless copy of `whoami.exe`, signed with a throwaway key made for the run. Don't use your keyboard while it runs
(it presses keys for real — only the Right Ctrl, W, A, Space, Enter and PrintScreen keys).

**Disk space.** The test files are ~30 KB. The ~4 GB is the compiled test build, written to your TEMP folder
(or `E2E_WORK`) and **removed automatically** unless you pass `--keep`. Debug builds are also configured with
`debug = 0` in `Cargo.toml` to keep `src-tauri/target` small. To reclaim space any time: `cargo clean --manifest-path src-tauri/Cargo.toml`.

**Not in CI.** GitHub's hosted runners have no real desktop session for window and keyboard tests, so the end-to-end
suites run on your machine. CI runs the privacy check, syntax checks and the Rust tests.

## Clean install and upgrade test

`node tests/install/run.mjs` builds the previous release (v1.1.2) and the current code as **real installers** under a throwaway identity
(`KOTest`, `com.keyoverlay.test`), so an installed Keystroke Overlay is never touched. It then installs v1.1.2 on a clean slate, checks the first launch,
creates user data, installs the current version over it (an upgrade) and checks that settings, layouts and key edits survived and the
What's new popup appeared, uses the new features, and finally uninstalls (program and uninstall entry gone, your data folder kept).
It needs ~4 GB temporarily in your TEMP folder and deletes everything when it finishes (`--keep` to keep it).

## Performance comparison

`node tests/bench/run.mjs` builds v1.1.0, v1.1.1, v1.1.2 and the current code as throwaway test copies and measures them side by side:
startup time, background threads, idle memory, settings-window memory and CPU while 8,000 key presses flood in (median of 5 runs).
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
