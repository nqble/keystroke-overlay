// =====================================================================================================================
//  The Style tab (docs/design/ui-design-v2.md, Tabs): the theme gallery and My presets (style-themes.js), then short
//  section cards: Colors, Shape, Text (with your font files, style-fonts.js) and Size. The sliders and color pickers
//  come from the control table (CONTROLS in controls.js), one group per card. The Fonts tab is merged in here.
// =====================================================================================================================
import { MenuButton, Section } from '../blocks.js';
import { ControlGroup } from '../controls.js';
import { call } from '../helpers.js';
import { html } from '../html.js';
import { presets, registry, setPresets } from '../state.js';
import { YourFonts } from './style-fonts.js';
import { PresetGallery, ThemeGallery, applyLook } from './style-themes.js';

const WORDS = {
  title: 'Style',
  subtitle: 'Pick a theme, then fine-tune.',
  reset: 'Reset ▾',
  resetLabel: 'Reset the look',
  resetDefault: 'Back to the default look',
  colors: 'Colors',
  shape: 'Shape',
  text: 'Text',
  size: 'Size',
};

// The theme a reset goes back to (ui/overlay/themes/default.js).
const DEFAULT_THEME = 'default';

/** The saved preset names, asked from the app once and kept; saving or deleting one makes them be asked for again. */
async function presetNames() {
  if (presets) return presets;
  const names = await call('list_presets');
  setPresets(names);
  return names;
}

export async function styleTab() {
  return html`<${Style} presetNames=${await presetNames()} />`;
}

function Style({ presetNames: names }) {
  const resetToDefault = () => {
    const theme = registry.themes.find((candidate) => candidate.id === DEFAULT_THEME);
    if (theme) applyLook(theme);
  };
  return html`<div class="tab-page">
    <div class="tab-heading with-action">
      <div>
        <h2 data-test="section-heading">${WORDS.title}</h2>
        <p class="note">${WORDS.subtitle}</p>
      </div>
      <${MenuButton}
        text=${WORDS.reset}
        label=${WORDS.resetLabel}
        test="style-reset"
        items=${[{ label: WORDS.resetDefault, run: resetToDefault }]}
      />
    </div>
    <${ThemeGallery} />
    <${PresetGallery} names=${names} />
    <div class="section-grid">
      <${Section} title=${WORDS.colors} test="style-colors"><${ControlGroup} tab="style" group="Key colors" /><//>
      <${Section} title=${WORDS.shape} test="style-shape"><${ControlGroup} tab="style" group="Shape" /><//>
      <${Section} title=${WORDS.text} test="style-text">
        <${ControlGroup} tab="style" group="Text" />
        <${YourFonts} />
      <//>
      <${Section} title=${WORDS.size} test="style-size"><${ControlGroup} tab="style" group="Size" /><//>
    </div>
  </div>`;
}
