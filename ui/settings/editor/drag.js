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
import { DRAG_START_DISTANCE, UNIT, followPointer, isAdditive, saveAt } from './context.js';
import { coveredBox } from './places.js';

/**
 * Drag a key, or the whole selection when the pressed key is part of it. Snaps to the snap step, keeps the group's
 * shape, stops at the edge of the board, and the live preview follows while you drag.
 */
const boxOfItem = (item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h });

/** Everything a drag needs to know at its start: which keys move, where they are, and what they may snap to. */
function prepareDrag(ctx, pointerEvent, pressedKey) {
  const movingCodes = selectedKeys.has(pressedKey.code) ? [...selectedKeys] : [pressedKey.code];
  const isMoving = (item) => movingCodes.includes(item.key.code);
  const boxes = ctx.placed.filter(isMoving).map(boxOfItem);
  // Smart guides (shape style, Snap on): the key edges stick to the edges of the keys that stay where they are.
  const hiddenCodes = new Set(ctx.profile.disabledKeys);
  return {
    pressedKey,
    boxes,
    pressed: boxes.find((boxOf) => boxOf.code === pressedKey.code),
    area: boardArea(ctx.board),
    // the board's edge stops what the keys cover, so a turned key stays on the board too
    covered: ctx.placed.filter(isMoving).map(coveredBox),
    others: ctx.placed.filter((item) => !isMoving(item) && !hiddenCodes.has(item.key.code)).map(boxOfItem),
    useGuides: snapStep() > 0 && ctx.profile.layoutStyle === 'shape',
    guideLines: { x: null, y: null },
    keysByCode: new Map(ctx.placed.map((item) => [item.key.code, item.key])),
    start: { x: pointerEvent.clientX, y: pointerEvent.clientY },
    moving: false,
    lastMove: null,
    readout: null, // the small "x 3.25  y 1" label that follows the key while dragging
  };
}

/** The press became a drag: select the key if needed, fade the others, hide the bars, show the readout. */
function startMoving(ctx, drag) {
  drag.moving = true;
  if (!selectedKeys.has(drag.pressedKey.code)) setSelectedKeys([drag.pressedKey.code]);
  ctx.box.classList.add('panning'); // no sliding while a key is dragged
  ctx.canvas.classList.add('holding'); // the other keys fade while one is held
  ctx.arrangeBar.hidden = true;
  if (ctx.handles) ctx.handles.hidden = true; // the resize handles step aside while a key is dragged
  for (const boxOf of drag.boxes) ctx.nodes.get(boxOf.code)?.classList.add('drag');
  drag.readout = el('div', { className: 'readout', test: 'key-readout' });
  ctx.canvas.append(drag.readout);
}

/** How far the keys may move for this pointer position: the pressed key snaps to a guide or the grid, the board's
 * edge stops the group. Returns { allowed, stuck }. */
function allowedMove(ctx, drag, pixelsX, pixelsY) {
  const { pressed } = drag;
  const keysPerPixel = 1 / (UNIT * ctx.view.zoom);
  const rawX = pressed.x + pixelsX * keysPerPixel;
  const rawY = pressed.y + pixelsY * keysPerPixel;
  const stuck = drag.useGuides ? snapToGuides(pressed, rawX, rawY, drag.others) : null;
  const wishedX = (stuck?.guideX != null ? stuck.x : snap(rawX)) - pressed.x;
  const wishedY = (stuck?.guideY != null ? stuck.y : snap(rawY)) - pressed.y;
  return { allowed: clampMove(drag.covered, wishedX, wishedY, drag.area), stuck };
}

/** Moves the keys' pictures, saves their places, and updates the guides and the readout. */
function showMove(ctx, drag, allowed, stuck) {
  const positions = movedPositions(drag.boxes, allowed.dx, allowed.dy);
  for (const [code, position] of Object.entries(positions)) {
    const dragged = ctx.nodes.get(code);
    dragged?.style.setProperty('--x', String(position.x));
    dragged?.style.setProperty('--y', String(position.y));
    saveAt(ctx, drag.keysByCode.get(code), position.x, position.y);
  }
  showGuides(ctx, drag.guideLines, stuck?.guideX ?? null, stuck?.guideY ?? null);
  const at = positions[drag.pressed.code];
  drag.readout.textContent = `x ${round2(at.x)}   y ${round2(at.y)}`;
  drag.readout.style.setProperty('--x', String(at.x));
  drag.readout.style.setProperty('--y', String(at.y));
  push();
}

/** The press ended: tidy up, and when keys moved, save (and swallow the click that follows). */
function endDrag(ctx, drag) {
  drag.readout?.remove();
  showGuides(ctx, drag.guideLines, null, null);
  ctx.box.classList.remove('panning');
  ctx.canvas.classList.remove('holding');
  for (const boxOf of drag.boxes) ctx.nodes.get(boxOf.code)?.classList.remove('drag');
  if (!drag.moving) return;
  ctx.justDragged = true;
  setTimeout(() => {
    ctx.justDragged = false;
  }, 0);
  changed(true);
}

export function dragKeys(ctx, pointerEvent, node, pressedKey) {
  if (isAdditive(pointerEvent)) return;
  const drag = prepareDrag(ctx, pointerEvent, pressedKey);
  const move = (moveEvent) => {
    const pixelsX = moveEvent.clientX - drag.start.x;
    const pixelsY = moveEvent.clientY - drag.start.y;
    if (!drag.moving && Math.hypot(pixelsX, pixelsY) < DRAG_START_DISTANCE) return; // a click, not a drag
    if (!drag.moving) startMoving(ctx, drag);
    const { allowed, stuck } = allowedMove(ctx, drag, pixelsX, pixelsY);
    if (drag.lastMove && drag.lastMove.dx === allowed.dx && drag.lastMove.dy === allowed.dy) return;
    drag.lastMove = allowed;
    showMove(ctx, drag, allowed, stuck);
  };
  followPointer(node, pointerEvent, move, () => endDrag(ctx, drag));
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
