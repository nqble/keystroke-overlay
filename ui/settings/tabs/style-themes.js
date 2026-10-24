// =====================================================================================================================
//  Style → the theme gallery and My presets (docs/design/ui-design-v2.md, Tabs). Theme cards are drawn from the theme
//  files the live preview reports (registry.themes), so a new theme in ui/overlay/themes/ appears here by itself.
//  Part of the Style tab (style.js); plain logic in themes.js.
// =====================================================================================================================
import { GalleryCard } from '../blocks.js';
import { call, el, toast } from '../helpers.js';
import { html } from '../html.js';
import { dialog } from '../popup.js';
import { changed } from '../preview.js';
import { render } from '../settings.js';
import { registry, setPresets, settings } from '../state.js';
import { themeKeyVars, themeMatches } from '../themes.js';

const WORDS = {
  themes: 'Themes',
  presets: 'My presets',
  saveLook: '+ Save current look',
  saveTitle: 'Save current look',
  saveHelp: 'Saves your colors, shape, text, size and animation.',
  namePlaceholder: 'Preset name',
  cancel: 'Cancel',
  save: 'Save',
  saved: 'Preset saved',
  presetDetail: 'Your preset',
  more: (name) => `More for ${name}`,
  load: 'Use this look',
  remove: 'Delete',
  import: 'Import…',
  export: 'Export…',
  imported: 'Imported',
  exported: 'Exported',
  importTip: 'Load a look from a file',
  exportTip: 'Save this look to a file',
};

/** A look from a theme, a preset or a shared file replaces the current style and animation. */
export function applyLook(look) {
  if (look.style) Object.assign(settings.style, look.style);
  if (look.animation) Object.assign(settings.animation, look.animation);
  changed(true);
}

const currentLook = () => ({ style: settings.style, animation: settings.animation });

/** Two sample keys, idle and pressed, in the theme's own look. */
function ThemePicture({ style }) {
  const key = (label, pressed) => html`<span class="theme-key" style=${themeKeyVars(style, pressed)}>${label}</span>`;
  return html`<span class="theme-stage">${key('W', false)}${key('A', true)}</span>`;
}

export function ThemeGallery() {
  return html`<div class="gallery-block">
    <h3 class="section-title">${WORDS.themes}</h3>
    <div class="gallery" data-test="style-themes">
      ${registry.themes.map(
        (theme) =>
          html`<${GalleryCard}
            title=${theme.name}
            selected=${themeMatches(theme, settings.style)}
            onSelect=${() => applyLook(theme)}
            test=${'theme-card-' + theme.id}
          >
            <${ThemePicture} style=${theme.style} />
          <//>`,
      )}
    </div>
  </div>`;
}

function savePresetDialog() {
  const nameInput = el('input', {
    type: 'text',
    placeholder: WORDS.namePlaceholder,
    maxLength: 40,
    test: 'preset-name',
  });
  const save = async () => {
    if (!nameInput.value.trim()) return false;
    await call('save_preset', { name: nameInput.value.trim(), data: currentLook() });
    setPresets(null); // fetched again on the next draw
    toast(WORDS.saved);
    render();
  };
  dialog({
    title: WORDS.saveTitle,
    body: [el('p', { textContent: WORDS.saveHelp }), nameInput],
    buttons: [
      { label: WORDS.cancel, test: 'dialog-cancel' },
      { label: WORDS.save, test: 'preset-save', primary: true, run: save },
    ],
  });
  nameInput.focus();
}

async function shareImport() {
  const look = await call('import_preset');
  if (!look) return;
  applyLook(look);
  toast(WORDS.imported);
}

async function shareExport() {
  if (await call('export_preset', { data: currentLook() })) toast(WORDS.exported);
}

export function PresetGallery({ names }) {
  const load = async (name) => applyLook(await call('load_preset', { name }));
  const remove = async (name) => {
    await call('delete_preset', { name });
    setPresets(null);
    render();
  };
  return html`<div class="gallery-block">
    <h3 class="section-title">${WORDS.presets}</h3>
    <div class="gallery" data-test="style-presets">
      <button type="button" class="gallery-card add" data-test="preset-new" onClick=${savePresetDialog}>
        ${WORDS.saveLook}
      </button>
      ${names.map(
        (name) =>
          html`<${GalleryCard}
            title=${name}
            detail=${WORDS.presetDetail}
            selected=${false}
            onSelect=${() => load(name)}
            test="preset-card"
            menu=${{
              label: WORDS.more(name),
              test: 'preset-menu',
              items: [
                { label: WORDS.load, run: () => load(name) },
                { label: WORDS.remove, danger: true, run: () => remove(name) },
              ],
            }}
          />`,
      )}
    </div>
    <div class="btns">
      <button type="button" data-test="style-import" title=${WORDS.importTip} onClick=${shareImport}>
        ${WORDS.import}
      </button>
      <button type="button" data-test="style-export" title=${WORDS.exportTip} onClick=${shareExport}>
        ${WORDS.export}
      </button>
    </div>
  </div>`;
}
