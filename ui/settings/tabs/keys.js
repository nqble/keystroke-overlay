// =====================================================================================================================
//  The Keys tab: show / hide keys, rename them, and drag them to new places.
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
import { keyboardMap } from './keys-map.js';
import { settings, selectedKey, setSelectedKey, tab } from '../state.js';
import { TEXT } from '../text.js';

// ---- Keys: show / hide keys and rename them -----------------------------------------------------------------------
export function keysTab() {
  const page = el('div'),
    layout = curLayout();
  if (!layout) return page;
  const profile = viewProf();
  page.append(heading('Keys — ' + layout.name), note(TEXT.keysTabHelp));
  page.append(keyboardMap(layout, profile), keyButtons(layout));
  const selected = selectedKey && layout.keys.find((k) => k.code === selectedKey);
  if (selected) page.append(keyEditor(selected, profile));
  return page;
}

// Arrow keys nudge the selected key (Shift = a whole key). Ignored while typing in a field or while a popup is open.
addEventListener('keydown', (keyEvent) => {
  if (tab !== 'keys' || !selectedKey || !keyEvent.key.startsWith('Arrow')) return;
  if (
    keyEvent.target.closest?.('input, select, textarea, button') ||
    !$('#dlg').hidden ||
    !$('#modal').hidden ||
    !$('#updModal').hidden
  )
    return;
  const layout = curLayout(),
    key = layout?.keys.find((k) => k.code === selectedKey);
  if (!key) return;
  keyEvent.preventDefault();
  const step = keyEvent.shiftKey ? 1 : SNAP,
    at = keyPos(key, viewProf());
  const dx = { ArrowLeft: -1, ArrowRight: 1 }[keyEvent.key] ?? 0,
    dy = { ArrowUp: -1, ArrowDown: 1 }[keyEvent.key] ?? 0;
  setKeyPos(key, Math.max(0, at.x + dx * step), Math.max(0, at.y + dy * step));
  changed(true);
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
