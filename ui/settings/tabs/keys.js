// =====================================================================================================================
//  The Keys tab: show / hide keys, rename them, and drag them to new places.
// =====================================================================================================================
import { $, button, confirmTwice, el, heading, note, row, toast } from '../helpers.js';
import { changed, push } from '../preview.js';
import {
  SNAP,
  curLayout,
  editProf,
  isCustom,
  keyPos,
  round2,
  setKeyPos,
  snap,
  tidyPositions,
  tidyProf,
  viewProf,
} from '../profiles.js';
import { render } from '../settings.js';
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

// ---- Keys tab pieces ------------------------------------------------------------------------------------------------
/** CSS for one key on the keyboard picture: position in key units (plus the 8px margin), size in pixels. */
function keyBoxStyle(left, top, width, height, unit) {
  const px = (n) => n + 'px';
  const fontSize = Math.max(8, Math.round((11 * unit) / 38));
  const box = `left:${px(left * unit + 8)};top:${px(top * unit + 8)};width:${px(width)};height:${px(height)}`;
  return `${box};font-size:${px(fontSize)}`;
}

/** True while the pointer was just released after dragging a key, so the click that follows must not also select it. */
let justDragged = false;

/**
 * The picture of the keyboard. Keys are scaled so the whole layout (plus one spare key of room) fits the box without
 * scrolling.
 */
function keyboardMap(layout, profile) {
  const placed = layout.keys.map((k) => ({ k, ...keyPos(k, profile) }));
  const minX = Math.min(...placed.map((p) => p.x)),
    minY = Math.min(...placed.map((p) => p.y));
  // One spare key of room on the right and at the bottom, so a key can be dragged outwards to make the layout bigger.
  const spanX = Math.max(...placed.map((p) => p.x + (p.k.w ?? 1))) - minX + 1;
  const spanY = Math.max(...placed.map((p) => p.y + (p.k.h ?? 1))) - minY + 1;
  // the pane's inner width minus the box border
  const available = ($('#pane').clientWidth || 860) - 26 * 2 - 2;
  const unit = Math.max(14, Math.min(38, Math.floor((available - 16) / spanX))); // pixels per key, 38 at most
  const grid = { unit, minX, minY, spanX, spanY };
  const hidden = new Set(profile.disabledKeys);

  // Visible keys that overlap each other get a red outline.
  const visible = placed.filter((p) => !hidden.has(p.k.code));
  const clash = new Set();
  for (let i = 0; i < visible.length; i++)
    for (let j = i + 1; j < visible.length; j++) {
      const first = visible[i],
        second = visible[j],
        tolerance = 1e-6;
      if (
        first.x < second.x + (second.k.w ?? 1) - tolerance &&
        second.x < first.x + (first.k.w ?? 1) - tolerance &&
        first.y < second.y + (second.k.h ?? 1) - tolerance &&
        second.y < first.y + (first.k.h ?? 1) - tolerance
      ) {
        clash.add(first.k.code);
        clash.add(second.k.code);
      }
    }

  const inner = el('div', { style: 'position:relative' });
  for (const placedKey of placed) {
    const layoutKey = placedKey.k,
      keyWidth = (layoutKey.w ?? 1) * unit - 3,
      keyHeight = (layoutKey.h ?? 1) * unit - 3;
    const node = el('div', {
      className:
        'kmk' +
        (hidden.has(layoutKey.code) ? ' off' : '') +
        (selectedKey === layoutKey.code ? ' sel' : '') +
        (clash.has(layoutKey.code) ? ' clash' : '') +
        (profile.positions[layoutKey.code] ? ' moved' : ''),
      style: keyBoxStyle(placedKey.x - minX, placedKey.y - minY, keyWidth, keyHeight, unit),
      textContent: profile.labels[layoutKey.code] ?? layoutKey.label,
      title: layoutKey.code + ' (drag to move)',
    });
    node.dataset.code = layoutKey.code;
    node.onclick = () => {
      if (justDragged) return;
      setSelectedKey(layoutKey.code);
      render();
    };
    node.onpointerdown = (e) => dragKey(e, node, layoutKey, grid);
    inner.append(node);
  }
  inner.style.width = spanX * unit + 16 + 'px';
  inner.style.height = spanY * unit + 16 + 'px';
  const box = el('div', { className: 'keymap' }, inner);
  // +2 for the box border, or it scrolls by 2px
  box.style.height = spanY * unit + 16 + 2 + 'px';
  return box;
}

/**
 * Drag a key to a new place: snaps to quarter-key steps, stays inside the box, and the live preview follows while you
 * drag.
 */
function dragKey(pointerEvent, node, key, grid) {
  if (pointerEvent.button !== 0) return;
  const startX = pointerEvent.clientX,
    startY = pointerEvent.clientY,
    from = keyPos(key, viewProf());
  let moving = false,
    last = null;
  try {
    node.setPointerCapture(pointerEvent.pointerId);
  } catch {
    /* not a real pointer (tests): events still arrive on the key itself */
  }
  const move = (moveEvent) => {
    const dx = moveEvent.clientX - startX,
      dy = moveEvent.clientY - startY;
    if (!moving && Math.hypot(dx, dy) < 5) return; // a click, not a drag
    if (!moving) {
      moving = true;
      node.classList.add('drag');
      setSelectedKey(key.code);
    }
    const maxX = grid.minX + grid.spanX - (key.w ?? 1),
      maxY = grid.minY + grid.spanY - (key.h ?? 1);
    const x = round2(Math.min(maxX, Math.max(grid.minX, snap(from.x + dx / grid.unit))));
    const y = round2(Math.min(maxY, Math.max(grid.minY, snap(from.y + dy / grid.unit))));
    node.style.left = (x - grid.minX) * grid.unit + 8 + 'px';
    node.style.top = (y - grid.minY) * grid.unit + 8 + 'px';
    if (!last || last.x !== x || last.y !== y) {
      last = { x, y };
      setKeyPos(key, x, y);
      push();
    }
  };
  const done = () => {
    node.removeEventListener('pointermove', move);
    node.removeEventListener('pointerup', done);
    node.removeEventListener('pointercancel', done);
    if (moving) {
      justDragged = true;
      setTimeout(() => {
        justDragged = false;
      }, 0);
      changed(true);
    }
  };
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', done);
  node.addEventListener('pointercancel', done);
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
