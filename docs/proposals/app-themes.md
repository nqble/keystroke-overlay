# Proposal: themes for the settings window

Status: **Approved, in progress** (2026-10-24; started 2026-10-31): themes change the settings window only, and a
custom theme sets a few base colors. Built: colors from base colors, 18 built-in themes, the General → Appearance
gallery and the theme-colored header logo. Next: making your own theme (the edit bar, import and export, the
contrast warning).

Lets a person change how the settings window looks: pick a built-in theme from a gallery, or make their own by changing
a few base colors. The overlay OBS shows keeps its own themes (`ui/overlay/themes/`), as today. Inspired by the wide
range of built-in themes in Monkeytype (monkeytype.com). No theme files or code are taken from it (it is GPL-3.0, this
app is MIT), and the docs thank it.

## What the person sees

- **General → Appearance** (or a section of the Style tab; decided while designing): a gallery of theme cards, the same
  cards as the Style tab's themes, each showing its colors. Clicking one changes the whole window at once.
- **Make your own:** start from any theme and change its **base colors** with color pickers: background, panel, text,
  dim text, accent and error. Everything else follows from those, so a custom theme always looks finished. Saved like a
  preset; at most 20. **Export and import** a theme as a small file, so people can share them.
- **Editing happens in place, never in a popup:** the whole window must change live while the person picks colors, and a
  popup would hide most of it. Decided 2026-10-24: a **docked edit bar** along the bottom of the window. **+ New theme**
  (a dashed card at the end of the gallery, like **+ New layout**) or **Edit** in a custom theme's **⋯** menu opens it.
  The bar holds the six color pickers with their names, the contrast note ("Easy to read", or "Some text is hard to
  read" in the error color, with the ratio), and **Export…**, **Cancel** and **Save**. It stays while the person moves
  between tabs, so every screen can be checked in the new colors; Cancel puts the colors back as they were.
- **Import…** sits next to **+ New theme** in the gallery; a theme's **⋯** menu has **Export…**, like the Layout tab.
- **A warning, not a lock,** when a custom theme makes text hard to read (below the WCAG AA contrast ratio, 4.5 : 1 for
  text): the window says so next to the picker.
- The default theme is today's look, so nothing changes until the person picks another one (new features are off by
  default, CLAUDE.md §4).

## How it is built

- **Colors from base colors, in JavaScript** (decided 2026-10-31). `ui/settings/theme-colors.js` works out every
  themed color from the six base colors: each keeps the hue of a source base color, and its lightness is a fraction of
  the way from an anchor color toward the text color, so light themes get darker lines and dark themes lighter ones. The
  numbers were fitted so the default theme gives back today's colors exactly (`tests/ui/theme-colors.test.mjs`). The
  default theme's colors stay written out in `settings.css`; a picked theme sets the results as CSS variables. Not CSS
  `color-mix()`: matching the default's blues needs CSS relative colors, which the WebKit on macOS 11 and 12 lacks.
  Colors that mean something (live green, paused amber, the window's red close button, release-note colors) stay the
  same in every theme. **Built (step 1).**
- **A theme is one plain data file** in `ui/settings/themes/` (`{ id, name, colors: { background, panel, text, dim,
  accent, error } }`), listed automatically like the overlay's themes and layouts (decision 0006). Adding a theme
  touches one place (CLAUDE.md §1, principle 4).
- **Applying a theme** sets its colors (`themeColors()`) as CSS variables on the root element; nothing else changes at
  run time.
  No timers, no extra cost while idle.
- **Icons follow the theme too.** Icons drawn in the page, like the GitHub button's mark under the tabs, use the text
  color of their button (`currentColor`, from `--color-text-dim` and `--color-text`), never a fixed color, so every theme
  recolors them. A new icon does the same.
- **The logo in the header follows the theme.** Today it is a picture (`ui/settings/logo.png`), which can't change color.
  It becomes the same drawing inline in `index.html` (from `assets/logo/logo.svg`), with its three colors from tokens:
  the outer square from the accent, the key from the panel color, the K from the text on the accent. **A devbuild keeps
  its fixed purple logo in every theme** (`assets/logo/logo-dev.svg`): when the page has the DEV badge, CSS gives the
  logo the devbuild's own colors, which no theme changes, so a devbuild is always recognizable. The icons the system
  draws (taskbar, tray or menu bar, installer, Dock) are files and keep the app's own colors in every theme.
- **Settings:** `appearance: { theme: "default", custom: [] }` in `settings.rs`, cleaned like presets (colors are
  `#rrggbb`), additive, so no migration.

## Tests

- Unit: every built-in theme meets 4.5 : 1 for text on its backgrounds and 3 : 1 for borders and focus outlines
  (a test computes the contrast); every theme file has all six colors; the settings sanitizer keeps only valid colors.
- Visual: one baseline per built-in theme for the General tab, which includes the tab bar and its GitHub button; the
  default theme's baselines stay unchanged. The contrast test for dim text covers the GitHub mark, since it uses the same
  color.
- End-to-end: picking a theme changes the window and is kept after a restart; a custom theme with low contrast shows
  the warning.
- The header logo: with the default theme it looks exactly as today (visual baselines unchanged); with another theme
  its colors change; with the DEV badge it stays purple whatever the theme (`tools/devbuild.mjs --verify` already
  checks the logo is purple).

## Built-in themes

- **Default** is today's look (near-black with a blue-gray tint and one electric blue), and keeps that name.
- **Well-known palettes from keycap sets** (Olivia, from the GMK Olivia keycaps, for example) use the same colors and
  the familiar name, as Monkeytype does, with a credit line in the theme file and in the gallery's tooltip naming the
  keycap set and its designer. Colors alone are not anyone's property; the credit makes clear the name is theirs.
- **Our own palettes** fill the range: a few dark ones, a few light ones, muted, retro, and a high contrast one (helpful
  for low vision, `docs/ACCESSIBILITY.md`).
- Every theme must look good, not just pass the contrast test: each one is shown side by side as a mockup before it is
  built, and only the ones the maintainer picks go in. Anyone can add one with a single file.
- **About 18 to start, Default included** (decided 2026-10-24). The gallery order is Default, then the keycap-set themes
  (each card marked **keycaps**), then our own. A couple more keycap sets beyond Olivia, 8008, Laser and Nord are to be
  picked later. Our own themes carry no "Our own" label; a borrowed theme's card shows its credit as a tooltip.

## Size

About 3 to 5 working sessions (a rough estimate): the token restructure (1 to 2), the themes and gallery (1 to 2), tests
and screenshots (1).

## Open questions

1. Which other keycap sets to add.
