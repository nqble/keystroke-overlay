// =====================================================================================================================
//  The toolbar above the keyboard in the Keys tab: undo and redo, the Snap and Grid switches, and a status line. keys.js puts
//  it on the page. Moving, aligning and spacing keys is done in editor/ (arrange-bar.js is the bar that floats above the selection);
//  the maths is in keys-arrange.js.
// =====================================================================================================================
import { button, el, plural, toast } from '../helpers.js';
import { changed } from '../preview.js';
import {
  SNAP,
  editProf,
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
import { confirmDialog, showMenu } from '../popups.js';
import { selectedKeys, setSelectedKey, setSelectedKeys, settings } from '../state.js';
import { TEXT } from '../text.js';
import { clampMove, movedPositions } from './keys-arrange.js';
import { canRedo, canUndo, redo, undo } from './keys-history.js';
import { boardFor, placedBoxesFor, selectedBoxes } from '../editor/places.js';
import { CLOSED_GAP, closeGapsPositions } from './keys-board.js';

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
function toggleButton(label, on, tooltip, test, onclick) {
  const toggle = button(label, onclick, 'toggle' + (on ? ' on' : ''), test);
  toggle.title = tooltip;
  toggle.setAttribute('aria-pressed', String(on));
  return toggle;
}

/** "Close gaps": slide the shown keys together, keeping their order, then center them on the board. */
function closeGaps(layout) {
  const profile = viewProf();
  const hidden = new Set(profile.disabledKeys);
  const frame = boardFor(layout, profile);
  // the keys as they sit on the board (saved place plus the origin), closed up and centered on the board, then back to saved places
  const boxes = placedBoxesFor(layout, profile)
    .filter((box) => !hidden.has(box.code))
    .map((box) => ({ ...box, x: box.x + frame.originX, y: box.y + frame.originY }));
  if (!boxes.length) return;
  const evenGrid = profile.layoutStyle === 'grid';
  const onBoard = closeGapsPositions(
    boxes,
    frame,
    evenGrid ? 0 : CLOSED_GAP, // the Even grid closes gaps completely
    snapStep() || CLOSED_GAP,
  );
  const positions = {};
  for (const [code, place] of Object.entries(onBoard))
    positions[code] = { x: place.x - frame.originX, y: place.y - frame.originY };
  applyPositions(layout, positions);
  toast('Gaps closed');
}

/** The Reset menu: put selected keys, all keys, hidden keys or labels back, or reset the whole layout. */
function resetMenu(layout, profile, event) {
  const selectedCodes = [...selectedKeys];
  const isEdited = (code) => !!(profile.positions[code] || profile.sizes[code]);
  const items = [
    {
      label: 'Put selected keys back',
      test: 'keys-put-selected-back',
      disabled: !selectedCodes.some(isEdited),
      run: () => {
        forgetKeyEdits(selectedCodes);
        changed(true);
      },
    },
    {
      label: 'Put all keys back',
      test: 'keys-reset-positions',
      disabled: !Object.keys(profile.positions).length && !Object.keys(profile.sizes).length,
      run: () => {
        forgetStyleEdits();
        changed(true);
      },
    },
    {
      label: 'Show all hidden keys',
      test: 'keys-enable-all',
      disabled: !profile.disabledKeys.length,
      run: () => {
        editProf().disabledKeys = [];
        tidyProf();
        changed(true);
      },
    },
    {
      label: 'Reset all labels',
      test: 'keys-reset-labels',
      disabled: !Object.keys(profile.labels).length,
      run: () => {
        editProf().labels = {};
        tidyProf();
        changed(true);
      },
    },
    { separator: true },
    {
      label: 'Reset this layout completely',
      test: 'keys-revert',
      danger: true,
      disabled: !isCustom(layout.id),
      run: () =>
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
        }),
    },
  ];
  showMenu(event, items);
}

/** A small named group of controls in the toolbar (screen readers announce its name). */
function toolGroup(label, ...controls) {
  const group = el('div', { className: 'toolgroup', test: 'key-tool-group' }, ...controls);
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  return group;
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
export function hideSelection(layout) {
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

function historyButtons(layout) {
  const undoButton = button('Undo', () => stepHistory(layout, undo), '', 'key-undo');
  undoButton.disabled = !canUndo();
  undoButton.title = canUndo() ? 'Undo the last change to the keys of this layout' : 'Nothing to undo';
  const redoButton = button('Redo', () => stepHistory(layout, redo), '', 'key-redo');
  redoButton.disabled = !canRedo();
  redoButton.title = canRedo() ? 'Redo the change you just undid' : 'Nothing to redo';
  return [undoButton, redoButton];
}

/** The line at the far right of the toolbar: how many keys are moved or hidden, and how many overlap. */
function statusLine(profile, overlapCount) {
  const moved = new Set([...Object.keys(profile.positions), ...Object.keys(profile.sizes)]).size;
  const status = el('p', {
    className: 'keystatus',
    textContent: `${moved} moved · ${profile.disabledKeys.length} hidden`,
    test: 'key-status',
  });
  if (overlapCount > 0)
    status.append(
      ' · ',
      el('span', { className: 'danger-text', textContent: `${plural(overlapCount, 'key')} overlap` }),
    );
  status.setAttribute('aria-live', 'polite'); // read out after a change
  return status;
}

/** The toolbar above the keyboard: undo and redo, the Snap and Grid switches, and the status line. */
export function keysToolbar(layout, profile, overlapCount) {
  const snapOn = snapStep() > 0;
  const gridOn = gridShown();
  return el(
    'div',
    { className: 'keytools', test: 'key-toolbar' },
    toolGroup('History', ...historyButtons(layout)),
    toolGroup(
      'View',
      toggleButton('Snap', snapOn, TEXT.snapHelp, 'key-snap', () => setEditorChoice('snap', snapOn ? 0 : SNAP)),
      toggleButton('Grid', gridOn, TEXT.gridHelp, 'key-grid', () => setEditorChoice('grid', !gridOn)),
      toggleButton('Hidden keys', showHiddenKeys(), TEXT.showHiddenHelp, 'key-show-hidden', () =>
        toggleHiddenKeys(profile, showHiddenKeys()),
      ),
    ),
    toolGroup(
      'Tidy',
      Object.assign(
        button('Close gaps', () => closeGaps(layout), '', 'keys-tidy'),
        { title: TEXT.closeGapsHelp },
      ),
      Object.assign(
        button('Reset ▾', (event) => resetMenu(layout, profile, event), '', 'keys-reset-menu'),
        {
          title: TEXT.resetMenuHelp,
        },
      ),
    ),
    statusLine(profile, overlapCount),
  );
}
