# Preparing for reuse (checklist for M6, do after v2.0 is planned, not before)

Goal: after v2.0 ships, the reusable parts become general building blocks for future programs
(see the standing rules in the notes). This file is only the checklist. No code was changed.

## 1. Header comments

Every file in `src-tauri/src/`, `ui/settings/`, `tools/`, `tests/e2e/lib/` and `tests/bench/` already starts
with a comment (checked). The top-up is only for the files meant to be lifted out. Add one line saying
"meant to be reused: needs X, knows nothing about keys/layouts":

- Settings engine: `src-tauri/src/settings.rs` (the migration and sanitizer part; the app-specific
  defaults would stay behind)
- Geometry: `ui/settings/tabs/keys-board.js`, `keys-view.js`, `keys-guides.js`, `keys-arrange.js`, `keys-history.js`
- UI kit: `ui/settings/helpers.js`, `popups.js`, `controls.js`
- Tooling: `tools/check-style.mjs`, `tools/check-privacy.mjs`, `tools/changelog-section.mjs`,
  `tests/e2e/lib/cdp.mjs`, `tests/e2e/lib/mock-updates.mjs`, `tests/bench/latency.mjs`

## 2. App-specific values to collect in one place

Today these are spread over many files. Target: one small config (for example `app.config.json`) that the
scripts read, and Rust reads through one constants file.

| Value | Where it appears now |
|---|---|
| Repository `nqble/keystroke-overlay` | `src-tauri/src/state.rs` (REPO), `commands/updates.rs` (2 URLs), `tauri.conf.json` (updater endpoint), `tools/release.mjs`, `package.json`, `Cargo.toml`, `.github/ISSUE_TEMPLATE/config.yml` |
| App name "Keystroke Overlay" | `tauri.conf.json`, `tray.rs`, `window.rs`, `rawinput.rs`, `assets.rs`, `main.rs`, `server.rs`, `ui/overlay/*`, `ui/settings/debug*.js`, `tools/release.mjs` (installer file name) |
| Identifiers `com.keyoverlay.app` / `.test` / `.devbuild` / `.dev` | `tauri.conf.json`, `settings.rs` (devbuild defaults), `tests/e2e/run.mjs`, `tests/bench/run.mjs`, `tests/install/run.mjs`, `tools/devbuild.mjs`, `tools/dev-debug.mjs` |
| Test exe names (`kotest-e2e.exe`, `kotest-install.exe`), devbuild binary, ports 7879/7881/7999, CDP 9222 | `tests/e2e/run.mjs`, `tests/install/run.mjs`, `tools/devbuild.mjs` |
| Updater key folder `~/.keystroke-overlay-keys` | `tools/release.mjs` |

Notes:
- Some mentions are user-facing text on purpose (tray tooltip, window title). They need the config only for
  a template, not for this app. Do not change them for v1.4.
- Several tests assert the text "Keystroke Overlay" (`debug-report.test.mjs`, `devbuild-title.test.mjs`,
  `smoke.mjs`, `debug.mjs`). Move them to read the same config so a rename does not break them.
- Estimated work: about one hour for the scripts and tests, plus a small constants file in Rust. Do it in
  M6 so it does not compete with the makeover. Run the full e2e, install and visual tests afterwards.

## 3. Generic-code check for review (standing rule 1)

When reviewing new code in the files listed in section 1: no imports of key, layout, profile or overlay
modules. The geometry modules and `helpers.js` follow this today. `popups.js` and `controls.js` should be
checked once in M6.
