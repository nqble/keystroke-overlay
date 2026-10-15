// =====================================================================================================================
//  The keyboard picture in the Keys tab: draws every key of the layout, and lets you drag keys to new places.
//  keys.js builds the rest of the tab around it (buttons, the editor under the picture).
// =====================================================================================================================
import { $, el } from '../helpers.js';
import { changed, push } from '../preview.js';
import { keyPos, round2, setKeyPos, snap, viewProf } from '../profiles.js';
import { render } from '../settings.js';
import { selectedKey, setSelectedKey } from '../state.js';

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
export function keyboardMap(layout, profile) {
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
