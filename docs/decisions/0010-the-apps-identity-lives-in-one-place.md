# 0010: The app's name, repository and identifiers live in one place
Status: Accepted
Date: 2026-10-18

## Context
The app's name, its GitHub repository, its Windows identifiers (`com.keyoverlay.app` and the test, devbuild and dev copies) and the
names of its test apps were spelled out in dozens of places. Reusing the code for another program, or renaming something, meant
finding them all.

## Decision
- The program reads them from `src-tauri/src/app_info.rs` (and `tauri.conf.json`, which Tauri itself reads).
- The tools and tests read them from `app.config.json` at the root, through `tools/app-config.mjs`.
- `npm run check:config` (also in CI) fails when `app.config.json`, `app_info.rs`, `tauri.conf.json`, `package.json` and
  `Cargo.toml` disagree.

## Why
- One list to change for a new program, and a check that says what is left, instead of a search.
- Two files, not one, because Rust and Tauri cannot read a JSON file at compile time without more machinery than the gain is worth;
  the check keeps them from drifting.

## Consequences
- New code asks `app_info.rs` or `app.config.json` instead of spelling the name or repository out.
- Left as they are on purpose: user-facing texts in the pages and the tests that check them, the test ports (test
  infrastructure, not identity), the PowerShell helpers' default process name, and the `w!()` window class name in `rawinput.rs`
  (a macro that needs a literal).
