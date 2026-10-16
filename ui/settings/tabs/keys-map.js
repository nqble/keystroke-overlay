// =====================================================================================================================
//  The keyboard picture in the Keys tab: draws every key of the layout, lets you select keys (click, Ctrl- or Shift-click,
//  or drag a box around them) and drag the selected keys to new places.
//  keys.js builds the rest of the tab around it (toolbar, buttons, the editor under the picture). The maths for moving
//  a group is in keys-arrange.js.
// =====================================================================================================================
import { $, el } from '../helpers.js';
import { changed, push } from '../preview.js';
import { gridShown, keyPos, keyWidth, round2, setKeyPos, snap, snapStep, viewProf } from '../profiles.js';
import { render } from '../settings.js';
import { selectedKeys, setSelectedKeys } from '../state.js';
import { TEXT } from '../text.js';
import { clampMove, movedPositions } from './keys-arrange.js';

const PICTURE_MARGIN = 8; // pixels of room around the keys inside the picture
const MAX_KEY_PIXELS = 38; // pixels per key unit at most
const MIN_KEY_PIXELS = 14; // ... and at least
const MIN_GRID_SPACING = 6; // pixels: dots closer together than this are thinned out so the grid stays readable
const DRAG_START_DISTANCE = 5; // pixels the pointer must move before a press counts as a drag, not a click

/** True while the pointer was just released after a drag, so the click that follows must not also change the selection. */
let justDragged = false;

function rememberDrag() {
  justDragged = true;
  setTimeout(() => {
    justDragged = false;
  }, 0);
}

/** True when Ctrl, Shift or Cmd is held: clicking then adds a key to the selection or removes it. */
const isAdditive = (pointerEvent) => pointerEvent.ctrlKey || pointerEvent.shiftKey || pointerEvent.metaKey;

// ---- Working out where everything goes ------------------------------------------------------------------------------
/** Every key with its current place and size in key units: [{ key, x, y, w, h }]. */
function placeKeys(layout, profile) {
  return layout.keys.map((key) => ({ key, ...keyPos(key, profile), w: keyWidth(key, profile), h: key.h ?? 1 }));
}

/**
 * The picture's scale and size. Keys are scaled so the whole layout (plus one spare key of room) fits the box without
 * scrolling.
 */
function pictureGrid(placed) {
  const minX = Math.min(...placed.map((item) => item.x));
  const minY = Math.min(...placed.map((item) => item.y));
  // One spare key of room on the right and at the bottom, so a key can be dragged outwards to make the layout bigger.
  const spanX = Math.max(...placed.map((item) => item.x + item.w)) - minX + 1;
  const spanY = Math.max(...placed.map((item) => item.y + item.h)) - minY + 1;
  // the pane's inner width minus the box border
  const available = ($('#pane').clientWidth || 860) - 26 * 2 - 2;
  const unit = Math.max(MIN_KEY_PIXELS, Math.min(MAX_KEY_PIXELS, Math.floor((available - 16) / spanX)));
  return { unit, minX, minY, spanX, spanY };
}

/** The codes of visible keys that overlap another visible key (they get a red outline). */
function findClashes(visible) {
  const clash = new Set();
  const tolerance = 1e-6;
  for (let i = 0; i < visible.length; i++)
    for (let j = i + 1; j < visible.length; j++) {
      const first = visible[i];
      const second = visible[j];
      const overlapsAcross = first.x < second.x + second.w - tolerance && second.x < first.x + first.w - tolerance;
      const overlapsDown = first.y < second.y + second.h - tolerance && second.y < first.y + first.h - tolerance;
      if (overlapsAcross && overlapsDown) {
        clash.add(first.key.code);
        clash.add(second.key.code);
      }
    }
  return clash;
}

