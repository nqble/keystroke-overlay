// =====================================================================================================================
//  The header's buttons (docs/design/ui-design-v2.md, Header): the OBS status opens General, and the Update ready
//  chip's arrow plays its download nudge. What the status says is in obs-status.js
//  (painted by messages.js); the window buttons are in windowbar.js; the chip's click is in update-popup.js.
// =====================================================================================================================
import { $ } from './helpers.js';
import { render } from './settings.js';
import { setTab } from './state.js';

// The same wait as the pause button's: a mouse that only passes over plays nothing.
const ARROW_DELAY_MS = 150;

// Clicking the status opens the place to fix it: General, where the OBS link and port live.
$('#obsStatus').onclick = () => {
  setTab('general');
  render();
};

// The arrow starts 150 ms after the mouse arrives and, once started, always plays to the end (CSS alone would stop it
// the moment the mouse leaves). Keyboard focus starts it at once. The timer exists only while the mouse is on the chip.
const chip = $('#updateBtn');
const arrow = $('.update-arrow', chip);
let arrowTimer = 0;
const dropArrow = () => arrow.classList.add('dropping');
chip.addEventListener('mouseenter', () => {
  arrowTimer = setTimeout(dropArrow, ARROW_DELAY_MS);
});
chip.addEventListener('mouseleave', () => clearTimeout(arrowTimer));
chip.addEventListener('focus', dropArrow);
arrow.addEventListener('animationend', () => arrow.classList.remove('dropping'));
