// =====================================================================================================================
//  The theme edit bar (docs/design/ui-design-v2.md, section 14): docked along the bottom of the window, never a popup, so the whole
//  window shows the new colors while the person picks them, and it stays while they move between tabs to check every
//  screen. Opened by "+ New theme" or a custom theme's Edit (tabs/general-appearance.js); Save keeps the theme in
//  settings.appearance.custom and picks it, Cancel puts the colors back. Drawn into #themeEditBar in index.html.
// =====================================================================================================================
import { applyAppTheme, findAppTheme, loadAppThemes, newThemeId, MAX_THEME_NAME } from './app-themes.js';
import { call, toast } from './helpers.js';
import { html, render as draw, useState } from './html.js';
import { changed } from './preview.js';
import { settings } from './state.js';
import { readabilityProblems } from './theme-colors.js';

const TEXT = {
  title: 'Edit theme',
  name: 'Name',
  colors: {
    background: 'Window',
    panel: 'Panels',
    text: 'Text',
    dim: 'Dim text',
    accent: 'Accent',
    error: 'Errors',
  },
  easyToRead: 'Easy to read',
  hardToRead: (problem) => `Some text is hard to read: ${problem.what}, ${problem.ratio.toFixed(1)} : 1`,
  export: 'Export…',
  exported: 'Theme exported',
  cancel: 'Cancel',
  save: 'Save',
  saved: (name) => `Saved “${name}”`,
  needsName: 'Give the theme a name first',
};

const host = () => document.getElementById('themeEditBar');

/** Opens the bar on a copy of `theme` (a custom theme to change, or any theme to start a new one from). */
export function openThemeEditor(theme, { isNew }) {
  const draft = {
    id: isNew ? newThemeId() : theme.id,
    name: isNew ? `${theme.name} copy`.slice(0, MAX_THEME_NAME) : theme.name,
    colors: { ...theme.colors },
  };
  document.body.classList.add('editing-theme');
  applyAppTheme(draft);
  draw(html`<${EditBar} start=${draft} />`, host());
}

/** Closes the bar and shows the saved theme again. */
async function closeThemeEditor() {
  draw(null, host());
  document.body.classList.remove('editing-theme');
  applyAppTheme(findAppTheme(await loadAppThemes(), settings.appearance.theme));
}

function EditBar({ start }) {
  const [draft, setDraft] = useState(start);
  const update = (changes) => {
    const next = { ...draft, ...changes, colors: { ...draft.colors, ...changes.colors } };
    setDraft(next);
    applyAppTheme(next);
  };
  return html`<div class="theme-edit-bar" role="region" aria-label=${TEXT.title} data-test="theme-edit-bar">
    <label class="theme-edit-name">
      ${TEXT.name}
      <input
        type="text"
        maxlength=${MAX_THEME_NAME}
        value=${draft.name}
        data-test="theme-edit-name"
        onInput=${(inputEvent) => update({ name: inputEvent.currentTarget.value })}
      />
    </label>
    ${Object.entries(TEXT.colors).map(
      ([colorName, label]) =>
        html`<label class="theme-edit-color">
          <input
            type="color"
            value=${draft.colors[colorName]}
            data-test=${'theme-edit-' + colorName}
            onInput=${(inputEvent) => update({ colors: { [colorName]: inputEvent.currentTarget.value } })}
          />
          ${label}
        </label>`,
    )}
    <${ReadabilityNote} colors=${draft.colors} />
    <div class="theme-edit-buttons">
      <button type="button" data-test="theme-edit-export" onClick=${() => exportTheme(draft)}>${TEXT.export}</button>
      <button type="button" data-test="theme-edit-cancel" onClick=${closeThemeEditor}>${TEXT.cancel}</button>
      <button type="button" class="primary" data-test="theme-edit-save" onClick=${() => saveTheme(draft)}>
        ${TEXT.save}
      </button>
    </div>
  </div>`;
}

/** "Easy to read", or the worst problem in the error color: a warning, never a lock (the person may still save). */
function ReadabilityNote({ colors }) {
  const problems = readabilityProblems(colors);
  if (!problems.length)
    return html`<p class="note theme-edit-note" data-test="theme-edit-readable">${TEXT.easyToRead}</p>`;
  const worst = problems.reduce((one, other) => (other.ratio / other.needs < one.ratio / one.needs ? other : one));
  return html`<p class="note theme-edit-note danger-note" role="status" data-test="theme-edit-hard-to-read">
    ${TEXT.hardToRead(worst)}
  </p>`;
}

async function exportTheme(draft) {
  if (await call('export_app_theme', { theme: draft })) toast(TEXT.exported);
}

function saveTheme(draft) {
  const name = draft.name.trim();
  if (!name) {
    toast(TEXT.needsName, true);
    return;
  }
  const saved = { ...draft, name };
  const custom = settings.appearance.custom;
  const known = custom.some((theme) => theme.id === draft.id);
  settings.appearance.custom = known
    ? custom.map((theme) => (theme.id === draft.id ? saved : theme))
    : [...custom, saved];
  settings.appearance.theme = draft.id;
  changed(true, true);
  toast(TEXT.saved(name));
  closeThemeEditor();
}
