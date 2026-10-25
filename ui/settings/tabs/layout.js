// =====================================================================================================================
//  The Layout tab (docs/design/ui-design-v2.md, Layouts): the layouts you use, as cards in the order you set (drag a
//  card, use Alt+← / Alt+→, or its "⋯" menu), "+ New layout" last, then Import/Export of the layouts you made.
//  One card: layout-card.js. Which layouts show, and the moving rules: layout-order.js. The New layout popup and its
//  Start from choices (Blank, Built-in, From a KLE file): dialogs.js.
// =====================================================================================================================
import { addLayoutDialog } from '../dialogs.js';
import { AllSetLine, FirstRun, isAllSet, isFirstRunOpen } from '../first-run.js';
import { call, el, invoke, plural, toast } from '../helpers.js';
import { html, useRef, useState } from '../html.js';
import { dropGap, isDragStart, moveBy, moveToGap, shownLayouts } from '../layout-order.js';
import { dialog } from '../popup.js';
import { resync } from '../messages.js';
import { changed, saveNow } from '../preview.js';
import { render } from '../settings.js';
import { MAX_LAYOUTS, layouts, setLayouts, setSelectedKey, settings } from '../state.js';
import { LayoutCard } from './layout-card.js';

const WORDS = {
  title: 'Layout',
  count: (mine) => `Your layouts: ${mine} / ${MAX_LAYOUTS}`,
  add: '+ New layout',
  deleteTitle: (name) => `Delete ${name}?`,
  deleteBody: 'This can’t be undone.',
  cancel: 'Cancel',
  remove: 'Delete',
  deleted: (name) => `${name} deleted`,
  import: 'Import…',
  export: 'Export…',
  importTip: 'Add layouts from a file',
  exportTip: 'Save your layouts to a file',
  imported: (added, skipped) => `Imported ${plural(added, 'layout')}` + (skipped ? `, skipped ${skipped}` : ''),
  nothingImported: (skipped) =>
    'Nothing imported' + (skipped ? ` (${skipped} skipped: empty, or the ${MAX_LAYOUTS}-layout limit)` : ''),
  exported: (count) => `Exported ${plural(count, 'layout')}`,
};

export function layoutTab() {
  if (isFirstRunOpen()) return html`<${FirstRun} />`;
  return html`<${Layout} />`;
}

/** Where the card sits in the row, so its menu can gray out the moves that can't happen. */
function placeOf(index, count) {
  if (count === 1) return 'only';
  if (index === 0) return 'first';
  if (index === count - 1) return 'last';
  return '';
}

function pick(id) {
  settings.layout.id = id;
  setSelectedKey(null);
  changed(true);
}

/** Save a new order, redraw, and keep the keyboard focus on the card that moved. */
async function saveOrder(order, movedId) {
  settings.layout.order = order;
  changed();
  await render();
  const card = /** @type {HTMLElement | null} */ (
    document.querySelector(`[data-test="layout-card"][data-layout-id="${movedId}"]`)
  );
  card?.focus();
}

/** Take a layout off the tab: a built-in one goes back to New layout's Built-in; your own is deleted (after asking). */
async function remove(layout, shownIds) {
  if (layout.user && !(await confirmDelete(layout))) return;
  settings.layout.order = shownIds.filter((id) => id !== layout.id);
  if (settings.layout.id === layout.id) settings.layout.id = settings.layout.order[0];
  if (!layout.user) {
    changed(true);
    return;
  }
  // Save first, then delete: the app also drops the layout's key edits from the settings, and saving our older copy
  // after that would bring them back. Then take the app's settings as they now are.
  await saveNow();
  await call('delete_layout', { id: layout.id });
  toast(WORDS.deleted(layout.name));
  await resync();
}

/** Resolves true once Delete is clicked; Cancel or Escape leaves the layout alone. */
function confirmDelete(layout) {
  return new Promise((resolve) => {
    dialog({
      title: WORDS.deleteTitle(layout.name),
      body: [el('p', { textContent: WORDS.deleteBody })],
      buttons: [
        { label: WORDS.cancel, test: 'dialog-cancel', run: () => resolve(false) },
        { label: WORDS.remove, test: 'dialog-delete', danger: true, run: () => resolve(true) },
      ],
    });
  });
}

