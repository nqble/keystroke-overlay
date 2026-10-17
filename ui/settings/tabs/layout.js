// =====================================================================================================================
//  The Layout tab: pick a keyboard, make your own, share them.
// =====================================================================================================================
import { shareRow } from '../controls.js';
import { call, el, heading, invoke, note, plural, toast } from '../helpers.js';
import { addLayoutDialog, showMenu } from '../popups.js';
import { changed } from '../preview.js';
import { isCustom } from '../profiles.js';
import { render } from '../settings.js';
import { MAX_LAYOUTS, settings, layouts, setLayouts, setSelectedKey } from '../state.js';
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
      'button',
      {
        type: 'button',
        className: 'card add',
        title: 'Add a layout',
        ariaLabel: 'Add a layout',
        onclick: addLayoutDialog,
        test: 'layout-add',
      },
      el('span', { className: 'plus', textContent: '+' }),
      el('small', { textContent: `${mine}/${MAX_LAYOUTS} layouts` }),
    ),
  );
  page.append(cards, heading('Share'));
  page.append(
    shareRow(
      'Layouts you made',
      importLayouts,
      exportLayouts,
      !layouts.some((l) => l.user),
      {
        imp: 'Add layouts from a file someone shared (or that you exported)',
        exp: 'Save the layouts you made, with their key edits, to a file',
      },
      'layout',
    ),
  );
  return page;
}

// ---- Layout tab pieces ----------------------------------------------------------------------------------------------
/** Move the highlight to the card of layout `id` (and tell screen readers which one is pressed). */
function markPicked(grid, id) {
  for (const card of /** @type {NodeListOf<HTMLElement>} */ (grid.querySelectorAll('[data-layout-id]'))) {
    const picked = card.dataset.layoutId === id;
    card.classList.toggle('sel', picked);
    card.setAttribute('aria-pressed', String(picked));
  }
}

/**
 * One card in the layout grid, a real button so it works with the keyboard too. Click it (or press Enter) to pick the layout.
 * Right-click a layout you made, or press the Menu key (or Shift+F10) on its card, to delete it.
 */
function layoutCard(layout) {
  const deleteItem = layout.user
    ? {
        label: 'Delete layout',
        danger: true,
        run: async () => {
          await call('delete_layout', { id: layout.id });
          toast(layout.name + ' deleted');
        },
      }
    : { label: 'Built-in layouts can’t be deleted', disabled: true };
  const picked = settings.layout.id === layout.id;
  const card = el(
    'button',
    {
      type: 'button',
      className: 'card' + (picked ? ' sel' : ''),
      ariaPressed: String(picked),
      onclick: () => {
        settings.layout.id = layout.id;
        setSelectedKey(null);
        markPicked(card.parentElement, layout.id); // only the highlight moves: the cards are not drawn again, so focus stays
        changed();
      },
      oncontextmenu: (e) => showMenu(e, [deleteItem]),
      test: 'layout-card',
    },
    // one inner block, so the text lays out exactly as it did when the card was a plain box
    el(
      'div',
      {},
      el('b', { textContent: layout.name }),
      el('span', { textContent: layout.keys.length + ' keys' + (isCustom(layout.id) ? ' · customized' : '') }),
    ),
  );
  card.dataset.layoutId = layout.id;
  return card;
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
