# Cleanup audit

Checked against [CLAUDE.md](../../CLAUDE.md) on `v1.3.0-dev` (4b82723) plus `advisor/editor-logic`; line counts and done items
re-checked on `v1.4.0-dev` (2026-10-16). Most findings are still open; the rows say which are done. Each area below is fixed later in its own `refactor:` commits, with tests run between
areas (see "How to work through it").

How the checks were made: an automated scan of every source file (function length, file length, file headers, one-letter
names, several statements on one line, long user-facing strings outside `TEXT`, unnamed numbers and sleeps), then reading
the files it flagged. Line counts re-checked on `v1.4.0-dev` on 2026-10-16; the findings themselves are from the first
scan unless a row says otherwise.

**Risk** is how likely a fix could change behavior: low (wording, comments, names), medium (splitting functions),
high (delicate code: the keyboard hook, the tray, threads). **Coverage** is how well tests would catch a mistake there.

## Summary

- Formatting, file headers and descriptive names are already in good shape almost everywhere. The renames are done
  (no `S`, `reg`, `selKey` or `upProg` left).
- The main remaining issues are **long functions** (about 30 over the ~40-line guideline), **six files over ~400 lines** on
  2.0 (re-checked 2026-10-19: `settings/tests.rs` 883, `assets.rs` 570, `keyboard/mod.rs` 550, `server.rs` 545,
  `platform.rs` 516, and the e2e suite `keys-editor.mjs`;
  `popups.js`, `debug.js` and `editor/editor.js` are already split on 2.0),
  **user-facing text still inline** in a few UI files (about 33 long strings), and **unnamed numbers** (mostly sleeps and
  timings in Rust, and timings in the settings UI).
- **Done 2026-10-17:** the headers on the 5 themes and 6 animations ("copy this file to make your own"); the loose timings in
  Rust now have names (`REQUEST_TIMEOUT_SECS`, `TRIM_MEMORY_AFTER_MS`, `MONITOR_POLL`, `TRAY_RETRY_DELAY`; the 45 s start
  delay already had one). The `overlay.js` rebuild question was measured and left alone (see the loading plan, section B).
- **Update check (loading plan item C8): fine, no change needed.** `commands/updates.rs` `start_background_check` waits
  45 s after start-up, then loops with one `tokio::time::sleep(CHECK_EVERY_SECS)` (3600 s) per round, so the app wakes
  once an hour and does nothing in between. When automatic checks are off it runs no timer: it waits until the setting
  changes. The 45 s is a named constant (`FIRST_CHECK_AFTER_SECS`).
- The `ui/settings/` items were handled by the **UI foundation plan** (tokens, building blocks, tab lifecycle) and the
  **key editor** (v1.4.0), not by a separate cleanup pass. They are listed here so nothing is missed.

## Area 1: `ui/overlay/` (do first: contributors copy these files)

| File | Findings | Fix | Risk | Coverage |
|---|---|---|---|---|
| `overlay.js` (339) | `build` is 61 lines. Rebuilds every key when keySize, gap, fontSize or scale change (`structKey`). 5 unnamed numbers. | Split `build` (positions, elements, size report). Name the numbers. Loading plan B6–B7 (CSS variables, incremental updates). | medium | good (e2e, theme baselines once step 6 lands) |
| `themes/*.js`, `animations/*.js` (13 files) | No header comment. These are the files contributors copy first. | Add a 2-line header: what the file is, and "copy this file to make your own; see docs/ARCHITECTURE.md". Keep each file one plain file (CLAUDE.md principle 4). | low | good |
| `registry.js` | Fine. | none | n/a | n/a |

## Area 2: `ui/settings/` (handled by the UI foundation plan and the makeover)

| File | Findings | Where it gets fixed |
|---|---|---|
| ~~`debug.js`~~ | Done on 2.0: split into `debug/`. | — |
| ~~`popups.js`~~ | Done on 2.0: split into `popup.js`, `dialogs.js`, `menu.js`, `notes.js` and `update-popup.js`, each under 170 lines. | — |
| `tabs/general.js` (317) | `updatesSection` 105, `secureLinkSection` 53, `inputSection` 43. 3 inline strings. | Step 4 (shared building blocks shorten these), text into `TEXT`. |
| `tabs/style.js` (117) | `styleTab` 97 lines. Re-fetched presets on every open (done: presets are cached, 8d9691e). | Step 4 and loading plan A2 (cached lists) and A4 (targeted updates). |
| `tabs/fonts.js` (73) | `fontsTab` 58 lines. Re-fetches fonts on every open. | Step 4, loading plan A2. |
| `tabs/keys.js` (156), `keys-toolbar.js` (282), `keys-inspector.js` (244), `editor/editor.js` (209) | The makeover replaced `keys-map.js` (deleted). **Done 2026-10-19:** `createEditor` was one function of about 600 lines; it is now split into `editor/` files that share one `ctx` object (`context.js`, `view.js`, `drag.js`, `resize.js`, `marquee.js`, `arrange-bar.js`; on 2.0 `view.js` hands the zoom and pan gestures to `view-gestures.js`), none over 210 lines, with the keys-editor e2e (153 checks) unchanged. The unused `profiles.js` `tidyPositions` is removed (Close gaps uses `closeGapsPositions`). | none |
| `controls.js` (349) | 14 numbers, but they're slider ranges in a data table. That's fine as data. | none |
| `settings.js`, `messages.js`, `preview.js`, `helpers.js`, `windowbar.js` | A few unnamed timings (save delay 150 ms, resize timer 150 ms). | Name them. The resize timer goes away with the tab lifecycle (loading plan, spec §9a). |

