// =====================================================================================================================
//  General → Appearance: the gallery of settings window themes (docs/proposals/app-themes.md). Clicking a card changes
//  the whole window at once and saves the choice (settings.appearance.theme). The themes and applying them are in
//  app-themes.js; each card's picture is the theme's own colors in a tiny window (tabs.css, .theme-swatch).
// =====================================================================================================================
import { GalleryCard, Section } from '../blocks.js';
import { applyAppTheme, DEFAULT_THEME, loadAppThemes } from '../app-themes.js';
import { html, useEffect, useState } from '../html.js';
import { changed } from '../preview.js';
import { settings } from '../state.js';

const WORDS = {
  title: 'Appearance',
  help: 'The look of this window. It doesn’t change the overlay in OBS (that’s the Style tab).',
  keycaps: 'keycaps',
};

export function Appearance() {
  const [themes, setThemes] = useState([]);
  useEffect(() => {
    loadAppThemes().then(setThemes);
  }, []);
  const current = settings.appearance.theme;
  const choose = (theme) => {
    settings.appearance.theme = theme.id;
    applyAppTheme(theme);
    changed(true);
  };
  return html`<${Section} title=${WORDS.title} test="general-appearance">
    <p class="note">${WORDS.help}</p>
    <div class="gallery" data-test="app-themes">
      ${themes.map(
        (theme) =>
          html`<${GalleryCard}
            title=${theme.name}
            tip=${theme.credit ?? null}
            selected=${theme.id === current || (theme.id === DEFAULT_THEME && !themes.some((t) => t.id === current))}
            onSelect=${() => choose(theme)}
            test=${'app-theme-' + theme.id}
          >
            <${ThemeSwatch} colors=${theme.colors} />
            ${theme.kind === 'keycaps' ? html`<span class="theme-kind">${WORDS.keycaps}</span>` : null}
          <//>`,
      )}
    </div>
  <//>`;
}

/** A tiny window in the theme's own colors: background, a panel with a text line and a dim line, an accent button. */
function ThemeSwatch({ colors }) {
  const swatchColors = {
    '--swatch-background': colors.background,
    '--swatch-panel': colors.panel,
    '--swatch-text': colors.text,
    '--swatch-dim': colors.dim,
    '--swatch-accent': colors.accent,
  };
  return html`<span class="theme-swatch" style=${swatchColors}>
    <span class="swatch-panel"><span class="swatch-text"></span><span class="swatch-dim"></span></span>
    <span class="swatch-accent"></span>
  </span>`;
}
