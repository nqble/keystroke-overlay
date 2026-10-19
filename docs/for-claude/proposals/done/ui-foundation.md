# Plan: UI foundation (in progress, from the Advisory Session)

Status: **Done in v1.4.0** (2026-10-17). Steps 1 to 7 are in: test hooks, screenshot
baselines (now also the overlay in every built-in theme), design tokens, shared building blocks, looks moved to CSS (a style check
now keeps inline styles out of the scripts), and the UI rules in CLAUDE.md. The old key picture (`keys-map.js`), the last place that set inline styles, was replaced by
the new editor (M4.1), which sets only CSS variables, so no file is exempt any more apart from the Debug tab.

This plan **replaces the `ui/settings/` part (area 2)** of the queued cleanup phase: the cleanup audit
(`docs/for-claude/CLEANUP.md`) lists these items for `ui/settings` instead of a separate pass. The key editor **redesign** comes after this
plan and is designed in the Advisory Session.

Goal: make a future redesign cheap and safe. Step 3 must change nothing visually; the screenshots prove it.

## Decisions (relayed by the Advisory Session as Jordan's)

- Screenshot tests run locally, with a small tolerance, not in CI. Two development-only dependencies, pinned to exact versions:
  `pixelmatch` and `pngjs`.
- JavaScript may set only geometry that truly varies (key x/y/width, preview scale, drag position), and only through CSS custom
  properties (for example `el.style.setProperty('--x', …)`). All colors, fonts, borders and shadows live in CSS.
- Tokens map today's exact values first (pixel-identical). Tidying the scale happens later, during the redesign.
- Tokens are named by purpose, not by raw value.
- The window stays dark only, but token-ready, so a light theme would later be one added block.
- The Advisory Session builds the Claude Design system right after the tokens land, from the real token list.

**Before acting on two of these the master session asks Jordan to confirm in chat:** adding the dependencies (CLAUDE.md section 7
requires asking, even for development-only ones) and editing CLAUDE.md (step 7).

## Order (each step its own commit or commits; run `npm test`, clippy, `check:format`, `check:privacy` and the full e2e suite between steps; stop and report on any failure)

1. **test: stable test hooks.** Add `data-test="…"` (kebab-case, by purpose, e.g. `layout-add`, `key-x`) to every element the e2e
   tests touch and every important control (tabs, save/import/export buttons, layout cards, key cells, editor fields, popup
   buttons). Rewrite the e2e selectors to use them through one helper (for example `byTest('layout-add')`); no nth-button or
   structural selectors left. Hooks are attributes only: no styling uses them.
2. **test: screenshot baselines.** New `tests/visual/` with `npm run test:visual` and `npm run test:visual -- --update`. Capture each
   settings tab (Layout, Keys with the editor and a key selected, Style, Animation, Fonts, General, Debug if on) plus the main
   popups, at a fixed window size and 100% display scaling, over the existing CDP connection. Freeze what changes between runs
   (version text, timestamps, animations, caret blink, hover). Compare with pixelmatch with a small tolerance; on failure write a
   diff image and print which screens changed. Commit the baselines in `tests/visual/baselines/`. Document in `tests/README.md`
   that baselines come from Jordan's PC and are re-captured (`--update`) only for an intended visual change, with before/after
   shown to Jordan.
3. **refactor(settings): design tokens, pixel-identical.** One `:root` block at the top of `settings.css` holds every color, font
   family, font size and weight, spacing, radius, border width, shadow and transition duration (about 54 hard-coded colors and
   about 200 hard-coded sizes today). Named by purpose and grouped and commented: `--color-bg`, `--color-panel`,
   `--color-panel-raised`, `--color-line`, `--color-text`, `--color-text-dim`, `--color-accent`, `--color-accent-strong`,
   `--color-danger`, `--color-warning`, `--color-focus`; `--space-1…n`; `--radius-sm/md/lg`; `--text-xs/sm/md/lg`;
   `--weight-normal/bold`; `--shadow-popup`; `--duration-fast`. Map the existing `--bg`, `--accent` and the rest to the new names.
   Where two near-identical values exist (for example 10px and 12px) keep both as separate tokens for now and note the merge
   candidates in a comment for the redesign. Proof: `npm run test:visual` passes with zero differences (tolerance only for
   anti-aliasing). Add a check to `check-style.mjs` (or a tiny new check) that fails on raw color values in `ui/settings/*.css`
   outside the `:root` block.
4. **refactor(settings): shared building blocks.** List every control on every tab and popup. Each must come from a shared helper
   (`row`, `toggle`, `button`, select, slider, color picker, number field, card, dialog) or `CONTROLS`. Replace one-off controls
   with helpers; add a helper when a pattern repeats twice or more. Button variants are classes (`primary`, `danger`, `ghost`), not
   inline styles. Each helper gets a short header comment: what it draws, its options, its CSS class. Screenshots stay identical;
   if a one-off control looked different on purpose, keep the look as a named variant and tell Jordan.
5. **refactor(settings): separate look and logic.** Remove the ~24 places where JS sets styles. Colors, fonts and looks move to CSS
   classes and state classes (`.is-selected`, `.is-overlapping`, `.is-dragging`, `.is-disabled`). Only geometry may stay, through
   CSS custom properties. No logic may read computed styles or depend on class names used purely for looks. All user-facing text
   comes from `text.js` / `TEXT`. Screenshots identical.
6. **test(overlay): protect the overlay's look.** The overlay's look stays driven only by settings plus the built-in themes. Add
   visual baselines of the overlay (via `npm run preview` or the e2e app) for every built-in theme (default, glass, minecraft,
   minimal-light, neon) with a fixed layout and a fixed set of held keys. Settings-window work must never change these; changing
   them needs Jordan's explicit OK with before/after shown.
7. **docs: UI rules.** Add a "UI rules" section to CLAUDE.md: (1) use tokens, no raw colors or sizes outside `:root`; (2) build screens
   from the shared building blocks; (3) every interactive element gets a `data-test` hook; (4) JS sets only geometry, via CSS
   variables; (5) no visual change without running `test:visual` and showing before/after screenshots to Jordan; (6) the Claude
   Design system (maintained by the Advisory Session) is the visual reference, and the tokens in `settings.css` are the source of
   truth. Update `ARCHITECTURE.md` (where the tokens, helpers and visual tests live) and `tests/README.md`.

## When it is done

Tell Jordan in a plain-language summary: the commits, test results, token count before and after, remaining JS style uses
(geometry only) and anything skipped. Jordan then brings it to the Advisory Session, which builds the Claude Design system from the
tokens and prototypes the key editor redesign.

If the session's context is close to full when this plan's turn comes, hand it to a fresh session instead.
