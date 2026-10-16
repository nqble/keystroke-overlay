# Plan: loading and lifetime across the app (queued, from the Advisory Session)

Status: Queued. Not started. Approved by Jordan in the Advisory Session. It applies the ideas of section 9a of
[../design/key-editor.md](../design/key-editor.md) to the whole app.

Each change is its own commit, with the full tests between them. Benchmark before and after where noted. Stop and report on any
regression, in plain language, with the before and after numbers.

## Findings (v1.3.0-dev)

- Every tab switch rebuilds the tab (`pane.replaceChildren` in `render()`).
- Style, Fonts and Layout fetch their lists from Rust on every open (`list_presets`, `list_fonts`, `list_layouts`).
- Every tab module is imported at start-up, including `debug.js` when Debug mode is off.
- Some actions call `changed(true)` and rebuild the whole tab (for example applying a theme).
- In the overlay, `structKey` includes keySize, gap, fontSize and scale, so those sliders rebuild every key element per change
  (in the preview per input event, in OBS per save).

## A. Settings window (do this in UI foundation step 4, shared building blocks)

1. **A shared tab lifecycle.** Each tab exports `{ mount(container), show(), hide(), update(changes) }` (or similar). It is mounted
   on first visit, hidden (not destroyed) when leaving, and shown when returning, keeping scroll position and local state.
   `render()` stops rebuilding tabs. The key editor (section 9a) uses the same lifecycle. Everything is still destroyed with the
   window (CLAUDE.md principle 3).
2. **Cached lists.** Fetch presets, fonts and layouts once into `state.js`, then refresh only on change (the existing "assets"
   message, or after the tab's own add, delete or import). No round trip on tab switch.
3. **Lazy-load rare or heavy tabs.** `debug.js` only when Debug mode is on (dynamic import), `general.js` on first visit. Small
   tabs may stay eager if measuring shows no difference.
4. **Targeted updates.** Replace `changed(true)` full redraws with updating only the affected controls (for example a theme
   apply refreshes the Style controls' values).
5. **Hidden preview.** While the preview is hidden (Keys tab), keep only the latest settings and post them once when it is shown
   again. No `postMessage` per edit to a hidden frame.

Measure: window open time (no slower than today), every tab switch (target under 50ms after the first visit), memory with all
tabs mounted versus not. Tests: tab state and scroll kept across switches; Style, Fonts and Layout do not call Rust on revisit;
`debug.js` not loaded when Debug mode is off.

## B. Overlay (OBS) (do this in the cleanup phase, overlay area, benchmarked: the overlay's speed is a core promise)

6. Drive keySize, gap, fontSize and scale with CSS custom properties (positions via, for example,
   `calc(var(--x) * var(--pitch))`) so changing them never rebuilds key elements. Remove them from `structKey`. Rebuild only when
   the layout, the layout style or the set of visible keys changes.
7. Incremental profile updates: when positions, sizes, labels or hidden keys change, update only the affected key elements.

Keep animations transform and opacity only. Visual baselines for every built-in theme (UI foundation step 6) must stay
identical. Measure overlay CPU while dragging a slider in the preview, and while typing, before and after.

## C. Cleanup audit (`docs/CLEANUP.md`)

8. Verify the hourly update check is a single sleep or scheduled wake until the next check, not a repeating poll or busy loop,
   and that it does nothing between checks. Report what is found; change nothing unless it is actually wasteful.

Suggested effort: High for A1 and B6 to B7, Medium for the rest.
