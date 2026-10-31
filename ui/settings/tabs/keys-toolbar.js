// =====================================================================================================================
//  The toolbar above the keyboard in the Keys tab (Preact): undo and redo, the Snap, Grid and Hidden keys switches, Close
//  gaps and the Reset menu, and a status line. keys.js puts it on the page. Moving, aligning and spacing keys is done in
//  editor/arrange-bar.js (the bar that floats above the selection); the maths is in keys-arrange.js.
// =====================================================================================================================
import { MenuButton } from '../blocks.js';
import { plural, toast } from '../helpers.js';
import { html } from '../html.js';
import { changed } from '../preview.js';
import {
  SNAP,
  editProf,
  editedCodes,
  forgetKeyEdits,
  forgetStyleEdits,
  gridShown,
  isCustom,
  restoreProfile,
  showHiddenKeys,
  setKeyPos,
  snapStep,
  tidyProf,
  viewProf,
} from '../profiles.js';
import { confirmDialog } from '../dialogs.js';
import { selectedKeys, setSelectedKey, setSelectedKeys, settings } from '../state.js';
import { TEXT } from '../text.js';
import { clampMove, movedPositions } from './keys-arrange.js';
import { canRedo, canUndo, redo, undo } from './keys-history.js';
import { boardFor, placedBoxesFor, selectedBoxes } from '../editor/places.js';
import { closeGapsPositions } from './keys-board.js';

/** Save new positions ({ code: { x, y } }) for keys of this layout, then redraw. */
function applyPositions(layout, positions) {
  for (const key of layout.keys) {
    const position = positions[key.code];
    if (position) setKeyPos(key, position.x, position.y);
  }
  changed(true);
}

/** Move every selected key by (dx, dy) key units, keeping the group's shape and staying on the board. */
export function nudgeSelection(layout, dx, dy) {
  const boxes = selectedBoxes(layout);
  if (!boxes.length) return;
  // the board in saved places: its edges minus where the layout's own origin sits on it
  const frame = boardFor(layout, viewProf());
  const area = {
    minX: -frame.originX,
    minY: -frame.originY,
    maxX: frame.w - frame.originX,
    maxY: frame.h - frame.originY,
  };
  const allowed = clampMove(boxes, dx, dy, area);
  applyPositions(layout, movedPositions(boxes, allowed.dx, allowed.dy));
}

/** Save one of the Keys tab's remembered choices (settings.layout.editor) and redraw. */
function setEditorChoice(name, value) {
  settings.layout.editor = { ...settings.layout.editor, [name]: value };
  changed(true);
}

/** A switch in the toolbar: a button that stays pressed while it is on (aria-pressed tells screen readers). */
function Toggle({ label, on, tip, test, onClick }) {
  return html`<button
    type="button"
    class=${on ? 'toggle on' : 'toggle'}
    title=${tip}
    aria-pressed=${on ? 'true' : 'false'}
    data-test=${test}
    onClick=${onClick}
  >
    ${label}
  </button>`;
}

/** "Close gaps": in each row, slide the shown keys left into hidden keys' spots. Only keys that move are saved as moved. */
function closeGaps(layout) {
  const profile = viewProf();
  const hiddenCodes = new Set(profile.disabledKeys);
  const boxes = placedBoxesFor(layout, profile);
  const shown = boxes.filter((box) => !hiddenCodes.has(box.code));
  const hidden = boxes.filter((box) => hiddenCodes.has(box.code));
  const closed = closeGapsPositions(shown, hidden);
  const positions = {};
  for (const box of shown) {
    const place = closed[box.code];
    if (place.x !== box.x) positions[box.code] = place;
  }
  if (!Object.keys(positions).length) {
    toast(TEXT.noGapsToClose);
    return;
  }
  applyPositions(layout, positions);
  toast(TEXT.gapsClosed);
}

/** The Reset menu's items: put selected keys, all keys, hidden keys or labels back, or reset the whole layout. */
// What each Reset menu item does; every one can be undone.
function putSelectedBack(codes) {
  forgetKeyEdits(codes);
  changed(true);
}
function putAllBack() {
  forgetStyleEdits();
  changed(true);
}
function showAllHidden() {
  editProf().disabledKeys = [];
  tidyProf();
  changed(true);
}
function resetAllLabels() {
  editProf().labels = {};
  tidyProf();
  changed(true);
}
function resetLayoutCompletely(layout) {
  confirmDialog({
    title: 'Reset this layout?',
    body: TEXT.resetLayoutBody,
    confirmLabel: 'Reset layout',
    test: 'dialog-reset-layout-confirm',
    onConfirm: () => {
      delete settings.layout.profiles[layout.id];
      setSelectedKey(null);
      changed(true);
      toast(layout.name + ' reset');
      return true;
    },
  });
}

