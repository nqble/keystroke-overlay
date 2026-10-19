// =====================================================================================================================
//  The key editor's zoom and pan gestures: the wheel (a two-finger scroll pans on a Mac, the wheel zooms elsewhere), a
//  trackpad pinch, Command + scroll, Space + drag and middle-button drag (docs/design/key-editor.md §3, Zoom and Pan).
//  What each one means is plain logic in tabs/keys-gestures.js (tested); this file attaches it to the board's box.
//  view.js gives it a few functions so it never touches the editor's own state.
// =====================================================================================================================
import { gestureFactor, isTypingTarget, startsPan, wheelAction } from '../tabs/keys-gestures.js';
import { clampView, panBy, stretchPan, zoomAt } from '../tabs/keys-view.js';
import { platform } from '../state.js';

const SPACE_CODE = 'Space';
/** How long after the last scroll or pinch event the board is given back its smooth sliding. */
const STREAM_IDLE_MS = 150;
const NO_PAN_AREAS = '.zoom-controls, .arrange-bar'; // controls on top of the board keep their own clicks

/**
 * Wire the gestures onto `box`. `editor` has: `view()` the current { zoom, panX, panY }, `setView(next)`, `boxSize()`
 * { w, h }, `content()` { w, h } of the board at 100%, `insideBox(event)` a pointer as a point inside the box, and
 * `markTouched()` to say the view is now the user's (it stops following the box on its own), and `overscan`, the empty room
 * in pixels that may show beyond the board's edge (keys-view.js clampPan).
 */
export function attachViewGestures(box, editor) {
  const state = { spaceHeld: false, pointerInside: false, lastScale: 1, idleTimer: 0 };

  /**
   * A trackpad scroll or pinch is a stream of small events. The board slides smoothly between a notch of the wheel and
   * the next, but it must follow a stream exactly, so sliding is off while the stream lasts and back a moment after.
   */
  const followExactly = () => {
    box.classList.add('panning');
    clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => box.classList.remove('panning'), STREAM_IDLE_MS);
  };

  // ---- Wheel and pinch ----------------------------------------------------------------------------------------------
  // Not passive on purpose: the board zooms or pans, the window does not scroll.
  box.addEventListener(
    'wheel',
    (wheelEvent) => {
      wheelEvent.preventDefault();
      editor.markTouched();
      const action = wheelAction(wheelEvent, platform);
      if (action.type === 'pan' || action.continuous) followExactly();
      if (action.type === 'pan') {
        editor.setView(panBy(editor.view(), action.dx, action.dy, editor.boxSize(), editor.content(), editor.overscan));
        return;
      }
      editor.setView(
        zoomAt(
          editor.view(),
          action.factor,
          editor.insideBox(wheelEvent),
          editor.boxSize(),
          editor.content(),
          editor.overscan,
        ),
      );
    },
    { passive: false },
  );

  // Safari's engine (the Mac window) sends a pinch as gesture events, not as a Ctrl + wheel.
  box.addEventListener('gesturestart', (gestureEvent) => {
    gestureEvent.preventDefault();
    state.lastScale = 1;
  });
  box.addEventListener('gesturechange', (gestureEvent) => {
    gestureEvent.preventDefault();
    editor.markTouched();
    followExactly();
    const factor = gestureFactor(gestureEvent.scale, state.lastScale);
    state.lastScale = gestureEvent.scale;
    editor.setView(
      zoomAt(
        editor.view(),
        factor,
        editor.insideBox(gestureEvent),
        editor.boxSize(),
        editor.content(),
        editor.overscan,
      ),
    );
  });

  // ---- Space ----------------------------------------------------------------------------------------------------------
  // Holding Space only makes a drag over the board pan; a tap of Space on a focused key still selects it, because the
  // press is judged when the pointer goes down, not when Space does.
  const showSpace = (held) => {
    state.spaceHeld = held;
    box.classList.toggle('space-held', held);
  };
  addEventListener('keydown', (keyEvent) => {
    if (keyEvent.code !== SPACE_CODE || isTypingTarget(keyEvent.target)) return;
    const onPage =
      keyEvent.target === document.body || (keyEvent.target instanceof Node && box.contains(keyEvent.target));
    if (state.pointerInside && onPage) {
      keyEvent.preventDefault(); // the page must not scroll while the person is about to drag
    }
    showSpace(true);
  });
  addEventListener('keyup', (keyEvent) => {
    if (keyEvent.code === SPACE_CODE) showSpace(false);
  });
  addEventListener('blur', () => showSpace(false)); // never stay stuck in pan mode when the window loses focus
  box.addEventListener('pointerenter', () => (state.pointerInside = true));
  box.addEventListener('pointerleave', () => (state.pointerInside = false));

  // ---- Drag to pan -----------------------------------------------------------------------------------------------------
  // The middle button, or Space + the main button, pans from anywhere in the box, even from on top of a key. Pulling
  // past an edge stretches the view, and it springs back when the button is released.
  box.addEventListener(
    'pointerdown',
    (pointerEvent) => {
      if (pointerEvent.target.closest?.(NO_PAN_AREAS) || !startsPan(pointerEvent, state.spaceHeld)) return;
      pointerEvent.preventDefault(); // no browser autoscroll
      pointerEvent.stopImmediatePropagation(); // never selects or moves the key under the pointer, or draws a box
      editor.markTouched();
      const before = editor.view();
      const start = { x: pointerEvent.clientX, y: pointerEvent.clientY, panX: before.panX, panY: before.panY };
      box.classList.add('panning');
      try {
        box.setPointerCapture(pointerEvent.pointerId);
      } catch {
        /* not a real pointer (tests) */
      }
      const move = (moveEvent) => {
        const now = editor.view();
        const size = editor.boxSize();
        const content = editor.content();
        const panX = start.panX + moveEvent.clientX - start.x;
        const panY = start.panY + moveEvent.clientY - start.y;
        editor.setView({
          zoom: now.zoom,
          panX: stretchPan(panX, now.zoom, size.w, content.w, editor.overscan),
          panY: stretchPan(panY, now.zoom, size.h, content.h, editor.overscan),
        });
      };
      const done = () => {
        box.removeEventListener('pointermove', move);
        box.removeEventListener('pointerup', done);
        box.removeEventListener('pointercancel', done);
        box.classList.remove('panning');
        editor.setView(clampView(editor.view(), editor.boxSize(), editor.content(), editor.overscan)); // springs back
      };
      box.addEventListener('pointermove', move);
      box.addEventListener('pointerup', done);
      box.addEventListener('pointercancel', done);
    },
    true,
  );
  box.addEventListener('auxclick', (clickEvent) => clickEvent.preventDefault());
}
