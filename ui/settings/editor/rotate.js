// =====================================================================================================================
//  Turning the selected key: the round handle just outside its top-right corner (key rotation,
//  docs/proposals/key-rotation.md). Dragging it turns the key around its center; with Snap on the angle moves in 15° steps.
//  The maths is in tabs/keys-turn.js. resize.js adds this handle next to its own, in the Keyboard shape style only; the key's
//  Angle field (tabs/keys-inspector.js) does the same with the keyboard.
// =====================================================================================================================
import { el } from '../helpers.js';
import { changed, push } from '../preview.js';
import { ANGLE_SNAP, setKeyAngle, snapStep } from '../profiles.js';
import { pointerAngle, turnedAngle } from '../tabs/keys-turn.js';
import { UNIT, boardPoint } from './context.js';

/** The turning handle, for resize.js to add to the selected key's handles. */
export function turnHandle(ctx) {
  const handle = el('div', { className: 'handle turn', test: 'key-handle-turn' });
  handle.onpointerdown = (pointerEvent) => {
    if (pointerEvent.button !== 0) return;
    pointerEvent.stopPropagation(); // not a selection box, not a key drag
    turnKey(ctx, pointerEvent, handle);
  };
  return handle;
}

/** Drag the handle to turn the key around its center. Saved once, when the handle is let go. */
function turnKey(ctx, pointerEvent, handle) {
  const item = ctx.placed.find((candidate) => candidate.key.code === ctx.handles.dataset.code);
  if (!item) return;
  const center = { x: (item.x + item.w / 2) * UNIT, y: (item.y + item.h / 2) * UNIT }; // board pixels at 100% zoom
  const startPointer = pointerAngle(center, boardPoint(ctx, pointerEvent));
  const step = snapStep() ? ANGLE_SNAP : 1;
  const node = ctx.nodes.get(item.key.code);
  const readout = el('div', { className: 'readout', test: 'key-readout' });
  readout.style.setProperty('--x', String(item.x));
  readout.style.setProperty('--y', String(item.y));
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
    const angle = turnedAngle(item.r ?? 0, startPointer, pointerAngle(center, boardPoint(ctx, moveEvent)), step);
    for (const target of [node, ctx.handles]) target?.style.setProperty('--r', `${angle}deg`);
    setKeyAngle(item.key, angle);
    readout.textContent = `angle ${angle}°`;
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
