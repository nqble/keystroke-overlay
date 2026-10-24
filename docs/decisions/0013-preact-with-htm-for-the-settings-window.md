# 0013: Preact with htm for the settings window
Status: Accepted (v2.0)
Date: 2026-10-17

## Context
[0001](0001-plain-web-code-no-build-step.md) kept both pages plain JavaScript and accepted a cost: keeping the screen in
sync with the data by hand gets harder as the settings window grows. The v2.0 redesign
([ui-design-v2.md](../design/ui-design-v2.md)) adds exactly the screens where that gets tangled: drag-to-reorder cards,
galleries, menus, the first run setup screen and the key editor.

## Decision
The settings window uses **Preact with htm** (the maintainer approved it on 2026-10-17). The libraries are copied into
`ui/settings/vendor/` by `tools/vendor.mjs`, pinned to exact versions and fingerprint-checked by a unit test; nothing is
fetched at run time. Markup is written with the `html` tag from `ui/settings/html.js`. There is still **no build step**:
change a file, reload, see it. The overlay OBS shows stays plain JavaScript with no library.

## Why
- Each screen says what it looks like for the current state, and Preact updates the page; that reads better top to bottom.
- htm needs no compiler and no `eval`, so the window's security policy (`script-src 'self'`) allows it. Alpine, Vue
  without a build and petite-vue need `unsafe-eval`; Svelte, Solid and React need a build step.
- Small (about 7 KB gzipped for Preact, its hooks and htm), and the React model most contributors know.

## Consequences
- 0001 still holds for the overlay, and for "no build step" everywhere.
- Plain logic stays in plain, unit-tested functions; components only draw.
- Updating the libraries is a dependency change: run `tools/vendor.mjs` with the new version and review it like any other.
- The full plan and its measurements: [v2-preact.md](https://github.com/nqble/keystroke-overlay/blob/9f1ac68/docs/for-claude/proposals/done/v2-preact.md) (in git history).
