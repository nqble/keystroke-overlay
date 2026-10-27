// =====================================================================================================================
//  Dragging keys: one key, or the whole selection. The maths (snapping, clamping, group moves) is in tabs/keys-arrange.js,
//  tabs/keys-board.js and tabs/keys-guides.js.
// =====================================================================================================================
import { el } from '../helpers.js';
import { changed, push } from '../preview.js';
import { round2, snap, snapStep } from '../profiles.js';
import { selectedKeys, setSelectedKeys } from '../state.js';
import { clampMove, movedPositions } from '../tabs/keys-arrange.js';
import { boardArea } from '../tabs/keys-board.js';
import { snapToGuides } from '../tabs/keys-guides.js';
import { DRAG_START_DISTANCE, UNIT, isAdditive, saveAt } from './context.js';
import { coveredBox } from './places.js';

/**
 * Drag a key, or the whole selection when the pressed key is part of it. Snaps to the snap step, keeps the group's
 * shape, stops at the edge of the board, and the live preview follows while you drag.
 */
export function dragKeys(ctx, pointerEvent, node, pressedKey) {
  if (isAdditive(pointerEvent)) return;
  const movingCodes = selectedKeys.has(pressedKey.code) ? [...selectedKeys] : [pressedKey.code];
  const boxes = ctx.placed
    .filter((item) => movingCodes.includes(item.key.code))
    .map((item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h }));
  const pressed = boxes.find((boxOf) => boxOf.code === pressedKey.code);
  const area = boardArea(ctx.board);
  // the board's edge stops what the keys cover, so a turned key stays on the board too
  const covered = ctx.placed.filter((item) => movingCodes.includes(item.key.code)).map(coveredBox);
  // Smart guides (shape style, Snap on): the key edges stick to the edges of the keys that stay where they are.
  const hiddenCodes = new Set(ctx.profile.disabledKeys);
  const others = ctx.placed
    .filter((item) => !movingCodes.includes(item.key.code) && !hiddenCodes.has(item.key.code))
    .map((item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h }));
  const useGuides = snapStep() > 0 && ctx.profile.layoutStyle === 'shape';
  const guideLines = { x: null, y: null };
  const keysByCode = new Map(ctx.placed.map((item) => [item.key.code, item.key]));
  const start = { x: pointerEvent.clientX, y: pointerEvent.clientY };
  let moving = false;
  let lastMove = null;
  let readout = null; // the small "x 3.25  y 1" label that follows the key while dragging
  try {
    node.setPointerCapture(pointerEvent.pointerId);
  } catch {
    /* not a real pointer (tests): events still arrive on the key itself */
  }

  const move = (moveEvent) => {
    const pixelsX = moveEvent.clientX - start.x;
    const pixelsY = moveEvent.clientY - start.y;
    if (!moving && Math.hypot(pixelsX, pixelsY) < DRAG_START_DISTANCE) return; // a click, not a drag
    if (!moving) {
      moving = true;
      if (!selectedKeys.has(pressedKey.code)) setSelectedKeys([pressedKey.code]);
      ctx.box.classList.add('panning'); // no sliding while a key is dragged
      ctx.canvas.classList.add('holding'); // the other keys fade while one is held
      ctx.arrangeBar.hidden = true;
      if (ctx.handles) ctx.handles.hidden = true; // the resize handles step aside while a key is dragged
      for (const boxOf of boxes) ctx.nodes.get(boxOf.code)?.classList.add('drag');
      readout = el('div', { className: 'readout', test: 'key-readout' });
      ctx.canvas.append(readout);
    }
    const keysPerPixel = 1 / (UNIT * ctx.view.zoom);
    // the pressed key snaps to a guide or to the grid; the rest of the group moves by the same amount
    const rawX = pressed.x + pixelsX * keysPerPixel;
    const rawY = pressed.y + pixelsY * keysPerPixel;
    const stuck = useGuides ? snapToGuides(pressed, rawX, rawY, others) : null;
    const wishedX = (stuck?.guideX != null ? stuck.x : snap(rawX)) - pressed.x;
    const wishedY = (stuck?.guideY != null ? stuck.y : snap(rawY)) - pressed.y;
    const allowed = clampMove(covered, wishedX, wishedY, area);
    if (lastMove && lastMove.dx === allowed.dx && lastMove.dy === allowed.dy) return;
    lastMove = allowed;
    const positions = movedPositions(boxes, allowed.dx, allowed.dy);
    for (const [code, position] of Object.entries(positions)) {
      const dragged = ctx.nodes.get(code);
      dragged?.style.setProperty('--x', String(position.x));
      dragged?.style.setProperty('--y', String(position.y));
      saveAt(ctx, keysByCode.get(code), position.x, position.y);
    }
    showGuides(ctx, guideLines, stuck?.guideX ?? null, stuck?.guideY ?? null);
    const at = positions[pressed.code];
    readout.textContent = `x ${round2(at.x)}   y ${round2(at.y)}`;
    readout.style.setProperty('--x', String(at.x));
    readout.style.setProperty('--y', String(at.y));
    push();
  };
  const done = () => {
    readout?.remove();
    showGuides(ctx, guideLines, null, null);
    node.removeEventListener('pointermove', move);
    node.removeEventListener('pointerup', done);
    node.removeEventListener('pointercancel', done);
    ctx.box.classList.remove('panning');
    ctx.canvas.classList.remove('holding');
    for (const boxOf of boxes) ctx.nodes.get(boxOf.code)?.classList.remove('drag');
    if (!moving) return;
    ctx.justDragged = true;
    setTimeout(() => {
      ctx.justDragged = false;
    }, 0);
    changed(true);
  };
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', done);
  node.addEventListener('pointercancel', done);
}

/** Draw (or remove) the orange guide lines at the edge x / y (in keys) that a dragged key has stuck to. */
function showGuides(ctx, lines, x, y) {
  for (const [axis, at] of [
    ['x', x],
    ['y', y],
  ]) {
    if (at === null) {
      lines[axis]?.remove();
      lines[axis] = null;
      continue;
    }
    if (!lines[axis]) {
      lines[axis] = el('div', {
        className: 'guide ' + (axis === 'x' ? 'vertical' : 'horizontal'),
        test: 'key-guide-' + axis,
      });
      ctx.canvas.append(lines[axis]);
    }
    lines[axis].style.setProperty('--at', String(at));
  }
}
