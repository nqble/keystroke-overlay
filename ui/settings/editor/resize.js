// =====================================================================================================================
//  Resizing the selected key: the thin handles on its four sides. The maths is in tabs/keys-board.js (resizeBox).
// =====================================================================================================================
import { el } from '../helpers.js';
import { changed, push } from '../preview.js';
import { baseHeight, baseWidth, round2, setKeyHeight, setKeyWidth, snapStep } from '../profiles.js';
import { selectedKeys } from '../state.js';
import { resizeBox } from '../tabs/keys-board.js';
import { UNIT, saveAt } from './context.js';
import { turnHandle } from './rotate.js';

/** Show the resize handles on the four sides of the selected key, and its turning handle (only when one shown key is selected). */
export function updateHandles(ctx, hidden) {
  const code = selectedKeys.size === 1 ? [...selectedKeys][0] : null;
  const item = code && !hidden.has(code) ? ctx.placed.find((candidate) => candidate.key.code === code) : null;
  if (!item) {
    ctx.handles?.remove();
    ctx.handles = null;
    return;
  }
  if (!ctx.handles) {
    ctx.handles = el('div', { className: 'handles', test: 'key-handles' });
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const handle = el('div', { className: 'handle ' + side, test: 'key-handle-' + side });
      handle.onpointerdown = (pointerEvent) => {
        if (pointerEvent.button !== 0) return;
        pointerEvent.stopPropagation(); // not a selection box, not a key drag
        resizeKey(ctx, pointerEvent, handle, side);
      };
      ctx.handles.append(handle);
    }
    // Turning: the Keyboard shape style only (the even grid keeps neat columns). The handles are made again when the
    // style changes (editor.js), so this choice holds while they live.
    if (ctx.profile.layoutStyle === 'shape') ctx.handles.append(turnHandle(ctx));
    ctx.canvas.append(ctx.handles);
  }
  ctx.handles.hidden = false;
  ctx.handles.dataset.code = item.key.code;
  ctx.handles.style.setProperty('--x', String(item.x));
  ctx.handles.style.setProperty('--y', String(item.y));
  ctx.handles.style.setProperty('--w', String(item.w));
  ctx.handles.style.setProperty('--h', String(item.h));
  ctx.handles.style.setProperty('--r', `${item.r ?? 0}deg`); // the handles turn with the key
}

/**
 * Drag a handle to resize the key: the opposite edge stays put, the width snaps to the snap step, and it stays between
 * the layout own width (or one key) and the board edge. Saved once, when the handle is let go.
 */
function resizeKey(ctx, pointerEvent, handle, side) {
  const item = ctx.placed.find((candidate) => candidate.key.code === ctx.handles.dataset.code);
  if (!item) return;
  const { key } = item;
  const start = { x: pointerEvent.clientX, y: pointerEvent.clientY };
  const startBox = { code: key.code, x: item.x, y: item.y, w: item.w, h: item.h };
  const vertical = side === 'top' || side === 'bottom';
  const layoutSize = vertical ? baseHeight(key) : baseWidth(key, ctx.profile.layoutStyle);
  const node = ctx.nodes.get(key.code);
  const readout = el('div', { className: 'readout', test: 'key-readout' });
  ctx.canvas.append(readout);
  ctx.canvas.classList.add('holding');
  node?.classList.add('drag');
  ctx.box.classList.add('panning');
  ctx.arrangeBar.hidden = true;
  try {
    handle.setPointerCapture(pointerEvent.pointerId);
  } catch {
    /* not a real pointer (tests) */
  }
  const move = (moveEvent) => {
    const delta = (vertical ? moveEvent.clientY - start.y : moveEvent.clientX - start.x) / (UNIT * ctx.view.zoom);
    const resized = resizeBox(startBox, side, delta, ctx.board, snapStep(), layoutSize);
    const at = { x: resized.x ?? startBox.x, y: resized.y ?? startBox.y };
    for (const target of [node, ctx.handles]) {
      if (vertical) {
        target?.style.setProperty('--y', String(resized.y));
        target?.style.setProperty('--h', String(resized.h));
      } else {
        target?.style.setProperty('--x', String(resized.x));
        target?.style.setProperty('--w', String(resized.w));
      }
    }
    if (side === 'left' || side === 'top') saveAt(ctx, key, at.x, at.y); // the opposite edge stays put, so the place moves
    if (vertical) setKeyHeight(key, resized.h);
    else setKeyWidth(key, resized.w);
    readout.textContent = vertical ? `height ${round2(resized.h)}` : `width ${round2(resized.w)}`;
    readout.style.setProperty('--x', String(at.x));
    readout.style.setProperty('--y', String(at.y));
    push();
  };
  const done = () => {
    readout.remove();
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', done);
    handle.removeEventListener('pointercancel', done);
    ctx.box.classList.remove('panning');
    ctx.canvas.classList.remove('holding');
    node?.classList.remove('drag');
    changed(true);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', done);
  handle.addEventListener('pointercancel', done);
}
