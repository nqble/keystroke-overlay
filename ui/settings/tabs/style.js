// =====================================================================================================================
//  The Style tab: themes, presets, colours, shape, text and size.
// =====================================================================================================================
import { renderControls, shareRow } from '../controls.js';
import { button, call, el, heading, row, toast } from '../helpers.js';
import { changed } from '../preview.js';
import { render } from '../settings.js';
import { settings, registry } from '../state.js';

// ---- Style: themes, presets, colours, shape, text, size -----------------------------------------------------------
export async function styleTab() {
  const page = el('div');
  page.append(heading('Themes & presets'));

  const themes = el(
    'select',
    {},
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

  const names = await call('list_presets');
  const saved = el(
    'select',
    {},
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
      button('Load', async () => {
        if (saved.value) apply(await call('load_preset', { name: saved.value }));
      }),
      button(
        'Delete',
        async () => {
          if (saved.value) {
            await call('delete_preset', { name: saved.value });
            render();
          }
        },
        'danger',
      ),
    ),
  );

  const nameInput = el('input', { type: 'text', placeholder: 'Preset name' });
  page.append(
    row(
      'Save current as',
      nameInput,
      button('Save', async () => {
        await call('save_preset', { name: nameInput.value, data: currentLook() });
        toast('Preset saved');
        render();
      }),
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
    ),
  );
  renderControls('style', page);
  return page;
}