function resetMenuItems(layout, profile) {
  const selectedCodes = [...selectedKeys];
  const edited = editedCodes(profile);
  return [
    {
      label: 'Put selected keys back',
      test: 'keys-put-selected-back',
      disabled: !selectedCodes.some((code) => edited.has(code)),
      run: () => putSelectedBack(selectedCodes),
    },
    {
      label: 'Put all keys back',
      test: 'keys-reset-positions',
      disabled: !Object.keys(profile.positions).length && !Object.keys(profile.sizes).length,
      run: putAllBack,
    },
    {
      label: 'Show all hidden keys',
      test: 'keys-enable-all',
      disabled: !profile.disabledKeys.length,
      run: showAllHidden,
    },
    {
      label: 'Reset all labels',
      test: 'keys-reset-labels',
      disabled: !Object.keys(profile.labels).length,
      run: resetAllLabels,
    },
    { separator: true },
    {
      label: 'Reset this layout completely',
      test: 'keys-revert',
      danger: true,
      disabled: !isCustom(layout.id),
      run: () => resetLayoutCompletely(layout),
    },
  ];
}

/** A small named group of controls in the toolbar (screen readers announce its name). */
function ToolGroup({ label, children }) {
  return html`<div class="toolgroup" role="group" aria-label=${label} data-test="key-tool-group">${children}</div>`;
}

/** The Hidden keys switch: show or hide the dimmed keys that are hidden in the overlay (hidden ones are dropped from the selection). */
function toggleHiddenKeys(profile, on) {
  if (on) {
    const hidden = new Set(profile.disabledKeys);
    setSelectedKeys([...selectedKeys].filter((code) => !hidden.has(code)));
  }
  setEditorChoice('showHidden', !on);
}

/** Undo the last change to this layout's keys (same as the Undo button). */
export const undoLastChange = (layout) => stepHistory(layout, undo);

/** Redo the change that was just undone (same as the Redo button). */
export const redoLastChange = (layout) => stepHistory(layout, redo);

/** Hide every selected key in the overlay (they stay clickable here, so they can be shown again). */
export function hideSelection() {
  const edits = editProf();
  const hidden = new Set(edits.disabledKeys);
  for (const code of selectedKeys) hidden.add(code);
  edits.disabledKeys = [...hidden];
  changed(true);
}

/** Put back the edits from one step earlier (undo) or later (redo), then redraw. */
function stepHistory(layout, step) {
  const snapshot = step();
  if (snapshot === null) return;
  restoreProfile(layout.id, snapshot);
  changed(true);
}

/** Undo and Redo. Their tips say why one is grayed out. */
function HistoryButtons({ layout }) {
  return html`<button
      type="button"
      data-test="key-undo"
      disabled=${!canUndo()}
      title=${canUndo() ? 'Undo' : 'Nothing to undo'}
      onClick=${() => undoLastChange(layout)}
    >
      Undo
    </button>
    <button
      type="button"
      data-test="key-redo"
      disabled=${!canRedo()}
      title=${canRedo() ? 'Redo' : 'Nothing to redo'}
      onClick=${() => redoLastChange(layout)}
    >
      Redo
    </button>`;
}

/** The line at the far right of the toolbar: how many keys are moved or hidden, and how many overlap. */
function StatusLine({ profile, overlapCount }) {
  const moved = editedCodes(profile).size;
  const overlap =
    overlapCount > 0 ? html` · <span class="danger-text">${plural(overlapCount, 'key')} overlap</span>` : null;
  // aria-live: read out after a change
  return html`<p class="keystatus" data-test="key-status" aria-live="polite">
    ${moved} moved · ${profile.disabledKeys.length} hidden${overlap}
  </p>`;
}

/** The toolbar above the keyboard: undo and redo, the Snap, Grid and Hidden keys switches, tidying, and the status line. */
export function KeysToolbar({ layout, profile, overlapCount }) {
  const snapOn = snapStep() > 0;
  const gridOn = gridShown();
  const hiddenOn = showHiddenKeys();
  return html`<div class="keytools" data-test="key-toolbar">
    <${ToolGroup} label="History"><${HistoryButtons} layout=${layout} /><//>
    <${ToolGroup} label="View">
      <${Toggle}
        label="Snap"
        on=${snapOn}
        tip=${TEXT.snapHelp}
        test="key-snap"
        onClick=${() => setEditorChoice('snap', snapOn ? 0 : SNAP)}
      />
      <${Toggle}
        label="Grid"
        on=${gridOn}
        tip=${TEXT.gridHelp}
        test="key-grid"
        onClick=${() => setEditorChoice('grid', !gridOn)}
      />
      <${Toggle}
        label="Hidden keys"
        on=${hiddenOn}
        tip=${TEXT.showHiddenHelp}
        test="key-show-hidden"
        onClick=${() => toggleHiddenKeys(profile, hiddenOn)}
      />
    <//>
    <${ToolGroup} label="Tidy">
      <button type="button" data-test="keys-tidy" title=${TEXT.closeGapsHelp} onClick=${() => closeGaps(layout)}>
        Close gaps
      </button>
      <${MenuButton} label="Reset" text="Reset" items=${resetMenuItems(layout, profile)} test="keys-reset-menu" />
    <//>
    <${StatusLine} profile=${profile} overlapCount=${overlapCount} />
  </div>`;
}