/** CSS for one key on the keyboard picture: position in key units (plus the margin), size in pixels. */
function keyBoxStyle(left, top, width, height, unit) {
  const px = (n) => n + 'px';
  const fontSize = Math.max(8, Math.round((11 * unit) / MAX_KEY_PIXELS));
  const box = `left:${px(left * unit + PICTURE_MARGIN)};top:${px(top * unit + PICTURE_MARGIN)};width:${px(width)};height:${px(height)}`;
  return `${box};font-size:${px(fontSize)}`;
}

// ---- The picture ----------------------------------------------------------------------------------------------------
export function keyboardMap(layout, profile) {
  const placed = placeKeys(layout, profile);
  const grid = pictureGrid(placed);
  const hidden = new Set(profile.disabledKeys);
  const clash = findClashes(placed.filter((item) => !hidden.has(item.key.code)));
  const picture = { grid, placed, nodes: new Map() };

  const inner = el('div', { style: 'position:relative', test: 'keymap-canvas' });
  for (const item of placed) {
    const node = drawKey(item, picture, { hidden, clash, profile });
    picture.nodes.set(item.key.code, node);
    inner.append(node);
  }
  if (gridShown() && snapStep() > 0) drawGrid(inner, grid);
  inner.style.width = grid.spanX * grid.unit + PICTURE_MARGIN * 2 + 'px';
  inner.style.height = grid.spanY * grid.unit + PICTURE_MARGIN * 2 + 'px';
  const box = el('div', { className: 'keymap', title: TEXT.keyPictureHelp, test: 'keymap' }, inner);
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', `Keyboard layout ${layout.name}`);
  // +2 for the box border, or it scrolls by 2px
  box.style.height = grid.spanY * grid.unit + PICTURE_MARGIN * 2 + 2 + 'px';
  // A press on the empty background (a key stops its own presses) starts drawing a selection box.
  box.onpointerdown = (pointerEvent) => startMarquee(pointerEvent, box, inner, picture);
  return box;
}

/** Faint dots at every snap step, lined up with the places a snapped key can land. */
function drawGrid(inner, grid) {
  let spacing = snapStep() * grid.unit;
  let every = 1; // thin the dots out (every 2nd, 4th, ...) when they would be too close
  while (spacing * every < MIN_GRID_SPACING) every *= 2;
  spacing *= every;
  const offsetOf = (min) => (((-min % snapStep()) + snapStep()) % snapStep()) * grid.unit + PICTURE_MARGIN;
  Object.assign(inner.style, {
    backgroundImage: 'radial-gradient(circle, var(--dim) 0.8px, transparent 1.4px)',
    backgroundSize: `${spacing}px ${spacing}px`,
    backgroundPosition: `${offsetOf(grid.minX)}px ${offsetOf(grid.minY)}px`,
  });
}

/** One key on the picture, with its click and drag handling. */
function drawKey(item, picture, { hidden, clash, profile }) {
  const { key } = item;
  const { unit, minX, minY } = picture.grid;
  const node = el('div', {
    className:
      'kmk' +
      (hidden.has(key.code) ? ' off' : '') +
      (selectedKeys.has(key.code) ? ' sel' : '') +
      (clash.has(key.code) ? ' clash' : '') +
      (profile.positions[key.code] ? ' moved' : ''),
    style: keyBoxStyle(item.x - minX, item.y - minY, item.w * unit - 3, item.h * unit - 3, unit),
    textContent: profile.labels[key.code] ?? key.label,
    title: key.code + ' (drag to move)',
    test: 'key-cell',
  });
  node.dataset.code = key.code;
  describeForAssistiveTech(node, key, { hidden, profile });
  node.onclick = (clickEvent) => {
    if (justDragged) return;
    chooseKey(key.code, isAdditive(clickEvent));
    render();
  };
  // Enter or Space on a focused key selects it (with Ctrl or Shift: adds it), so the picture works without a mouse.
  node.onkeydown = async (keyEvent) => {
    if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return;
    keyEvent.preventDefault();
    chooseKey(key.code, isAdditive(keyEvent));
    await render();
    $(`.kmk[data-code="${key.code}"]`)?.focus(); // the picture was redrawn: put the focus back on the key
  };
  node.onpointerdown = (pointerEvent) => {
    pointerEvent.stopPropagation(); // do not also start a selection box
    dragKeys(pointerEvent, node, key, picture);
  };
  return node;
}

