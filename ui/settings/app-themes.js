// =====================================================================================================================
//  Settings window themes, step 2: the built-in theme files (ui/settings/themes/*.json, listed by the Rust side in
//  commands/appearance.rs) and applying one to the window. Colors come from theme-colors.js; the gallery that picks one
//  is tabs/general-appearance.js; the chosen theme is settings.appearance.theme.
//  The default theme is today's look, written out in settings.css, so applying it just removes what another theme set.
//  The header logo follows the theme (index.html draws it with --logo-* variables); a devbuild keeps its purple logo.
// =====================================================================================================================
import { invoke } from './helpers.js';
import { contrastRatio, themeColors } from './theme-colors.js';

export const DEFAULT_THEME = 'default';

// White text on the accent fills (active tab, primary buttons) needs this contrast; below it, dark text is used.
const MIN_TEXT_CONTRAST = 4.5; // WCAG AA for normal text; tests/ui/app-themes.test.mjs checks every built-in theme
const WHITE = '#ffffff';
const BLACK = '#000000';

let themesPromise = null;

/** The built-in themes, in gallery order (Default first). Read once per window. */
export function loadAppThemes() {
  themesPromise ??= invoke('list_app_themes')
    .then((files) => Promise.all(files.map((file) => fetch(`themes/${file}`).then((reply) => reply.json()))))
    .then((themes) => themes.sort((one, other) => one.order - other.order));
  return themesPromise;
}

/** Every CSS variable a theme sets: its colors, the text color on its accent fills, and the logo's colors. */
export function appThemeVariables(theme) {
  const colors = themeColors(theme.colors);
  const onFill = contrastRatio(WHITE, colors['--color-accent-strong']) >= MIN_TEXT_CONTRAST ? WHITE : BLACK;
  return {
    ...colors,
    '--color-on-fill': onFill,
    '--logo-key': theme.colors.panel,
    '--logo-mark': theme.colors.text,
  };
}

// The variables the last applied theme set, so switching themes (or back to Default) removes them.
let applied = [];

/** Shows the window in a theme (null or the default theme: today's look). */
export function applyAppTheme(theme) {
  const root = document.documentElement;
  for (const name of applied) root.style.removeProperty(name);
  applied = [];
  if (!theme || theme.id === DEFAULT_THEME) return;
  for (const [name, value] of Object.entries(appThemeVariables(theme))) {
    root.style.setProperty(name, value);
    applied.push(name);
  }
}

/** Applies the saved theme when the window opens. An unknown name (a theme removed later) shows the default. */
export async function applySavedAppTheme(themeId) {
  if (!themeId || themeId === DEFAULT_THEME) return;
  const themes = await loadAppThemes();
  applyAppTheme(themes.find((theme) => theme.id === themeId) ?? null);
}
