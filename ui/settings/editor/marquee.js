// =====================================================================================================================
//  Selecting with a box: drag on the empty part of the board to select the keys it touches.
// =====================================================================================================================
import { el } from '../helpers.js';
import { render } from '../settings.js';
import { selectedKeys, setSelectedKeys } from '../state.js';
import { DRAG_START_DISTANCE, KEY_GAP, UNIT, boardPoint, isAdditive } from './context.js';

/** The codes of the keys that touch the rectangle (board pixels at 100% zoom). */
function keysInside(ctx, rectangle) {
  const codes = [];
  for (const item of ctx.placed) {
    // the key as drawn: its cell minus the 3 pixel gap (KEY_GAP, as in settings.css)
    const touchesAcross = item.x * UNIT < rectangle.right && (item.x + item.w) * UNIT - KEY_GAP > rectangle.left;
    const touchesDown = item.y * UNIT < rectangle.bottom && (item.y + item.h) * UNIT - KEY_GAP > rectangle.top;
    if (touchesAcross && touchesDown) codes.push(item.key.code);
  }
  return codes;
}

/**
 * Drag a box on the empty part of the board to select the keys it touches. Ctrl or Shift keeps the keys that are
 * already selected. A plain click on the empty part clears the selection.
 */
export function startMarquee(ctx, pointerEvent) {
  if (pointerEvent.button !== 0) return;
  const origin = boardPoint(ctx, pointerEvent);
  const keep = isAdditive(pointerEvent) ? [...selectedKeys] : [];
  const rubberBand = el('div', { className: 'marquee' });
  let chosen = keep;
  let drawing = false;
  try {
    ctx.box.setPointerCapture(pointerEvent.pointerId);
  } catch {
    /* not a real pointer (tests) */
  }

  const move = (moveEvent) => {
    const point = boardPoint(ctx, moveEvent);
    if (
      !drawing &&
      Math.hypot((point.x - origin.x) * ctx.view.zoom, (point.y - origin.y) * ctx.view.zoom) < DRAG_START_DISTANCE
    )
      return;
    if (!drawing) {
      drawing = true;
      ctx.arrangeBar.hidden = true;
      ctx.canvas.append(rubberBand);
    }
    const rectangle = {
      left: Math.min(origin.x, point.x),
      top: Math.min(origin.y, point.y),
      right: Math.max(origin.x, point.x),
      bottom: Math.max(origin.y, point.y),
    };
    rubberBand.style.setProperty('--left', rectangle.left + 'px');
    rubberBand.style.setProperty('--top', rectangle.top + 'px');
    rubberBand.style.setProperty('--width', rectangle.right - rectangle.left + 'px');
    rubberBand.style.setProperty('--height', rectangle.bottom - rectangle.top + 'px');
    chosen = [...new Set([...keep, ...keysInside(ctx, rectangle)])];
    for (const [code, node] of ctx.nodes) node.classList.toggle('sel', chosen.includes(code));
  };
  const done = () => {
    ctx.box.removeEventListener('pointermove', move);
    ctx.box.removeEventListener('pointerup', done);
    ctx.box.removeEventListener('pointercancel', done);
    rubberBand.remove();
    setSelectedKeys(chosen);
    render();
  };
  ctx.box.addEventListener('pointermove', move);
  ctx.box.addEventListener('pointerup', done);
  ctx.box.addEventListener('pointercancel', done);
}