/** Make a key the selection, or add it to / remove it from the selection when `additive`. */
function chooseKey(code, additive) {
  if (additive) toggleInSelection(code);
  else setSelectedKeys([code]);
}

/** Tab stop, button role and a spoken name for one key on the picture. */
function describeForAssistiveTech(node, key, { hidden, profile }) {
  const label = profile.labels[key.code] ?? key.label;
  const state = [
    hidden.has(key.code) ? 'hidden in the overlay' : 'shown',
    selectedKeys.has(key.code) ? 'selected' : null,
  ];
  node.tabIndex = 0;
  node.setAttribute('role', 'button');
  node.setAttribute('aria-pressed', String(selectedKeys.has(key.code)));
  node.setAttribute('aria-label', `${key.code}${label ? ', label ' + label : ''}, ${state.filter(Boolean).join(', ')}`);
}

function toggleInSelection(code) {
  const next = new Set(selectedKeys);
  if (next.has(code)) next.delete(code);
  else next.add(code);
  setSelectedKeys(next);
}

// ---- Dragging keys --------------------------------------------------------------------------------------------------
/**
 * Drag a key, or the whole selection when the pressed key is part of it. Snaps to quarter-key steps, keeps the group's
 * shape, stops at the edge of the box, and the live preview follows while you drag.
 */
function dragKeys(pointerEvent, node, pressedKey, picture) {
  if (pointerEvent.button !== 0 || isAdditive(pointerEvent)) return;
  const { grid, placed, nodes } = picture;
  const movingCodes = selectedKeys.has(pressedKey.code) ? [...selectedKeys] : [pressedKey.code];
  const boxes = placed
    .filter((item) => movingCodes.includes(item.key.code))
    .map((item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h }));
  const pressed = boxes.find((box) => box.code === pressedKey.code);
  const area = { minX: grid.minX, minY: grid.minY, maxX: grid.minX + grid.spanX, maxY: grid.minY + grid.spanY };
  const keysByCode = new Map(placed.map((item) => [item.key.code, item.key]));
  const startX = pointerEvent.clientX;
  const startY = pointerEvent.clientY;
  let moving = false;
  let lastMove = null;
  let readout = null; // the small "x 3.25  y 1" label that follows the key while dragging
  try {
    node.setPointerCapture(pointerEvent.pointerId);
  } catch {
    /* not a real pointer (tests): events still arrive on the key itself */
  }

  const move = (moveEvent) => {
    const pixelsX = moveEvent.clientX - startX;
    const pixelsY = moveEvent.clientY - startY;
    if (!moving && Math.hypot(pixelsX, pixelsY) < DRAG_START_DISTANCE) return; // a click, not a drag
    if (!moving) {
      moving = true;
      if (!selectedKeys.has(pressedKey.code)) setSelectedKeys([pressedKey.code]);
      for (const box of boxes) nodes.get(box.code).classList.add('drag');
      readout = el('div', { className: 'readout', test: 'key-readout' });
      node.parentElement.append(readout);
    }
    // the pressed key snaps to the grid; the rest of the group moves by the same amount
    const wishedX = snap(pressed.x + pixelsX / grid.unit) - pressed.x;
    const wishedY = snap(pressed.y + pixelsY / grid.unit) - pressed.y;
    const allowed = clampMove(boxes, wishedX, wishedY, area);
    if (lastMove && lastMove.dx === allowed.dx && lastMove.dy === allowed.dy) return;
    lastMove = allowed;
    const positions = movedPositions(boxes, allowed.dx, allowed.dy);
    for (const [code, position] of Object.entries(positions)) {
      const style = nodes.get(code).style;
      style.left = (position.x - grid.minX) * grid.unit + PICTURE_MARGIN + 'px';
      style.top = (position.y - grid.minY) * grid.unit + PICTURE_MARGIN + 'px';
      setKeyPos(keysByCode.get(code), position.x, position.y);
    }
    showReadout(readout, node, positions[pressed.code]);
    push();
  };
  const done = () => {
    readout?.remove();
    node.removeEventListener('pointermove', move);
    node.removeEventListener('pointerup', done);
    node.removeEventListener('pointercancel', done);
    if (!moving) return;
    rememberDrag();
    changed(true);
  };
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', done);
  node.addEventListener('pointercancel', done);
}

