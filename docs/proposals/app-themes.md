# Proposal: themes for the settings window

Status: **Approved, planned for after v2.0** (2026-10-24): themes change the settings window only, and a custom theme
sets a few base colors. Nothing is built.

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

- **Tokens from base colors.** Today `ui/settings/settings.css` has 58 color tokens in its `:root` block. They are
  rewritten so that each one is either a base color or worked out from base colors with `color-mix()` (lighter, darker,
  see-through versions). The look of the default theme must not change: the screenshot tests prove it
  (`npm run test:visual` with no baseline changes). This restructure is the big step, and comes first, on its own.
- **A theme is one plain data file** in `ui/settings/themes/` (`{ id, name, colors: { background, panel, text, dim,
  accent, error } }`), listed automatically like the overlay's themes and layouts (decision 0006). Adding a theme
  touches one place (CLAUDE.md §1, principle 4).
- **Applying a theme** sets the six base colors as CSS variables on the root element; nothing else changes at run time.
  No timers, no extra cost while idle.
- **Settings:** `appearance: { theme: "default", custom: [] }` in `settings.rs`, cleaned like presets (colors are
  `#rrggbb`), additive, so no migration.

## Tests

- Unit: every built-in theme meets 4.5 : 1 for text on its backgrounds and 3 : 1 for borders and focus outlines
  (a test computes the contrast); every theme file has all six colors; the settings sanitizer keeps only valid colors.
- Visual: one baseline per built-in theme for the General tab; the default theme's baselines stay unchanged.
- End-to-end: picking a theme changes the window and is kept after a restart; a custom theme with low contrast shows
  the warning.

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
