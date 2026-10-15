// =====================================================================================================================
//  The Fonts tab: add your own font files.
// =====================================================================================================================
import { button, call, el, heading, note, toast } from '../helpers.js';
import { changed } from '../preview.js';
import { render } from '../settings.js';
import { settings, customFonts, setCustomFonts } from '../state.js';
import { TEXT } from '../text.js';

// ---- Fonts: add your own font files -------------------------------------------------------------------------------
export async function fontsTab() {
  const page = el('div');
  page.append(heading('Custom fonts'), note(TEXT.fontsTabHelp));
  page.append(
    el(
      'div',
      { className: 'btns' },
      button(
        'Add font…',
        async () => {
          const name = await call('add_font');
          if (name) {
            toast('Added ' + name);
            await reloadFonts();
            render();
          }
        },
        'primary',
      ),
      button('Open fonts folder', () => call('open_folder', { kind: 'fonts' })),
    ),
  );

  const list = el('div', { className: 'fontlist' });
  if (!customFonts.length) list.append(note('No custom fonts yet.'));
  for (const file of customFonts) {
    const family = file.replace(/\.[^.]+$/, '');
    list.append(
      el(
        'div',
        { className: 'fontitem' },
        el('span', { className: 'n', textContent: file }),
        button(settings.style.fontFamily === family ? 'In use' : 'Use', () => {
          settings.style.fontFamily = family;
          changed(true);
        }),
        button(
          'Remove',
          async () => {
            await call('remove_font', { name: file });
            await reloadFonts();
            render();
          },
          'danger',
        ),
      ),
    );
  }
  page.append(list);
  return page;
}

// ---- General tab sections (one function per heading, in the order they are shown) ----
async function reloadFonts() {
  setCustomFonts(await call('list_fonts'));
}
