// =====================================================================================================================
//  Showing and hiding the whole window. index.html keeps the page invisible (same dark color as the window, so nothing
//  flashes) until the window is fully drawn; then `reveal()` fades it in. A language change fades it out first
//  (`hideWindow`), then loads it again, so the reload is one dark moment instead of a page building itself in view.
// =====================================================================================================================

/** Fade the window in. Safe to call more than once. */
export function reveal() {
  document.documentElement.setAttribute('data-ready', '');
}

/** Fade the window out and resolve when it is gone (a little longer than the 160 ms fade in index.html). */
export function hideWindow() {
  document.documentElement.removeAttribute('data-ready');
  return new Promise((done) => setTimeout(done, 180));
}
