// =====================================================================================================================
//  Showing and hiding the whole window. index.html keeps the page invisible (same dark color as the window, so nothing
//  flashes) until the window is fully drawn; then `reveal()` fades it in. A language change fades it out first
//  (`hideWindow`), then loads it again, so the reload is one dark moment instead of a page building itself in view.
// =====================================================================================================================

/** How long the fade takes. Must equal the `transition` on `body` in index.html (CSS can't read this constant). */
export const FADE_MS = 160;
/** After the fade-out, a little more, so the old page is fully gone before the reload. Must stay longer than FADE_MS. */
const HIDE_WAIT_MS = FADE_MS + 20;
/** The longest the window waits for the live preview to report ready before it is shown anyway. */
export const PREVIEW_WAIT_MS = 1500;
/** After the preview reports ready, a moment for it to draw its keys from the first settings it is sent. */
export const PREVIEW_DRAW_MS = 80;
/** If nothing has shown the window by now (an error, a stuck start), show it: it must never stay blank. */
export const SHOW_ANYWAY_MS = 4000;

/**
 * Fade the window in. Safe to call more than once. `window.__uiShown` marks the moment (same clock as `__uiReady`,
 * set when the first screen is drawn) at which the person can see the window, for the start-up numbers.
 */
export function reveal() {
  window.__uiShown ??= performance.timeOrigin + performance.now();
  document.documentElement.setAttribute('data-ready', '');
}

/** Fade the window out and resolve when it is gone. */
export function hideWindow() {
  document.documentElement.removeAttribute('data-ready');
  return new Promise((done) => setTimeout(done, HIDE_WAIT_MS));
}
