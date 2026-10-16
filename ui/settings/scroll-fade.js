// =====================================================================================================================
//  Scroll fades: every scrolling area fades out softly at an edge that has more to scroll to, and stays sharp at an
//  edge that doesn't (docs/design/ui-design-v2.md, "Scrolling"). Give the scrolling element the class `scroll-fade`;
//  the look (a CSS mask that leaves the scrollbar unfaded) is in settings.css, section "Scroll fade" (shared by every part of the window).
//
//  Speed: one passive scroll listener for the whole window, so nothing runs while nobody scrolls (idle CPU stays at 0).
//  Content that appears without a scroll (a tab drawn, a popup opened) and a window resize repaint them once.
// =====================================================================================================================

/** The tallest the fade gets, in px. settings.css starts both fades at 0 and must not set a larger one. */
export const FADE_MAX = 28;
/** How far from an edge, in px, the fade reaches full size, so it grows in gently instead of popping in. */
export const FADE_RAMP = 40;

/** How tall the fade is at an edge `distance` px of content away (0 means at the edge: no fade). */
export function fadeAmount(distance) {
  if (distance <= 0) return 0;
  return Math.min(1, distance / FADE_RAMP) * FADE_MAX;
}

function paintFade(element) {
  const below = element.scrollHeight - element.clientHeight - element.scrollTop;
  element.style.setProperty('--fade-top', `${fadeAmount(element.scrollTop)}px`);
  element.style.setProperty('--fade-bottom', `${fadeAmount(below)}px`);
}

/** Repaint every fade, after content changed without a scroll. */
export function refreshFades() {
  document.querySelectorAll('.scroll-fade').forEach(paintFade);
}

// Scroll events don't bubble, but they can be caught on the way down, so one listener covers every area.
document.addEventListener(
  'scroll',
  (event) => {
    if (event.target instanceof Element && event.target.classList.contains('scroll-fade')) paintFade(event.target);
  },
  { capture: true, passive: true },
);
addEventListener('resize', refreshFades, { passive: true });
