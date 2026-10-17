# Cleanup audit

Checked against [CLAUDE.md](../CLAUDE.md) on `v1.3.0-dev` (4b82723) plus `advisor/editor-logic`; line counts and done items
re-checked on `v1.4.0-dev` (2026-10-16). Most findings are still open; the rows say which are done. Each area below is fixed later in its own `refactor:` commits, with tests run between
areas (see "How to work through it").

How the checks were made: an automated scan of every source file (function length, file length, file headers, one-letter
names, several statements on one line, long user-facing strings outside `TEXT`, unnamed numbers and sleeps), then reading
the files it flagged. Line counts re-checked on `v1.4.0-dev` on 2026-10-16; the findings themselves are from the first
scan unless a row says otherwise.

**Risk** is how likely a fix could change behaviour: low (wording, comments, names), medium (splitting functions),
high (delicate code: the keyboard hook, the tray, threads). **Coverage** is how well tests would catch a mistake there.

## Summary

- Formatting, file headers and descriptive names are already in good shape almost everywhere. The renames are done
  (no `S`, `reg`, `selKey` or `upProg` left).
- The main remaining issues are **long functions** (about 30 over the ~40-line guideline), **six files over ~400 lines** (re-checked 2026-10-16: `settings.rs`, `assets.rs`, `server.rs`, `popups.js` (split on advisor/v2.0), `debug.js`,
  and the e2e suite `keys-editor.mjs`),
  **user-facing text still inline** in a few UI files (about 33 long strings), and **unnamed numbers** (mostly sleeps and
  timings in Rust, and timings in the settings UI).
- **Update check (loading plan item C8): fine, no change needed.** `commands/updates.rs` `start_background_check` waits
  45 s after start-up, then loops with one `tokio::time::sleep(CHECK_EVERY_SECS)` (3600 s) per round, so the app wakes
  once an hour and does nothing in between. When automatic checks are off it still wakes hourly to read the setting, which
  costs nothing measurable. Only the 45 s should become a named constant.
- The `ui/settings/` items are handled by the **UI foundation plan** (tokens, building blocks, tab lifecycle) and the
  **key editor makeover**, not by a separate cleanup pass. They are listed here so nothing is missed.

## Area 1: `ui/overlay/` (do first: contributors copy these files)

| File | Findings | Fix | Risk | Coverage |
|---|---|---|---|---|
| `overlay.js` (325) | `build` is 61 lines. Rebuilds every key when keySize, gap, fontSize or scale change (`structKey`). 5 unnamed numbers. | Split `build` (positions, elements, size report). Name the numbers. Loading plan B6–B7 (CSS variables, incremental updates). | medium | good (e2e, theme baselines once step 6 lands) |
| `themes/*.js`, `animations/*.js` (13 files) | No header comment. These are the files contributors copy first. | Add a 2-line header: what the file is, and "copy this file to make your own; see docs/ARCHITECTURE.md". Keep each file one plain file (CLAUDE.md principle 4). | low | good |
| `registry.js` | Fine. | none | n/a | n/a |

## Area 2: `ui/settings/` (handled by the UI foundation plan and the makeover)

| File | Findings | Where it gets fixed |
|---|---|---|
| `debug.js` (612; split into `debug/` on advisor/v2.0) | Over ~400 lines. Four `build` functions of 42–82 lines. 15 long inline strings. 17 unnamed numbers. | Split per Debug section (self-test, event log, key monitor, raw settings, helpers) in UI foundation step 4. Text into `TEXT`. Lazy-loaded (loading plan A3: done, 8d9691e). |
| ~~`popups.js` (435)~~ | Done on advisor/v2.0: split into `popup.js`, `dialogs.js`, `menu.js`, `notes.js` and `update-popup.js`, each under 170 lines. | — |
| `tabs/general.js` (317) | `updatesSection` 105, `secureLinkSection` 53, `inputSection` 43. 3 inline strings. | Step 4 (shared building blocks shorten these), text into `TEXT`. |
| `tabs/style.js` (117) | `styleTab` 97 lines. Re-fetched presets on every open (done: presets are cached, 8d9691e). | Step 4 and loading plan A2 (cached lists) and A4 (targeted updates). |
| `tabs/fonts.js` (73) | `fontsTab` 58 lines. Re-fetches fonts on every open. | Step 4, loading plan A2. |
| `tabs/keys.js`, `keys-map.js`, `keys-toolbar.js` | `keyButtons` 85, `keyEditor` 71, `dragKeys` 61, `startMarquee` 50. 10 inline strings. | Replaced by the makeover (docs/design/key-editor.md), which will use `keys-board.js`, `keys-view.js` and `keys-guides.js` (built and tested, not used by the tab yet). Remove `profiles.js` `tidyPositions` then (`closeGapsPositions` replaces it). |
| `controls.js` (345) | 14 numbers, but they're slider ranges in a data table. That's fine as data. | none |
| `settings.js`, `messages.js`, `preview.js`, `helpers.js`, `windowbar.js` | A few unnamed timings (save delay 150 ms, resize timer 150 ms). | Name them. The resize timer goes away with the tab lifecycle (loading plan, spec §9a). |

