# 0015: Settings window theme colors are worked out in JavaScript
Status: Accepted
Date: 2026-10-31

## Context
A settings window theme sets six base colors, and every other color (borders, hover and pressed shades, the accent
fills, error boxes) has to follow from them. The default theme must look exactly as before. CSS can mix colors with
`color-mix()`, but plain mixing can't reproduce the default's darker blues, and the exact formulas need CSS relative
colors (`oklch(from …)`), which the WebKit on macOS 11 and 12 doesn't have; the app supports both.

## Decision
`ui/settings/theme-colors.js` works out every themed color from the six base colors in OKLCH (each keeps a source
color's hue; its lightness is a fraction of the way from an anchor color toward the text color), and applying a theme
sets the results as CSS variables. The default theme's colors stay written out in `settings.css`, so today's look never
depends on the calculation. This is an exception to "JavaScript sets only geometry" (CLAUDE.md, UI rules), for theme
colors only.

## Why
Exact on every supported system: the formulas give back the default's colors to the last digit (a test checks every
one), and light themes get darker lines where dark themes get lighter ones. Given up: a theme is no longer pure CSS.

## Consequences
A new themed color gets a line in `DERIVED` in `theme-colors.js`, fitted so the default gives back its value in
`settings.css` (`tests/ui/theme-colors.test.mjs` fails otherwise). A color that should stay the same in every theme
stays out of `DERIVED`.
