// =====================================================================================================================
//  Settings window themes, step 2: the built-in theme files (ui/settings/themes/*.json, listed by the Rust side in
//  commands/appearance.rs) and applying one to the window. Colors come from theme-colors.js; the gallery that picks one
//  is tabs/general-appearance.js; the chosen theme is settings.appearance.theme.
//  The person's own themes are in settings.appearance.custom, made in the edit bar (theme-edit-bar.js).
//  The default theme is today's look, written out in settings.css, so applying it just removes what another theme set.
//  The header logo follows the theme (index.html draws it with --logo-* variables); a devbuild keeps its purple logo.
// =====================================================================================================================
import { invoke } from './helpers.js';
import { settings } from './state.js';
import { textOnAccent, themeColors } from './theme-colors.js';

export const DEFAULT_THEME = 'default';
/** How many themes of their own a person may keep. Keep in step with MAX_CUSTOM_THEMES in commands/appearance.rs. */
export const MAX_CUSTOM_THEMES = 20;
/** The longest theme name. Keep in step with MAX_THEME_NAME in commands/appearance.rs. */
export const MAX_THEME_NAME = 40;

/** A fresh id for a theme of the person's own: a plain identifier, as the settings cleaner requires. */
export const newThemeId = () => `custom-${Date.now().toString(36)}`;

/** The theme with this id among the built-in ones and the person's own; null when there is none (shows Default). */
export function findAppTheme(builtIns, themeId) {
  return [...builtIns, ...settings.appearance.custom].find((theme) => theme.id === themeId) ?? null;
}

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
  return {
    ...colors,
    '--color-on-fill': textOnAccent(colors),
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
  applyAppTheme(findAppTheme(await loadAppThemes(), themeId));
}
