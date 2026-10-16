// =====================================================================================================================
//  The key editor's view: zoom and pan over the board (docs/design/key-editor.md §3, Zoom and Pan).
//  Plain math, no page code, so tests/ui can run it with Node. The page applies the result as one CSS transform:
//  translate(panX, panY) scale(zoom) on the board layer.
//
//  Sizes are in screen pixels: `view` is the editor box ({ w, h }), `content` is the board layer at 100% ({ w, h }).
//  A view state is { zoom, panX, panY }: the board's top-left corner sits at (panX, panY) inside the box.
// =====================================================================================================================

export const ZOOM_MAX = 2;

/** One mouse-wheel notch (deltaY 100) zooms about 12%: factor = e^(−deltaY × WHEEL_SPEED). */
export const WHEEL_SPEED = 0.0012;

/** The − and + buttons zoom by this factor around the middle of the box. */
export const BUTTON_ZOOM = 1.2;

/** Panning past the edge with the middle button moves at this share of the pointer's movement, then springs back. */
export const STRETCH = 0.3;

/** The smallest zoom: the board just fills the box, so nothing outside the board can show. */
export const coverZoom = (view, content) => Math.max(view.w / content.w, view.h / content.h);

/** The zoom factor for one wheel event. */
export const wheelFactor = (deltaY) => Math.exp(-deltaY * WHEEL_SPEED);

/**
 * The pan for one axis, kept so only the board shows: the board's near edge never moves inside the box, and neither
 * does its far edge. `viewSize` and `contentSize` are that axis's sizes; `zoom` is the current zoom.
 */
export function clampPan(pan, zoom, viewSize, contentSize) {
  const scaled = contentSize * zoom;
  if (scaled <= viewSize) return (viewSize - scaled) / 2;
  return Math.min(0, Math.max(viewSize - scaled, pan));
}

/** Like clampPan, but lets the view go past the limit at STRETCH speed while the user is still dragging. */
export function stretchPan(pan, zoom, viewSize, contentSize) {
  const limit = clampPan(pan, zoom, viewSize, contentSize);
  return limit + (pan - limit) * STRETCH;
}

/** A view state with both axes clamped: where the view springs back to when a pan ends. */
export function clampView(state, view, content) {
  return {
    zoom: state.zoom,
    panX: clampPan(state.panX, state.zoom, view.w, content.w),
    panY: clampPan(state.panY, state.zoom, view.h, content.h),
  };
}

/** The board centred in the box at `zoom` (100% by default): the starting view, and what clicking "100%" gives. */
export function centredView(view, content, zoom = 1) {
  const fitted = Math.max(zoom, coverZoom(view, content));
  return clampView(
    {
      zoom: fitted,
      panX: (view.w - content.w * fitted) / 2,
      panY: (view.h - content.h * fitted) / 2,
    },
    view,
    content,
  );
}

/**
 * Zoom by `factor` around `point` ({ x, y } inside the box), so the spot under the cursor stays still. The zoom stays
 * between coverZoom and ZOOM_MAX, and the result is clamped so only the board shows.
 */
export function zoomAt(state, factor, point, view, content) {
  const zoom = Math.min(ZOOM_MAX, Math.max(coverZoom(view, content), state.zoom * factor));
  const ratio = zoom / state.zoom;
  return clampView(
    {
      zoom,
      panX: point.x - (point.x - state.panX) * ratio,
      panY: point.y - (point.y - state.panY) * ratio,
    },
    view,
    content,
  );
}

/** A point inside the box (screen pixels) as a point on the board layer at 100%, undoing the zoom and pan. */
export const toBoard = (point, state) => ({
  x: (point.x - state.panX) / state.zoom,
  y: (point.y - state.panY) / state.zoom,
});

/** A point on the board layer at 100% as a point inside the box: where to draw things that must not scale. */
export const toScreen = (point, state) => ({
  x: state.panX + point.x * state.zoom,
  y: state.panY + point.y * state.zoom,
});
