// =====================================================================================================================
//  Plain logic for the Style tab's theme cards (tabs/style.js), so tests/ui/themes.test.mjs can check it without a page:
//  which theme the current look is, and the CSS variables that draw a theme's two sample keys. A theme is one file in
//  ui/overlay/themes/ (docs/EXTENDING.md); its card is drawn from that file, so a new theme needs nothing here.
// =====================================================================================================================

/** True when every style value the theme sets is what the look has now (the user hasn't changed any of them since). */
export function themeMatches(theme, style) {
  return Object.entries(theme.style ?? {}).every(([name, value]) => style?.[name] === value);
}

/**
 * The CSS variables (blocks.css, .theme-key) for one sample key of a theme: its colours, border and corners as the
 * theme sets them. `pressed` draws the key while it is held.
 */
export function themeKeyVars(style, pressed) {
  return {
    '--key-fill': pressed ? style.keyFillPressed : style.keyFill,
    '--key-border': pressed ? style.borderColorPressed : style.borderColor,
    '--key-text': pressed ? style.textColorPressed : style.textColor,
    '--key-border-width': `${Math.min(style.borderWidth ?? 2, 3)}px`,
    '--key-radius': `${Math.min(style.radius ?? 8, 12)}px`,
    '--key-font': style.fontFamily ?? 'inherit',
  };
}
