// =====================================================================================================================
//  What a wheel, pinch or pointer press over the key editor's board means (docs/design/key-editor.md §3, Zoom and Pan).
//  Plain logic, no page code, so tests/ui can run it with Node; editor/view-gestures.js attaches it to the board.
//
//  On a Mac the trackpad is the main pointer, so a two-finger scroll pans (any direction), a pinch zooms around the
//  pointer, and Command + scroll zooms for a Mac with a mouse. On Windows and Linux the wheel zooms, as it always did.
//  On every system: hold Space and drag, or drag with the middle button, to pan; a trackpad pinch zooms.
// =====================================================================================================================
import { wheelFactor } from './keys-view.js';

/** A pinch zooms this much per unit of `deltaY` (a pinch sends small fractions, unlike a wheel notch of about 100). */
export const PINCH_SPEED = 0.01;

/** A wheel event with Ctrl held and a `deltaY` smaller than this is a trackpad pinch, not Ctrl + a mouse wheel notch. */
export const PINCH_MAX_DELTA = 30;

/** Browsers can report a wheel in lines instead of pixels; one line counts as this many pixels. */
const PIXELS_PER_LINE = 16;
const LINE_MODE = 1;

const MIDDLE_BUTTON = 1;
const MAIN_BUTTON = 0;

/** The wheel's movement in pixels (`deltaX`, `deltaY`), whatever unit the browser reported it in. */
function pixelsOf(wheelEvent) {
  const scale = wheelEvent.deltaMode === LINE_MODE ? PIXELS_PER_LINE : 1;
  return { x: wheelEvent.deltaX * scale, y: wheelEvent.deltaY * scale };
}

/**
 * What one wheel event does over the board: { type: 'zoom', factor } or { type: 'pan', dx, dy } (screen pixels to move the
 * view by). A pinch is also `continuous: true`, and so is every pan: a stream of many small events, which must not slide
 * (the board's 150 ms transition would restart on every event and lag behind the fingers). `platform` is "windows", "macos" or "linux" (state.js).
 */
export function wheelAction(wheelEvent, platform) {
  const { x, y } = pixelsOf(wheelEvent);
  const isPinch = wheelEvent.ctrlKey && Math.abs(y) < PINCH_MAX_DELTA;
  if (isPinch) return { type: 'zoom', factor: Math.exp(-y * PINCH_SPEED), continuous: true };
  if (wheelEvent.ctrlKey || wheelEvent.metaKey) return { type: 'zoom', factor: wheelFactor(y) };
  if (platform === 'macos') return { type: 'pan', dx: -x, dy: -y };
  return { type: 'zoom', factor: wheelFactor(y) };
}

/** The zoom factor for Safari's pinch events: `scale` is the pinch's size now, `before` its size at the last event. */
export const gestureFactor = (scale, before) => (before > 0 && scale > 0 ? scale / before : 1);

/** Does this pointer press start panning the view? The middle button always does; the main button does while Space is held. */
export function startsPan(pointerEvent, spaceHeld) {
  if (pointerEvent.button === MIDDLE_BUTTON) return true;
  return pointerEvent.button === MAIN_BUTTON && spaceHeld;
}

/** A key press aimed at a text box or dropdown is typing, never a pan gesture (Space must still type a space there). */
export function isTypingTarget(target) {
  const tag = target?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!target?.isContentEditable;
}
