// =====================================================================================================================
//  The window's own minimize / maximize / close buttons (there is no native title bar).
// =====================================================================================================================
import { $ } from './helpers.js';
import { words } from './words.js';

const WORDS = words('windowbar');

// ---- The window buttons. The window has no native title bar, so the page draws minimize / maximize / close itself.
// Dragging the header (and double-clicking it to maximize) is handled by the data-tauri-drag-region attribute in
// index.html.
const appWin = window.__TAURI__.window.getCurrentWindow();

/** A button's tooltip and the name a screen reader says (index.html has the English ones until this runs). */
const name = (button, word) => {
  button.title = button.ariaLabel = word;
};
name($('#wMin'), WORDS.minimize);
name($('#wClose'), WORDS.close);

$('#wMin').onclick = () => appWin.minimize();

$('#wMax').onclick = () => appWin.toggleMaximize();

$('#wClose').onclick = () => appWin.close();

/** Show the "restore" icon while the window is maximized, the "maximize" icon otherwise (both drawn in index.html). */
async function paintMaxButton() {
  const max = await appWin.isMaximized().catch(() => false);
  const maxButton = $('#wMax');
  maxButton.classList.toggle('maximized', max);
  name(maxButton, max ? WORDS.restore : WORDS.maximize);
}

appWin.onResized(paintMaxButton);
paintMaxButton();

// A popup's dimmed backdrop starts under the header, so the header stays usable (popups.css reads this).
const header = document.querySelector('header');
const keepHeaderHeight = () =>
  document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
new ResizeObserver(keepHeaderHeight).observe(header);
keepHeaderHeight();