function Layout() {
  const shown = shownLayouts(layouts, settings.layout.order);
  const shownIds = shown.map((layout) => layout.id);
  const mine = layouts.filter((layout) => layout.user).length;
  const drag = useDrag(shownIds);
  return html`<div class="tab-page">
    <div class="tab-heading with-action">
      <div>
        <h2 data-test="section-heading">${WORDS.title}</h2>
      </div>
      <span class="note" data-test="layout-count">${WORDS.count(mine)}</span>
    </div>
    ${isAllSet() ? html`<${AllSetLine} />` : null}
    <div class="gallery layout-gallery" data-test="layout-cards" style=${drag.lineStyle}>
      ${shown.map(
        (layout, index) =>
          html`<${LayoutCard}
            key=${layout.id}
            layout=${layout}
            selected=${settings.layout.id === layout.id}
            place=${placeOf(index, shown.length)}
            dragging=${drag.id === layout.id}
            drag=${drag}
            actions=${{
              pick: () => pick(layout.id),
              move: (step) => saveOrder(moveBy(shownIds, layout.id, step), layout.id),
              remove: () => remove(layout, shownIds),
            }}
          />`,
      )}
      <button type="button" class="gallery-card add" data-test="layout-add" onClick=${() => addLayoutDialog()}>
        ${WORDS.add}
      </button>
      ${drag.gap === null ? null : html`<span class="drop-line" aria-hidden="true"></span>`}
    </div>
    <div class="btns">
      <button type="button" data-test="layout-import" title=${WORDS.importTip} onClick=${importLayouts}>
        ${WORDS.import}
      </button>
      <button
        type="button"
        data-test="layout-export"
        title=${WORDS.exportTip}
        disabled=${mine === 0}
        onClick=${exportLayouts}
      >
        ${WORDS.export}
      </button>
    </div>
  </div>`;
}

/**
 * Dragging a card to a new place, with pointer events (mouse, pen or touch). The browser's own drag and drop is not
 * used: each system's web view (WebView2, WebKit) and Tauri's file-drop handling treat it differently, and on some it
 * never delivers the drop. A press turns into a drag once the pointer moves DRAG_START_DISTANCE; while it is over a gap
 * between cards, a line shows where the card will land (CSS variables, blocks.css .drop-line), and letting go there
 * saves the new order. The click that follows a drag is swallowed, so a drag never also picks the layout.
 */
function useDrag(shownIds) {
  const [id, setId] = useState(null);
  const [drop, setDrop] = useState({ gap: null, line: null });
  const press = useRef(null); // { layoutId, x, y, grid } from pointerdown until pointerup
  const dragged = useRef(false); // true from a drag's start until the click after it
  const boxesOf = (grid) =>
    [...grid.querySelectorAll('[data-layout-item]')].map((item) => item.getBoundingClientRect());
  const finish = () => {
    press.current = null;
    setId(null);
    setDrop({ gap: null, line: null });
  };
  return {
    id,
    gap: drop.gap,
    lineStyle: drop.line,
    down: (pointerEvent, layoutId) => {
      if (pointerEvent.button !== 0) return;
      const grid = pointerEvent.currentTarget.closest('[data-test="layout-cards"]');
      press.current = { layoutId, x: pointerEvent.clientX, y: pointerEvent.clientY, grid };
      dragged.current = false;
      pointerEvent.currentTarget.setPointerCapture?.(pointerEvent.pointerId);
    },
    move: (pointerEvent) => {
      const start = press.current;
      if (!start) return;
      if (id === null) {
        if (!isDragStart(start, pointerEvent.clientX, pointerEvent.clientY)) return;
        dragged.current = true;
        setId(start.layoutId);
      }
      const boxes = boxesOf(start.grid);
      const gap = dropGap(pointerEvent.clientX, pointerEvent.clientY, boxes);
      if (gap === drop.gap) return;
      setDrop({ gap, line: gap === null ? null : lineAt(gap, boxes, start.grid.getBoundingClientRect()) });
    },
    up: () => {
      const moved = id;
      const gap = drop.gap;
      finish();
      if (moved !== null && gap !== null) saveOrder(moveToGap(shownIds, moved, gap), moved);
    },
    cancel: finish,
    /** True once for the click a drag ends with, which must not pick the layout. */
    swallowClick: () => {
      const wasDrag = dragged.current;
      dragged.current = false;
      return wasDrag;
    },
  };
}

/** Where the drop line goes for a gap: just left of the card after it, or just right of the last card. */
function lineAt(gap, boxes, grid) {
  const after = boxes[gap];
  const before = boxes[gap - 1];
  const box = after ?? before;
  const x = after ? after.left : before.right;
  return {
    '--drop-x': `${x - grid.left}px`,
    '--drop-top': `${box.top - grid.top}px`,
    '--drop-height': `${box.height}px`,
  };
}

async function importLayouts() {
  try {
    const result = await invoke('import_layouts');
    if (!result) return; // the user canceled the file picker
    const [added, skipped] = result;
    if (added) toast(WORDS.imported(added, skipped));
    else toast(WORDS.nothingImported(skipped), true);
    setLayouts(await call('list_layouts'));
    render();
  } catch (error) {
    toast(String(error), true);
  }
}

async function exportLayouts() {
  try {
    const count = await invoke('export_layouts');
    if (count) toast(WORDS.exported(count));
  } catch (error) {
    toast(String(error), true);
  }
}
