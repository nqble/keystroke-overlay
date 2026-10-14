# v1.1.3 — IN PROGRESS (not released)

**Status: code is in this folder and committed in git, but NO release has been built or published.**
To ship it, tell Claude "make the v1.1.3 release" (or run `npm run release -- "notes"` yourself, then
upload `release/1.1.3/*` to a GitHub release tagged `v1.1.3`).

Version numbers in `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` are already 1.1.3.

## What is in this patch
1. **No white flash / instant window** — the settings window has a native dark background and a
   dark first paint, so it appears instantly and never flashes white. The UI draws right away; the live
   preview loads afterwards in the background.
2. **Faster settings window start** — the three start-up IPC calls run in parallel, and the first
   render no longer waits for the preview iframe to report its animation/theme list.
3. **Release-notes loading dots** — `.` `..` `...` (0.3 s per step, 0.1 s hold on the third dot, then
   repeat) while GitHub notes load. Pure CSS (opacity only, no timers).
4. **Typing animation** for the notes once loaded (under 1 second, no layout shift, no timers afterwards).
5. **Subtle optimizations**
   - Overlay gets new settings inside the WebSocket message (3 fewer HTTP requests per change);
     fonts/layouts are only re-fetched when they actually change.
   - Async runtime limited to 2 worker threads (was one per CPU core): fewer threads, less memory.
   - Stuck-key check scans only the keys currently held instead of a 512-slot table on every keystroke.
   (See the final report from the session for measured numbers.)

## Not changed on purpose
- Version number is only bumped in files; no `release/1.1.3` folder exists yet.

## Draft release notes (edit freely)
See bottom of this file after testing is complete.