/** Update the drag label: the dragged key's position, drawn just above it (or below when it is at the top). */
function showReadout(readout, node, position) {
  readout.textContent = `x ${round2(position.x)}   y ${round2(position.y)}`;
  const above = node.offsetTop - readout.offsetHeight - 4;
  readout.style.left = node.offsetLeft + 'px';
  readout.style.top = (above >= 0 ? above : node.offsetTop + node.offsetHeight + 4) + 'px';
}

// ---- Selecting with a box -------------------------------------------------------------------------------------------
/** The codes of the keys that touch the rectangle (in picture pixels). */
function keysInside(rectangle, nodes) {
  const codes = [];
  for (const [code, node] of nodes) {
    const touchesAcross = node.offsetLeft < rectangle.right && node.offsetLeft + node.offsetWidth > rectangle.left;
    const touchesDown = node.offsetTop < rectangle.bottom && node.offsetTop + node.offsetHeight > rectangle.top;
    if (touchesAcross && touchesDown) codes.push(code);
  }
  return codes;
}

/**
 * Drag a box on the empty part of the picture to select the keys it touches. Ctrl or Shift keeps the keys that are
 * already selected. A plain click on the empty part clears the selection.
 */
function startMarquee(pointerEvent, box, inner, picture) {
  if (pointerEvent.button !== 0) return;
  const origin = inner.getBoundingClientRect();
  const startX = pointerEvent.clientX - origin.left;
  const startY = pointerEvent.clientY - origin.top;
  const keep = isAdditive(pointerEvent) ? [...selectedKeys] : [];
  const rubberBand = el('div', { className: 'marquee' });
  let chosen = keep;
  let drawing = false;
  try {
    box.setPointerCapture(pointerEvent.pointerId);
  } catch {
    /* not a real pointer (tests) */
  }

  const move = (moveEvent) => {
    const x = moveEvent.clientX - origin.left;
    const y = moveEvent.clientY - origin.top;
    if (!drawing && Math.hypot(x - startX, y - startY) < DRAG_START_DISTANCE) return;
    if (!drawing) {
      drawing = true;
      inner.append(rubberBand);
    }
    const rectangle = {
      left: Math.min(startX, x),
      top: Math.min(startY, y),
      right: Math.max(startX, x),
      bottom: Math.max(startY, y),
    };
    Object.assign(rubberBand.style, {
      left: rectangle.left + 'px',
      top: rectangle.top + 'px',
      width: rectangle.right - rectangle.left + 'px',
      height: rectangle.bottom - rectangle.top + 'px',
    });
    chosen = [...new Set([...keep, ...keysInside(rectangle, picture.nodes)])];
    for (const [code, node] of picture.nodes) node.classList.toggle('sel', chosen.includes(code));
  };
  const done = () => {
    box.removeEventListener('pointermove', move);
    box.removeEventListener('pointerup', done);
    box.removeEventListener('pointercancel', done);
    rubberBand.remove();
    setSelectedKeys(chosen);
    render();
  };
  box.addEventListener('pointermove', move);
  box.addEventListener('pointerup', done);
  box.addEventListener('pointercancel', done);
}

/** The positions of the selected keys, as boxes the arrange maths understands (used by keys.js for the nudge pad). */
export function selectedBoxes(layout) {
  const profile = viewProf();
  return placeKeys(layout, profile)
    .filter((item) => selectedKeys.has(item.key.code))
    .map((item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h }));
}
