// =====================================================================================================================
//  Style → Text → "Add font file…" and "Your fonts" (the Fonts tab used to hold these; ui-design-v2.md, Tabs). The
//  font picker itself is the Font family control in the Text group (controls.js). Part of the Style tab (style.js).
// =====================================================================================================================
import { call, toast } from '../helpers.js';
import { html } from '../html.js';
import { changed } from '../preview.js';
import { render } from '../settings.js';
import { customFonts, setCustomFonts, settings } from '../state.js';

const WORDS = {
  yours: 'Your fonts',
  none: 'No fonts added yet.',
  add: 'Add font file…',
  folder: 'Open fonts folder',
  added: (name) => `Added ${name}`,
  use: 'Use',
  inUse: 'In use',
  remove: 'Remove',
};

/** A font file's family name: the file name without its extension (how the overlay loads it). */
const familyOf = (file) => file.replace(/\.[^.]+$/, '');

async function reloadFonts() {
  setCustomFonts(await call('list_fonts'));
  render();
}

async function addFont() {
  const name = await call('add_font');
  if (!name) return;
  toast(WORDS.added(name));
  await reloadFonts();
}

export function YourFonts() {
  const use = (file) => {
    settings.style.fontFamily = familyOf(file);
    changed(true);
  };
  const remove = async (file) => {
    await call('remove_font', { name: file });
    await reloadFonts();
  };
  return html`<div class="fonts-block">
    <div class="btns">
      <button type="button" data-test="fonts-add" onClick=${addFont}>${WORDS.add}</button>
      <button type="button" data-test="fonts-open-folder" onClick=${() => call('open_folder', { kind: 'fonts' })}>
        ${WORDS.folder}
      </button>
    </div>
    <div class="fontlist" aria-label=${WORDS.yours}>
      ${customFonts.length ? null : html`<p class="note">${WORDS.none}</p>`}
      ${customFonts.map((file) => {
        const inUse = settings.style.fontFamily === familyOf(file);
        return html`<div class="fontitem" data-test="font-item" data-font=${file}>
          <span class="n">${file}</span>
          <button type="button" data-test="font-use" disabled=${inUse} onClick=${() => use(file)}>
            ${inUse ? WORDS.inUse : WORDS.use}
          </button>
          <button type="button" class="danger" data-test="font-remove" onClick=${() => remove(file)}>
            ${WORDS.remove}
          </button>
        </div>`;
      })}
    </div>
  </div>`;
}
