// =====================================================================================================================
//  What the key editor's parts share (docs/design/key-editor.md §9a): the sizes, and the one `ctx` object that holds the
//  editor's state and its elements. editor.js makes it; view.js, drag.js, resize.js, marquee.js and arrange-bar.js each
//  take it as their first argument and read or change it, so every part is a small file with one job.
// =====================================================================================================================
import { setKeyPos } from '../profiles.js';
import { selectedKeys } from '../state.js';
import { toBoard } from '../tabs/keys-view.js';

export const UNIT = 40; // pixels per key at 100% zoom (keep in step with --unit in tabs.css)
export const KEY_GAP = 3; // pixels between neighboring keys at 100% zoom (keep in step with the .kmk size in settings.css)
export const DRAG_START_DISTANCE = 3; // pixels the pointer must move before a press counts as a drag, not a click
export const MIN_DOT_RADIUS = 0.7; // pixels on screen: a grid dot never gets smaller than this, however far the view is zoomed out
export const MIN_DOT_SPACING = 6; // pixels: grid dots closer together than this are thinned out so the grid stays readable
export const OVERSCAN = 120; // pixels of empty room that may show beyond the board's edge (so the keys can sit in the middle)
export const FIRST_VIEW_PADDING = 28; // pixels of space between the keyboard and the editor box in the first view
export const FIRST_VIEW_BOTTOM = 44; // extra room kept under the keyboard for the zoom buttons
export const ARRANGE_GAP = 10; // pixels between the arrange bar and the selected keys

/**
 * The editor's state and elements.
 * @typedef {Object} EditorContext
 * @property {Map<string, HTMLElement>} nodes key code -> its element
 * @property {{ zoom: number, panX: number, panY: number }} view
 * @property {{ w: number, h: number }} board
 * @property {{ w: number, h: number, originX: number, originY: number }} frame the board and where the layout's own origin sits on it (in keys)
 * @property {any[]} layoutPlaces the layout style's own places before any edit, in saved places: [{ code, x, y, w, h }]
 * @property {{ w: number, h: number }} boxSize the editor box in pixels (0 while it is not on the page)
 * @property {string} shownFor layout id and style the key elements were made for
 * @property {boolean} needsFirstView
 * @property {boolean} viewTouched true once the user zoomed or panned: the view is theirs from then on
 * @property {any[]} placed [{ key, x, y, w, h }] as of the last update
 * @property {any} profile
 * @property {any} layout
 * @property {boolean} justDragged true right after a drag, so the click that follows does not also change the selection
 * @property {any} handles the resize handles of the selected key, when there are any
 * @property {HTMLElement} canvas
 * @property {HTMLElement} box
 * @property {HTMLElement} arrangeBar
 * @property {HTMLElement} zoomLabel
 */

/** True when Ctrl, Shift or Cmd is held: clicking then adds a key to the selection or removes it. */
export const isAdditive = (pointerEvent) => pointerEvent.ctrlKey || pointerEvent.shiftKey || pointerEvent.metaKey;

/** The board's size in pixels at 100% zoom. */
export const content = (ctx) => ({ w: ctx.board.w * UNIT, h: ctx.board.h * UNIT });

/** Save a key's place, given as a board place (the board is centered on the layout, so a saved place is the board place minus the origin). */
export const saveAt = (ctx, key, x, y) => setKeyPos(key, x - ctx.frame.originX, y - ctx.frame.originY);

/** The selected keys as boxes in board places: [{ code, x, y, w, h }]. */
export const selectedBoardBoxes = (ctx) =>
  ctx.placed
    .filter((item) => selectedKeys.has(item.key.code))
    .map((item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h }));

/** A pointer position as a point inside the box, measured from the inside of its border (where the board starts). */
export function insideBox(ctx, pointerEvent) {
  const rect = ctx.box.getBoundingClientRect();
  return {
    x: pointerEvent.clientX - rect.left - ctx.box.clientLeft,
    y: pointerEvent.clientY - rect.top - ctx.box.clientTop,
  };
}

/** A pointer position as a point on the board in pixels at 100% zoom. */
export const boardPoint = (ctx, pointerEvent) => toBoard(insideBox(ctx, pointerEvent), ctx.view);