## Area 3: `tools/` and `tests/`

| File | Findings | Fix | Risk | Coverage |
|---|---|---|---|---|
| `tests/e2e/suites/keys-editor.mjs` (1199) | Over ~400 lines. 6 lines with several statements. | Split by feature (selection, moving, arrange, history, resize) when the makeover rewrites these tests. | low | n/a (it is the test) |
| `tests/e2e/lib/cdp.mjs` | `connect` 103 lines. 12 one-letter names. | Split (launch, wait for target, message plumbing). Rename. | medium | good (every e2e uses it) |
| `tests/e2e/run.mjs` | `main` 93 lines. | Split (build, start, run suites, clean up). | medium | good |
| `tests/lib/lock.mjs` | `acquire` 87 lines. | Split (try, wait, stale-lock check). | medium | weak: add a unit test for the stale-lock rule first |
| `tools/dev-debug.mjs` | **Fixed 2026-10-19:** `npm run dev:debug` failed on Windows (the `--config` JSON lost its quotes under the shell); the argument is now stringified twice so it survives. | none | low | checked by hand |
| `tools/devbuild.mjs` | **Done 2026-10-19:** `verifyBuild` is split into `buildVerifyCopy`, `startVerifyCopy`, `waitForWindow` and `checkWindow` (checked with `npm run devbuild -- --verify`). The one-letter names there are gone. | none | low | checked by hand |
| `tools/gen-layouts.mjs` | **Done 2026-10-19:** `main` is split into `functionRow`, `typingRows`, `navigationCluster` and `mainBlock`; the output is byte-identical to before. | none | low | compared before and after |
| `tests/bench/run.mjs`, e2e suites | Many one-letter names (`t`, `s`, `r`, …) in test code. | Rename while touching each file ("leave it cleaner"). Not urgent. | low | n/a |

## Area 4: Rust (`settings.rs`, `server.rs`, `commands/`, `state.rs`, `window.rs`, `debug.rs`, `platform.rs`)

| File | Findings | Fix | Risk | Coverage |
|---|---|---|---|---|
| `main.rs` (211; 233 on 2.0) | **Done 2026-10-19:** `main` was 143 lines; it is now short, and the start-up steps are named functions in the same order (`start_async_runtime`, `start_app`, `load_settings`, `start_event_log`, `make_shared`, `open_window_at_launch`). | none | medium | good (smoke e2e starts the app) |
| `settings.rs` (278; 286 on 2.0) | **Done 2026-10-19:** the unit tests moved to `settings/tests.rs` (862 lines); the sanitizer was split out earlier into `sanitize.rs` (332). | none | low | good (many unit tests) |
| `commands/assets.rs` (564) | **Done 2026-10-19:** layout names, free ids and imported keys have their own functions (`layout_name`, `unused_id`, `clean_keys`); `create_layout` and `import_doc` are much shorter. Behavior unchanged (hostile-file tests, layouts e2e). | none | medium | good (hostile-file tests) |
| `commands/updates.rs` | **Done:** the 45 s start delay and the request timeout are named (`FIRST_CHECK_AFTER_SECS`, `REQUEST_TIMEOUT_SECS`). | none | low | good |
| `window.rs` | **Done:** the wait before trimming memory is `TRIM_MEMORY_AFTER_MS`, with its reason. | none | low | good |
| `debug.rs` | **Done:** `MONITOR_MAX` and `MONITOR_POLL`. | none | low | good |
| `server.rs`, `state.rs`, `platform.rs`, `commands/settings.rs`, `commands/actions.rs` | Fine. | none | n/a | n/a |

## Area 5: Rust keyboard and tray (LIGHT TOUCH ONLY: comments, names, constants)

| File | Findings | Fix | Risk | Coverage |
|---|---|---|---|---|
| `tray.rs` (362) | `build` 96 lines. Unnamed 100 ms retry sleep. 1 line with several statements. | Name the sleep and add why-comments. Split `build` only if it is plain menu construction (no lock or thread changes); ask Jordan first. | high | medium (soak test, tray deadlock test) |
| `keyboard/rawinput.rs` | `start` 75 lines. 1 line with several statements. | Comments only, unless something is actually wrong. | high | good (decoding unit tests, input-method e2e) |
| `keyboard/keymap.rs` | `code_name` 114 lines, but it is one lookup table. | Fine as a table. Make sure the numpad keys are all present (spec §11, right-hand layouts). | low | good |
| `keyboard/tracker.rs` | `handle` 44 lines (just over). | Fine. Optionally extract the stuck-key check. | high | good |
| `keyboard/hook.rs`, `keyboard/mod.rs` | Fine (1 line with several statements in `mod.rs`). | Split that line. | low | good |

## How to work through it

1. One area at a time, in the order above. Use `refactor:` commits with no behavior change. A bug found along the way
   gets its own `fix:` commit with a test.
2. Where coverage is "weak", add the test first (`test:` commit).
3. After each area run `npm test`, `npm run check:format`, `check:privacy`, clippy with zero warnings, and the full e2e
   suite. After areas 1 and 5, also run the benchmark and compare with v1.2.0 (idle CPU, threads, memory).
4. When every row is done or marked skipped (with the reason), add the "leave it cleaner" rule to CLAUDE.md section 2 and
   delete this file.