## Area 3: `tools/` and `tests/`

| File | Findings | Fix | Risk | Coverage |
|---|---|---|---|---|
| `tests/e2e/suites/keys-editor.mjs` (723) | Over ~400 lines. 6 lines with several statements. | Split by feature (selection, moving, arrange, history, resize) when the makeover rewrites these tests. | low | n/a (it is the test) |
| `tests/e2e/lib/cdp.mjs` | `connect` 103 lines. 12 one-letter names. | Split (launch, wait for target, message plumbing). Rename. | medium | good (every e2e uses it) |
| `tests/e2e/run.mjs` | `main` 93 lines. | Split (build, start, run suites, clean up). | medium | good |
| `tests/lib/lock.mjs` | `acquire` 87 lines. | Split (try, wait, stale-lock check). | medium | weak: add a unit test for the stale-lock rule first |
| `tools/devbuild.mjs` | `verifyBuild` 82 lines. 3 lines with several statements. 7 one-letter names. | Split and rename. | low | weak: manual tool; check by running `npm run devbuild` once |
| `tools/gen-layouts.mjs` | `main` 71 lines. | Split per layout step. | low | weak: compare generated files before and after |
| `tests/bench/run.mjs`, e2e suites | Many one-letter names (`t`, `s`, `r`, …) in test code. | Rename while touching each file ("leave it cleaner"). Not urgent. | low | n/a |

## Area 4: Rust (`settings.rs`, `server.rs`, `commands/`, `state.rs`, `window.rs`, `debug.rs`, `platform.rs`)

| File | Findings | Fix | Risk | Coverage |
|---|---|---|---|---|
| `main.rs` (171) | `main` is 143 lines. | Split into named setup steps (state, server, keyboard, tray, updater, window events). Keep the order exactly. | medium | good (smoke e2e starts the app) |
| `settings.rs` (1256: 503 code + 753 tests) | `sanitize` 81 lines, 2 lines with several statements. The code part is fine in size; the tests make the file long. | Split `sanitize` per section (general, layout and profiles, style, animation). Optionally move tests to `settings/tests.rs`. | medium | good (many unit tests) |
| `commands/assets.rs` (570: 402 code + 168 tests) | `import_doc` 78, `create_layout` 46. | Split into validation and writing steps. | medium | good (hostile-file tests) |
| `commands/updates.rs` | Unnamed 45 s start delay and 8 s timeout. | Name them (`FIRST_CHECK_DELAY_SECS`, `REQUEST_TIMEOUT_SECS`). | low | good |
| `window.rs` | Unnamed 1500 ms wait before trimming memory. | Name it, with a comment on why it waits. | low | good |
| `debug.rs` | Unnamed 60 s and 400 ms. | Name them. | low | good |
| `server.rs`, `state.rs`, `platform.rs`, `commands/settings.rs`, `commands/actions.rs` | Fine. | none | n/a | n/a |

## Area 5: Rust keyboard and tray (LIGHT TOUCH ONLY: comments, names, constants)

| File | Findings | Fix | Risk | Coverage |
|---|---|---|---|---|
| `tray.rs` (294) | `build` 96 lines. Unnamed 100 ms retry sleep. 1 line with several statements. | Name the sleep and add why-comments. Split `build` only if it is plain menu construction (no lock or thread changes); ask Jordan first. | high | medium (soak test, tray deadlock test) |
| `keyboard/rawinput.rs` | `start` 75 lines. 1 line with several statements. | Comments only, unless something is actually wrong. | high | good (decoding unit tests, input-method e2e) |
| `keyboard/keymap.rs` | `code_name` 114 lines, but it is one lookup table. | Fine as a table. Make sure the numpad keys are all present (spec §11, right-hand layouts). | low | good |
| `keyboard/tracker.rs` | `handle` 44 lines (just over). | Fine. Optionally extract the stuck-key check. | high | good |
| `keyboard/hook.rs`, `keyboard/mod.rs` | Fine (1 line with several statements in `mod.rs`). | Split that line. | low | good |

## How to work through it

1. One area at a time, in the order above. Use `refactor:` commits with no behaviour change. A bug found along the way
   gets its own `fix:` commit with a test.
2. Where coverage is "weak", add the test first (`test:` commit).
3. After each area run `npm test`, `npm run check:format`, `check:privacy`, clippy with zero warnings, and the full e2e
   suite. After areas 1 and 5, also run the benchmark and compare with v1.2.0 (idle CPU, threads, memory).
4. When every row is done or marked skipped (with the reason), add the "leave it cleaner" rule to CLAUDE.md section 2 and
   delete this file.
