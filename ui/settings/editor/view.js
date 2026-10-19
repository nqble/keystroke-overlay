// =====================================================================================================================
//  The editor's view: zoom, pan, the first view of a layout, and the zoom buttons. The maths (limits, clamping) is in
//  tabs/keys-view.js.
// =====================================================================================================================
import { button, el } from '../helpers.js';
import { showHiddenKeys } from '../profiles.js';
import { boundsOf } from '../tabs/keys-arrange.js';
import { BUTTON_ZOOM, ZOOM_MAX, centredView, clampView, coverZoom, zoomAt } from '../tabs/keys-view.js';
import { placeArrangeBar } from './arrange-bar.js';
import { attachViewGestures } from './view-gestures.js';
import {
  FIRST_VIEW_BOTTOM,
  FIRST_VIEW_PADDING,
  MIN_DOT_SPACING,
  OVERSCAN,
  UNIT,
  content,
  insideBox,
} from './context.js';

/** Build the zoom buttons (and the percent label) and put the label in the context. */
export function buildZoomControls(ctx) {
  const zoomLabel = button(
    '100%',
    () => {
      ctx.viewTouched = true;
      setView(ctx, centredView(ctx.boxSize, content(ctx), 1, OVERSCAN));
    },
    'zoom-percent',
    'editor-zoom-reset',
  );
  zoomLabel.title = 'Zoom to 100% and center the board';
  const zoomBy = (factor) => () => {
    ctx.viewTouched = true;
    setView(
      ctx,
      zoomAt(ctx.view, factor, { x: ctx.boxSize.w / 2, y: ctx.boxSize.h / 2 }, ctx.boxSize, content(ctx), OVERSCAN),
    );
  };
  const zoomOut = button('−', zoomBy(1 / BUTTON_ZOOM), 'zoom-step', 'editor-zoom-out');
  zoomOut.title = 'Zoom out';
  const zoomIn = button('+', zoomBy(BUTTON_ZOOM), 'zoom-step', 'editor-zoom-in');
  zoomIn.title = 'Zoom in';
  const zoomControls = el('div', { className: 'zoom-controls' }, zoomOut, zoomLabel, zoomIn);
  ctx.zoomLabel = zoomLabel;
  return zoomControls;
}

/** The area the first view shows: the keys that are drawn (the whole layout while hidden keys are shown), in board places. */
function shownBounds(ctx) {
  const hidden = new Set(ctx.profile.disabledKeys);
  const drawn = ctx.placed.filter((item) => !hidden.has(item.key.code));
  const boxes =
    showHiddenKeys() || !drawn.length
      ? ctx.layoutPlaces.map((place) => ({ ...place, x: place.x + ctx.frame.originX, y: place.y + ctx.frame.originY }))
      : drawn.map((item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h }));
  return boundsOf(boxes);
}

/** Show the board at `next` (a { zoom, panX, panY } view state). */
export function setView(ctx, next) {
  ctx.view = next;
  ctx.canvas.style.setProperty('--zoom', String(ctx.view.zoom));
  ctx.canvas.style.setProperty('--pan-x', ctx.view.panX + 'px');
  ctx.canvas.style.setProperty('--pan-y', ctx.view.panY + 'px');
  ctx.zoomLabel.textContent = Math.round(ctx.view.zoom * 100) + '%';
  placeArrangeBar(ctx);
  // grid dots every half key (every whole key in the Even grid), whatever the Snap switch says, thinned out (every 2nd, 4th,
  // ...) when they would be closer than MIN_DOT_SPACING on screen
  const dotStep = ctx.profile?.layoutStyle === 'grid' ? 1 : 0.5;
  const spacing = dotStep * UNIT * ctx.view.zoom;
  let every = 1;
  while (spacing * every < MIN_DOT_SPACING) every *= 2;
  ctx.canvas.style.setProperty('--dot-spacing', dotStep * UNIT * every + 'px');
}

/** Keep the view legal after the box or the board changed size. */
export function refit(ctx) {
  if (!ctx.boxSize.w) return;
  const zoom = Math.max(ctx.view.zoom, coverZoom(ctx.boxSize, content(ctx)));
  setView(ctx, clampView({ ...ctx.view, zoom: Math.min(ZOOM_MAX, zoom) }, ctx.boxSize, content(ctx), OVERSCAN));
}

/** The first view of a layout: its keys centered in the box, as large as fits (never more than 100%). */
export function firstView(ctx) {
  // The keyboard goes in the middle of the box with FIRST_VIEW_PADDING of space around it, and the zoom buttons get their own
  // strip underneath (FIRST_VIEW_BOTTOM), so nothing sits on top of the keys.
  const shown = shownBounds(ctx);
  const spanX = shown.maxX - shown.minX;
  const spanY = shown.maxY - shown.minY;
  const availableW = ctx.boxSize.w - FIRST_VIEW_PADDING * 2;
  const availableH = ctx.boxSize.h - FIRST_VIEW_PADDING * 2 - FIRST_VIEW_BOTTOM;
  const fit = Math.min(1, availableW / (spanX * UNIT), availableH / (spanY * UNIT));
  const zoom = Math.min(ZOOM_MAX, Math.max(fit, coverZoom(ctx.boxSize, content(ctx))));
  const panX = FIRST_VIEW_PADDING + (availableW - spanX * UNIT * zoom) / 2 - shown.minX * UNIT * zoom;
  const panY = FIRST_VIEW_PADDING + (availableH - spanY * UNIT * zoom) / 2 - shown.minY * UNIT * zoom;
  ctx.box.classList.add('instant'); // no sliding into the first view
  setView(ctx, clampView({ zoom, panX, panY }, ctx.boxSize, content(ctx), OVERSCAN));
  requestAnimationFrame(() => ctx.box.classList.remove('instant'));
  ctx.needsFirstView = false;
}

/** Start what moves the view: the box's size, and the zoom and pan gestures (view-gestures.js). */
export function bindViewGestures(ctx) {
  // The box is measured while it is on the page; leaving the Keys tab and coming back keeps zoom and pan.
  new ResizeObserver(() => {
    const width = ctx.box.clientWidth,
      height = ctx.box.clientHeight;
    if (!width || !height) return; // off the page: keep the view as it was
    ctx.boxSize = { w: width, h: height };
    // until the user zooms or pans, the first view follows the box (it may still be settling into the page layout)
    if ((ctx.needsFirstView || !ctx.viewTouched) && ctx.layout) firstView(ctx);
    else refit(ctx);
  }).observe(ctx.box);

  // Wheel, pinch, Space + drag and middle-button drag: view-gestures.js (what each means: tabs/keys-gestures.js).
  attachViewGestures(ctx.box, {
    view: () => ctx.view,
    setView: (next) => setView(ctx, next),
    boxSize: () => ctx.boxSize,
    content: () => content(ctx),
    insideBox: (pointerEvent) => insideBox(ctx, pointerEvent),
    overscan: OVERSCAN,
    markTouched: () => {
      ctx.viewTouched = true;
    },
  });
}
