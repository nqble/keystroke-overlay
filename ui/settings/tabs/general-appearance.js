// =====================================================================================================================
//  General → Appearance: the gallery of settings window themes (docs/design/ui-design-v2.md, section 14). Clicking a card changes
//  the whole window at once and saves the choice (settings.appearance.theme). After the built-in themes come the
//  person's own (settings.appearance.custom), each with a ⋯ menu, then "+ New theme" and Import…. Making or changing
//  one happens in the docked edit bar (theme-edit-bar.js). Loading and applying themes: app-themes.js. Each card's
//  picture is the theme's colors in a tiny window (tabs.css, .theme-swatch).
// =====================================================================================================================
import { applyAppTheme, findAppTheme, loadAppThemes, MAX_CUSTOM_THEMES, newThemeId } from '../app-themes.js';
import { GalleryCard, Section } from '../blocks.js';
import { confirmDialog } from '../dialogs.js';
import { call, toast } from '../helpers.js';
import { html, useEffect, useState } from '../html.js';
import { changed } from '../preview.js';
import { settings } from '../state.js';
import { openThemeEditor } from '../theme-edit-bar.js';

const WORDS = {
  title: 'Appearance',
  help: 'The look of this window. It doesn’t change the overlay in OBS (that’s the Style tab).',
  keycaps: 'keycaps',
  add: '+ New theme',
  addTip: 'Start from the theme you use now and change its colors',
  import: 'Import…',
  imported: (name) => `Imported “${name}”`,
  limit: `You have ${MAX_CUSTOM_THEMES} themes of your own, the most allowed. Delete one to add another.`,
  more: (name) => `More for ${name}`,
  edit: 'Edit',
  export: 'Export…',
  exported: 'Theme exported',
  delete: 'Delete…',
  deleteTitle: (name) => `Delete “${name}”?`,
  deleteBody: 'The theme is removed from this computer. An exported copy stays where you saved it.',
  deleteConfirm: 'Delete theme',
};

export function Appearance() {
  const [builtIns, setBuiltIns] = useState([]);
  useEffect(() => {
    loadAppThemes().then(setBuiltIns);
  }, []);
  const current = findAppTheme(builtIns, settings.appearance.theme)?.id ?? 'default';
  return html`<${Section} title=${WORDS.title} test="general-appearance">
    <p class="note">${WORDS.help}</p>
    <div class="gallery" data-test="app-themes">
      ${builtIns.map((theme) => html`<${ThemeCard} theme=${theme} current=${current} />`)}
      ${settings.appearance.custom.map(
        (theme) => html`<${ThemeCard} theme=${theme} current=${current} menu=${customMenu(theme)} />`,
      )}
      <button
        type="button"
        class="gallery-card add"
        title=${WORDS.addTip}
        data-test="app-theme-add"
        onClick=${() => newTheme(builtIns)}
      >
        ${WORDS.add}
      </button>
    </div>
    <div class="btns">
      <button type="button" data-test="app-theme-import" onClick=${importTheme}>${WORDS.import}</button>
    </div>
  <//>`;
}

function ThemeCard({ theme, current, menu = null }) {
  return html`<${GalleryCard}
    title=${theme.name}
    note=${theme.kind === 'keycaps' ? WORDS.keycaps : null}
    tip=${theme.credit ?? null}
    selected=${theme.id === current}
    onSelect=${() => choose(theme)}
    menu=${menu}
    test=${'app-theme-' + theme.id}
  >
    <${ThemeSwatch} colors=${theme.colors} />
  <//>`;
}

function choose(theme) {
  settings.appearance.theme = theme.id;
  applyAppTheme(theme);
  changed(true);
}

const atLimit = () => settings.appearance.custom.length >= MAX_CUSTOM_THEMES;

function newTheme(builtIns) {
  if (atLimit()) return toast(WORDS.limit, true);
  const start = findAppTheme(builtIns, settings.appearance.theme) ?? builtIns[0];
  openThemeEditor(start, { isNew: true });
}

async function importTheme() {
  if (atLimit()) return toast(WORDS.limit, true);
  const theme = await call('import_app_theme');
  if (!theme) return;
  const imported = { ...theme, id: newThemeId() };
  settings.appearance.custom = [...settings.appearance.custom, imported];
  choose(imported);
  toast(WORDS.imported(imported.name));
}

function customMenu(theme) {
  return {
    label: WORDS.more(theme.name),
    test: 'app-theme-menu',
    items: [
      { label: WORDS.edit, run: () => openThemeEditor(theme, { isNew: false }) },
      { label: WORDS.export, run: async () => (await call('export_app_theme', { theme })) && toast(WORDS.exported) },
      { label: WORDS.delete, danger: true, run: () => deleteTheme(theme) },
    ],
  };
}

function deleteTheme(theme) {
  confirmDialog({
    title: WORDS.deleteTitle(theme.name),
    body: WORDS.deleteBody,
    confirmLabel: WORDS.deleteConfirm,
    test: 'dialog-delete-theme-confirm',
    onConfirm: () => {
      settings.appearance.custom = settings.appearance.custom.filter((kept) => kept.id !== theme.id);
      if (settings.appearance.theme === theme.id) {
        settings.appearance.theme = 'default';
        applyAppTheme(null);
      }
      changed(true);
    },
  });
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
