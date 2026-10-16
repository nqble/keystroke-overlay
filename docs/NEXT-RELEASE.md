# What is next: v1.4 (in progress, not released)

v1.3.0 (free key placement) was released on 2026-10-16. This page tracks the work towards the next version. Nothing here is
released until Jordan says so.

## Already on the `v1.4.0-dev` branch
- Key editor geometry for the makeover (board size and clamping, zoom and pan maths, smart-guide snapping), with unit tests.
- The local server sends key events without Nagle's delay (`TCP_NODELAY`), with a test.
- A cleanup audit against CLAUDE.md ([CLEANUP.md](CLEANUP.md)) and cross-platform build support
  ([CROSS-PLATFORM.md](CROSS-PLATFORM.md)).
- Benchmarks for key latency (press to WebSocket, before and after the server change) in `tests/bench`.

## Planned for v1.4
The key editor makeover, designed in [design/key-editor.md](design/key-editor.md): the keyboard first, an inspector on the right,
zoom and pan, drag handles to make keys wider, and a second layout style (even grid). The saved-data format for sizes and the grid
style already shipped in 1.3.0, so 1.4 needs no further migration for them. Before it, the UI foundation
([proposals/ui-foundation.md](proposals/ui-foundation.md)) and the loading plan
([proposals/loading-and-lifetime.md](proposals/loading-and-lifetime.md)) are built, so the makeover sits on design tokens and shared
building blocks.

## How a release is made
Raise the versions in `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and
`src-tauri/Cargo.lock`, add the CHANGELOG entry, merge into `main`, then GitHub → Actions → **Release** → Run workflow → type the
version → approve the deployment. The steps are in [RELEASING.md](RELEASING.md).
