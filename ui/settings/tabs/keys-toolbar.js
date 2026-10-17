// =====================================================================================================================
//  The toolbar above the keyboard in the Keys tab: undo and redo, the Snap and Grid switches, and a status line. keys.js puts
//  it on the page. Moving, aligning and spacing keys is done in editor/editor.js (the bar that floats above the selection);
//  the maths is in keys-arrange.js.
// =====================================================================================================================
import { button, el, plural } from '../helpers.js';
import { changed } from '../preview.js';
import { SNAP, editProf, gridShown, restoreProfile, setKeyPos, snapStep } from '../profiles.js';
import { selectedKeys, settings } from '../state.js';
import { TEXT } from '../text.js';
import { clampMove, movedPositions } from './keys-arrange.js';
import { canRedo, canUndo, redo, undo } from './keys-history.js';
import { selectedBoxes } from '../editor/places.js';

const MAX_POSITION = 100; // a key's position is limited to 0–100 key units (keep in step with settings.rs)

/** Save new positions ({ code: { x, y } }) for keys of this layout, then redraw. */
function applyPositions(layout, positions) {
  for (const key of layout.keys) {
    const position = positions[key.code];
    if (position) setKeyPos(key, position.x, position.y);
  }
  changed(true);
}

/** Move every selected key by (dx, dy) key units, keeping the group's shape and staying inside 0 to MAX_POSITION. */
export function nudgeSelection(layout, dx, dy) {
  const boxes = selectedBoxes(layout);
  if (!boxes.length) return;
  const area = { minX: 0, minY: 0, maxX: MAX_POSITION, maxY: MAX_POSITION };
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

/** A small named group of controls in the toolbar (screen readers announce its name). */
function toolGroup(label, ...controls) {
  const group = el('div', { className: 'toolgroup', test: 'key-tool-group' }, ...controls);
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  return group;
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
    ),
    statusLine(profile, overlapCount),
  );
}
