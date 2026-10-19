// =====================================================================================================================
//  The Style tab: themes, presets, colors, shape, text and size.
// =====================================================================================================================
import { renderControls, shareRow } from '../controls.js';
import { button, call, el, heading, row, toast } from '../helpers.js';
import { changed } from '../preview.js';
import { render } from '../settings.js';
import { settings, registry, presets, setPresets } from '../state.js';

/** Ask the app for the saved preset names and keep them. */
async function loadPresets() {
  const names = await call('list_presets');
  setPresets(names);
  return names;
}

// ---- Style: themes, presets, colors, shape, text, size -----------------------------------------------------------
export async function styleTab() {
  const page = el('div');
  page.append(heading('Themes & presets'));

  const themes = el(
    'select',
    { test: 'style-theme' },
    el('option', { value: '', textContent: 'Built-in themes…' }),
    registry.themes.map((t) => el('option', { value: t.id, textContent: t.name })),
  );
  themes.onchange = () => {
    const theme = registry.themes.find((t) => t.id === themes.value);
    if (!theme) return;
    Object.assign(settings.style, theme.style);
    Object.assign(settings.animation, theme.animation);
    changed(true);
  };
  page.append(row('Built-in theme', themes));

  // the preset names are fetched once and kept; saving or deleting a preset (below) makes them be fetched again
  const names = presets ?? (await loadPresets());
  const saved = el(
    'select',
    { test: 'preset-select' },
    el('option', { value: '', textContent: names.length ? 'My presets…' : 'No saved presets yet' }),
    names.map((n) => el('option', { value: n, textContent: n })),
  );
  const apply = (data) => {
    // used by Load and by Import
    if (data.style) Object.assign(settings.style, data.style);
    if (data.animation) Object.assign(settings.animation, data.animation);
    changed(true);
  };
  const currentLook = () => ({ style: settings.style, animation: settings.animation });
  page.append(
    row(
      'My presets',
      saved,
      button(
        'Load',
        async () => {
          if (saved.value) apply(await call('load_preset', { name: saved.value }));
        },
        '',
        'preset-load',
      ),
      button(
        'Delete',
        async () => {
          if (saved.value) {
            await call('delete_preset', { name: saved.value });
            setPresets(null);
            render();
          }
        },
        'danger',
        'preset-delete',
      ),
    ),
  );

  const nameInput = el('input', { type: 'text', placeholder: 'Preset name', test: 'preset-name' });
  page.append(
    row(
      'Save current as',
      nameInput,
      button(
        'Save',
        async () => {
          await call('save_preset', { name: nameInput.value, data: currentLook() });
          setPresets(null);
          toast('Preset saved');
          render();
        },
        '',
        'preset-save',
      ),
    ),
  );
  page.append(
    shareRow(
      'Share style',
      async () => {
        const data = await call('import_preset');
        if (data) {
          apply(data);
          toast('Imported');
        }
      },
      async () => {
        if (await call('export_preset', { data: currentLook() })) toast('Exported');
      },
      false,
      { imp: 'Load a style from a file someone shared', exp: 'Save the current style and animation to a file' },
      'style',
    ),
  );
  renderControls('style', page);
  return page;
}
