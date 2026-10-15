// =====================================================================================================================
//  The Keys tab: show / hide keys, rename them, and select and move them (one at a time or as a group).
// =====================================================================================================================
import { $, button, confirmTwice, el, heading, note, row, toast } from '../helpers.js';
import { changed } from '../preview.js';
import {
  SNAP,
  curLayout,
  editProf,
  isCustom,
  keyPos,
  round2,
  setKeyPos,
  tidyPositions,
  tidyProf,
  viewProf,
} from '../profiles.js';
import { render } from '../settings.js';
import { keyboardMap, selectedBoxes } from './keys-map.js';
import { clampMove, movedPositions } from './keys-arrange.js';
import { settings, selectedKey, selectedKeys, setSelectedKey, tab } from '../state.js';
import { TEXT } from '../text.js';

// ---- Keys: show / hide keys and rename them -----------------------------------------------------------------------
export function keysTab() {
  const page = el('div'),
    layout = curLayout();
  if (!layout) return page;
  const profile = viewProf();
  page.append(heading('Keys — ' + layout.name), note(TEXT.keysTabHelp));
  page.append(selectionTools(layout), keyboardMap(layout, profile), keyButtons(layout));
  const selected = selectedKey && layout.keys.find((k) => k.code === selectedKey);
  if (selected) page.append(keyEditor(selected, profile));
  else if (selectedKeys.size > 1) page.append(groupEditor(layout, profile));
  return page;
}

let nudgeByWholeKey = false; // the "Whole key" tickbox next to the nudge buttons (kept while the tab redraws)
const MAX_POSITION = 100; // a key's position is limited to 0–100 key units (keep in step with settings.rs)

/** Move every selected key by (dx, dy) key units, keeping the group's shape and staying inside 0 to MAX_POSITION. */
function nudgeSelection(layout, dx, dy) {
  const boxes = selectedBoxes(layout);
  if (!boxes.length) return;
  const area = { minX: 0, minY: 0, maxX: MAX_POSITION, maxY: MAX_POSITION };
  const allowed = clampMove(boxes, dx, dy, area);
  const positions = movedPositions(boxes, allowed.dx, allowed.dy);
  for (const key of layout.keys) {
    const position = positions[key.code];
    if (position) setKeyPos(key, position.x, position.y);
  }
  changed(true);
}

/** A small labelled group of controls in the toolbar above the picture. */
function toolGroup(label, ...controls) {
  return el(
    'div',
    { className: 'toolgroup' },
    el('span', { className: 'toolgroup-label', textContent: label }),
    el('div', { className: 'btns' }, controls),
  );
}

