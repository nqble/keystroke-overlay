// =====================================================================================================================
//  The toolbar above the keyboard picture in the Keys tab: what is selected, Clear selection, the nudge pad, and the
//  Align and Space evenly buttons. keys.js puts it on the page. The maths is in keys-arrange.js.
// =====================================================================================================================
import { button, el } from '../helpers.js';
import { changed } from '../preview.js';
import { SNAP_CHOICES, editProf, gridShown, nudgeStep, restoreProfile, setKeyPos, snapStep } from '../profiles.js';
import { render } from '../settings.js';
import { selectedKey, selectedKeys, setSelectedKey, settings } from '../state.js';
import { TEXT } from '../text.js';
import { alignPositions, clampMove, distributePositions, movedPositions } from './keys-arrange.js';
import { canRedo, canUndo, redo, undo } from './keys-history.js';
import { selectedBoxes } from '../editor/places.js';

let nudgeByWholeKey = false; // the "Whole key" tickbox next to the nudge buttons (kept while the tab redraws)
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

/** A small labelled group of controls in the toolbar above the picture. */
function toolGroup(label, ...controls) {
  const group = el(
    'div',
    { className: 'toolgroup', test: 'key-tool-group' },
    el('span', { className: 'toolgroup-label', textContent: label }),
    el('div', { className: 'btns' }, controls),
  );
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  return group;
}

/** The four arrow buttons that move the selection by one step (a quarter key, or a whole key when ticked). */
function nudgePad(layout) {
  const wholeKey = el('input', {
    type: 'checkbox',
    id: 'nudgeWhole',
    checked: nudgeByWholeKey,
    test: 'key-nudge-whole',
  });
  wholeKey.onchange = () => {
    nudgeByWholeKey = wholeKey.checked;
  };
  const move = (dx, dy) => () => {
    const step = nudgeByWholeKey ? 1 : nudgeStep();
    nudgeSelection(layout, dx * step, dy * step);
  };
  const arrows = [
    ['←', 'Move left', 'left', -1, 0],
    ['↑', 'Move up', 'up', 0, -1],
    ['↓', 'Move down', 'down', 0, 1],
    ['→', 'Move right', 'right', 1, 0],
  ];
  const buttons = arrows.map(([arrow, title, direction, dx, dy]) => {
    const arrowButton = button(arrow, move(dx, dy), 'nudge', 'key-nudge');
    arrowButton.dataset.direction = direction;
    arrowButton.title = title + (selectedKeys.size ? '' : ' (select a key first)');
    arrowButton.disabled = selectedKeys.size === 0;
    return arrowButton;
  });
  const wholeLabel = el(
    'label',
    { className: 'inline', title: 'Move by a whole key instead of a quarter key' },
    wholeKey,
  );
  wholeLabel.append(' Whole key');
  return [...buttons, wholeLabel];
}

const ALIGN_BUTTONS = [
  ['left', 'Left', 'Line the keys up along their left edge'],
  ['center', 'Centre', 'Line the keys up along their vertical middle'],
  ['right', 'Right', 'Line the keys up along their right edge'],
  ['top', 'Top', 'Line the keys up along their top edge'],
  ['middle', 'Middle', 'Line the keys up along their horizontal middle'],
  ['bottom', 'Bottom', 'Line the keys up along their bottom edge'],
];
const DISTRIBUTE_BUTTONS = [
  ['across', 'Across', 'Make the gaps between the keys equal, left to right'],
  ['down', 'Down', 'Make the gaps between the keys equal, top to bottom'],
];
const MIN_KEYS_TO_ALIGN = 2;
const MIN_KEYS_TO_DISTRIBUTE = 3;

/** A button that needs at least `needed` selected keys; when it cannot be used, its tooltip says why. */
function arrangeButton(label, tooltip, needed, onclick, test) {
  const arrangeButton = button(label, onclick, '', test);
  const enough = selectedKeys.size >= needed;
  arrangeButton.disabled = !enough;
  arrangeButton.title = enough ? tooltip : `Select at least ${needed} keys first`;
  return arrangeButton;
}

function alignButtons(layout) {
  return ALIGN_BUTTONS.map(([alignment, label, tooltip]) =>
    arrangeButton(
      label,
      tooltip,
      MIN_KEYS_TO_ALIGN,
      () => applyPositions(layout, alignPositions(selectedBoxes(layout), alignment)),
      'key-align-' + alignment,
    ),
  );
}

function distributeButtons(layout) {
  return DISTRIBUTE_BUTTONS.map(([direction, label, tooltip]) =>
    arrangeButton(
      label,
      tooltip,
      MIN_KEYS_TO_DISTRIBUTE,
      () => applyPositions(layout, distributePositions(selectedBoxes(layout), direction)),
      'key-distribute-' + direction,
    ),
  );
}

/** Save one of the Keys tab's remembered choices (settings.layout.editor) and redraw. */
function setEditorChoice(name, value) {
  settings.layout.editor = { ...settings.layout.editor, [name]: value };
  changed(true);
}

/** The Snap menu and the Show grid tickbox. Both are remembered between sessions. */
function viewControls() {
  const menu = el('select', { id: 'snapMenu', title: TEXT.snapMenuHelp, test: 'key-snap' });
  for (const [step, label] of SNAP_CHOICES) menu.append(el('option', { value: String(step), textContent: label }));
  menu.value = String(snapStep());
  menu.onchange = () => setEditorChoice('snap', Number(menu.value));
  const snapLabel = el('label', { className: 'inline', title: TEXT.snapMenuHelp }, 'Snap ', menu);
  const grid = el('input', { type: 'checkbox', id: 'showGrid', checked: gridShown(), test: 'key-grid' });
  grid.onchange = () => setEditorChoice('grid', grid.checked);
  const gridLabel = el('label', { className: 'inline', title: TEXT.gridHelp }, grid);
  gridLabel.append(' Show grid');
  return [snapLabel, gridLabel];
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

/** The toolbar above the picture: what is selected, clear it, and the nudge pad. */
export function selectionTools(layout) {
  const count = selectedKeys.size;
  const summary =
    count === 0 ? TEXT.nothingSelected : count === 1 ? `${selectedKey} selected` : `${count} keys selected`;
  const clear = button(
    'Clear selection',
    () => {
      setSelectedKey(null);
      render();
    },
    '',
    'key-clear-selection',
  );
  clear.disabled = count === 0;
  clear.title = count === 0 ? 'Nothing is selected' : 'Deselect every key';
  return el(
    'div',
    { className: 'keytools', test: 'key-toolbar' },
    toolGroup(
      'Selection',
      el('span', { className: 'sel-summary', textContent: summary, test: 'key-selection-summary' }),
      clear,
    ),
    toolGroup('Move selection', ...nudgePad(layout)),
    toolGroup('Align', ...alignButtons(layout)),
    toolGroup('Space evenly', ...distributeButtons(layout)),
    toolGroup('History', ...historyButtons(layout)),
    toolGroup('View', ...viewControls()),
  );
}
