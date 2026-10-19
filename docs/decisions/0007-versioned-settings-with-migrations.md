# 0007: Settings are versioned JSON with migrations
Status: Accepted
Date: 2026-10-15

## Context
Users update the app across many versions and expect their settings, layouts and key edits to survive.

## Decision
`settings.json` has a `version` number. On load it is migrated one step at a time to the current version
(`MIGRATIONS` in `src-tauri/src/settings.rs`), merged on top of the defaults so new options always have a value, then
sanitized (wrong types fall back to defaults, numbers are clamped to ranges, colors and ids are validated). A corrupted
file falls back to the last good `.bak` copy. From v1.4.0, a file written by a newer version is copied aside
(`settings.vN.json`) before it is rewritten, so going back a version never loses settings, and the copy is put back (and
deleted) when the newer version runs again.

## Why
- Additive changes (a new option) need no migration; renames and restructures bump the version and add one migration step.
- Sanitizing on load means a hand-edited or imported file can never put the app in a broken state.

## Consequences
- **Compatibility rule:** settings, layout and preset files from older versions must keep working. A format change always
  comes with a migration and a unit test.
- To add a setting: add it to `defaults()` (and to the settings window). To rename or restructure: bump `CURRENT_VERSION`
  and add a migration.