/** The four arrow buttons that move the selection by one step (a quarter key, or a whole key when ticked). */
function nudgePad(layout) {
  const wholeKey = el('input', { type: 'checkbox', id: 'nudgeWhole', checked: nudgeByWholeKey });
  wholeKey.onchange = () => {
    nudgeByWholeKey = wholeKey.checked;
  };
  const move = (dx, dy) => () => {
    const step = nudgeByWholeKey ? 1 : SNAP;
    nudgeSelection(layout, dx * step, dy * step);
  };
  const arrows = [
    ['←', 'Move left', -1, 0],
    ['↑', 'Move up', 0, -1],
    ['↓', 'Move down', 0, 1],
    ['→', 'Move right', 1, 0],
  ];
  const buttons = arrows.map(([arrow, title, dx, dy]) => {
    const arrowButton = button(arrow, move(dx, dy), 'nudge');
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

/** The toolbar above the picture: what is selected, clear it, and the nudge pad. */
function selectionTools(layout) {
  const count = selectedKeys.size;
  const summary =
    count === 0 ? TEXT.nothingSelected : count === 1 ? `${selectedKey} selected` : `${count} keys selected`;
  const clear = button('Clear selection', () => {
    setSelectedKey(null);
    render();
  });
  clear.disabled = count === 0;
  clear.title = count === 0 ? 'Nothing is selected' : 'Deselect every key';
  return el(
    'div',
    { className: 'keytools' },
    toolGroup('Selection', el('span', { className: 'sel-summary', textContent: summary }), clear),
    toolGroup('Move selection', ...nudgePad(layout)),
  );
}

// Arrow keys nudge the selection (Shift = a whole key). Ignored while typing in a field or while a popup is open.
addEventListener('keydown', (keyEvent) => {
  if (tab !== 'keys' || !selectedKeys.size || !keyEvent.key.startsWith('Arrow')) return;
  const typingOrPopup =
    keyEvent.target.closest?.('input, select, textarea, button') ||
    !$('#dlg').hidden ||
    !$('#modal').hidden ||
    !$('#updModal').hidden;
  const layout = curLayout();
  if (typingOrPopup || !layout) return;
  keyEvent.preventDefault();
  const step = keyEvent.shiftKey ? 1 : SNAP;
  const dx = { ArrowLeft: -1, ArrowRight: 1 }[keyEvent.key] ?? 0;
  const dy = { ArrowUp: -1, ArrowDown: 1 }[keyEvent.key] ?? 0;
  nudgeSelection(layout, dx * step, dy * step);
});

/** Enable all / Disable all / Reset all labels / Tidy up / Reset positions / Revert to Default. */
function keyButtons(layout) {
  const revert = el('button', {
    className: 'danger',
    textContent: 'Revert to Default',
    disabled: !isCustom(layout.id),
    title: 'Undo all key edits (hidden keys, labels and moved keys) for this layout',
  });
  confirmTwice(revert, 'Revert to Default', () => {
    delete settings.layout.profiles[layout.id];
    setSelectedKey(null);
    changed(true);
    toast(layout.name + ' reverted to default');
  });
  const moved = Object.keys(viewProf().positions).length > 0;
  const tidy = button('Tidy up', () => {
    const prof = editProf(),
      next = tidyPositions(layout, viewProf());
    // keep only positions that differ from the layout file
    for (const layoutKey of layout.keys) {
      const newPosition = next[layoutKey.code];
      if (!newPosition) continue;
      if (Math.abs(newPosition.x - layoutKey.x) < 1e-6 && Math.abs(newPosition.y - layoutKey.y) < 1e-6)
        delete prof.positions[layoutKey.code];
      else prof.positions[layoutKey.code] = { x: round2(newPosition.x), y: round2(newPosition.y) };
    }
    tidyProf();
    changed(true);
    toast('Gaps closed');
  });
  tidy.title = 'Close the gaps left by hidden keys, keeping the shape of the keyboard';
  const reset = button('Reset positions', () => {
    editProf().positions = {};
    tidyProf();
    changed(true);
  });
  reset.disabled = !moved;
  reset.title = 'Put every moved key back where the layout has it';
  return el(
    'div',
    { className: 'btns' },
    button('Enable all', () => {
      editProf().disabledKeys = [];
      tidyProf();
      changed(true);
    }),
    button('Disable all', () => {
      editProf().disabledKeys = layout.keys.map((k) => k.code);
      changed(true);
    }),
    button('Reset all labels', () => {
      editProf().labels = {};
      tidyProf();
      changed(true);
    }),
    tidy,
    reset,
    revert,
  );
}

/**
 * The small editor under the keyboard for the selected key: show/hide it, give it a label, and set its exact position.
 */
function keyEditor(key, profile) {
  const show = el('input', { type: 'checkbox', checked: !profile.disabledKeys.includes(key.code) });
  show.onchange = () => {
    const edited = editProf(),
      hidden = new Set(edited.disabledKeys);
    if (show.checked) hidden.delete(key.code);
    else hidden.add(key.code);
    edited.disabledKeys = [...hidden];
    tidyProf();
    changed(true);
  };
  const label = el('input', {
    type: 'text',
    value: profile.labels[key.code] ?? key.label ?? '',
    placeholder: 'Label',
    maxLength: 12,
  });
  label.oninput = () => {
    editProf().labels[key.code] = label.value;
    changed();
  };
  const reset = button('Reset', () => {
    delete editProf().labels[key.code];
    tidyProf();
    changed(true);
  });

  const at = keyPos(key, profile);
  const num = (value) =>
    el('input', { type: 'number', min: 0, max: 100, step: SNAP, value: round2(value), style: 'width:84px' });
  const px = num(at.x),
    py = num(at.y);
  const place = () => {
    const x = parseFloat(px.value),
      y = parseFloat(py.value);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      setKeyPos(key, Math.min(100, Math.max(0, x)), Math.min(100, Math.max(0, y)));
      changed();
    }
  };
  px.oninput = py.oninput = place;
  // redraw the keyboard once typing settles
  px.onchange = py.onchange = () => render();
  const back = button('Reset', () => {
    delete editProf().positions[key.code];
    tidyProf();
    changed(true);
  });
  back.disabled = !profile.positions[key.code];

  return el(
    'div',
    { className: 'editor' },
    el('b', { textContent: key.code }),
    row('Show this key', show),
    row('Custom label', label, reset),
    row('Position', el('span', { textContent: 'X' }), px, el('span', { textContent: 'Y' }), py, back),
    note(TEXT.keyEditorTip),
  );
}

/** The panel under the picture while several keys are selected: show / hide them together, or put them back. */
function groupEditor(layout, profile) {
  const codes = [...selectedKeys];
  const hiddenCount = codes.filter((code) => profile.disabledKeys.includes(code)).length;
  const show = el('input', { type: 'checkbox', checked: hiddenCount === 0 });
  show.indeterminate = hiddenCount > 0 && hiddenCount < codes.length;
  show.onchange = () => {
    const edited = editProf();
    const hidden = new Set(edited.disabledKeys);
    for (const code of codes) {
      if (show.checked) hidden.delete(code);
      else hidden.add(code);
    }
    edited.disabledKeys = [...hidden];
    tidyProf();
    changed(true);
  };
  const movedCodes = codes.filter((code) => profile.positions[code]);
  const putBack = button('Put back', () => {
    const edited = editProf();
    for (const code of codes) delete edited.positions[code];
    tidyProf();
    changed(true);
  });
  putBack.disabled = movedCodes.length === 0;
  putBack.title = 'Put the selected keys back where the layout has them';
  return el(
    'div',
    { className: 'editor' },
    el('b', { textContent: `${codes.length} keys selected` }),
    row('Show these keys', show),
    row('Positions', putBack),
    note(TEXT.groupEditorTip),
  );
}
