// =====================================================================================================================
//  The Layout tab: pick a keyboard, make your own, share them.
// =====================================================================================================================
import { shareRow } from '../controls.js';
import { call, el, heading, invoke, note, plural, toast } from '../helpers.js';
import { addLayoutDialog, showMenu } from '../popups.js';
import { changed } from '../preview.js';
import { isCustom } from '../profiles.js';
import { render } from '../settings.js';
import { MAX_LAYOUTS, S, layouts, setLayouts, setSelKey } from '../state.js';
import { TEXT } from '../text.js';

// ---- Layout: pick a keyboard, make your own, share them -----------------------------------------------------------
export function layoutTab() {
  const page = el('div');
  page.append(heading('Keyboard layout'), note(TEXT.layoutTabHelp));

  const cards = el('div', { className: 'cards' });
  for (const l of layouts) cards.append(layoutCard(l));
  const mine = layouts.filter((l) => l.user).length;
  cards.append(
    el(
      'div',
      { className: 'card add', title: 'Add a layout', onclick: addLayoutDialog },
      el('span', { className: 'plus', textContent: '+' }),
      el('small', { textContent: `${mine}/${MAX_LAYOUTS} layouts` }),
    ),
  );
  page.append(cards, heading('Share'));
  page.append(
    shareRow('Layouts you made', importLayouts, exportLayouts, !layouts.some((l) => l.user), {
      imp: 'Add layouts from a file someone shared (or that you exported)',
      exp: 'Save the layouts you made, with their key edits, to a file',
    }),
  );
  return page;
}

// ---- Layout tab pieces ----------------------------------------------------------------------------------------------
/** One clickable card in the layout grid. Right-click a layout you made to delete it. */
function layoutCard(l) {
  const deleteItem = l.user
    ? {
        label: 'Delete layout',
        danger: true,
        run: async () => {
          await call('delete_layout', { id: l.id });
          toast(l.name + ' deleted');
        },
      }
    : { label: 'Built-in layouts can’t be deleted', disabled: true };
  return el(
    'div',
    {
      className: 'card' + (S.layout.id === l.id ? ' sel' : ''),
      onclick: () => {
        S.layout.id = l.id;
        setSelKey(null);
        changed(true);
      },
      oncontextmenu: (e) => showMenu(e, [deleteItem]),
    },
    el('b', { textContent: l.name }),
    el('span', { textContent: l.keys.length + ' keys' + (isCustom(l.id) ? ' · customized' : '') }),
  );
}

async function importLayouts() {
  try {
    const result = await invoke('import_layouts');
    if (!result) return; // the user cancelled the file picker
    const [added, skipped] = result;
    if (added) toast(`Imported ${plural(added, 'layout')}` + (skipped ? `, skipped ${skipped}` : ''));
    else toast('Nothing imported' + (skipped ? ` (${skipped} skipped: empty, or the 20-layout limit)` : ''), true);
    setLayouts(await call('list_layouts'));
    render();
  } catch (error) {
    toast(String(error), true);
  }
}

async function exportLayouts() {
  try {
    const count = await invoke('export_layouts');
    if (count) toast(`Exported ${plural(count, 'layout')}`);
  } catch (error) {
    toast(String(error), true);
  }
}
