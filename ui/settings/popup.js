// =====================================================================================================================
//  The shared popup: one set of rules for every popup (the general dialog, the release notes, the update popup):
//    * focus moves in when it opens, Tab stays inside, focus goes back to what opened it on close;
//    * Esc does the safe choice (close, Cancel, Later); Enter does the main (blue) button, never a red one;
//    * neither key does anything while the popup is locked (an update installing);
//    * the size rule is in settings.css (.dialog): up to 560 px wide and 80% of the window, the middle scrolls.
//  Each popup keeps its own markup and test hooks (index.html); dialogs.js, notes.js and update-popup.js build on it.
//  Design: docs/design/v2-redesign.md, Popups.
// =====================================================================================================================
import { $, el } from './helpers.js';

// ---- Keyboard focus ---------------------------------------------------------------------------------------------------
// The popups show and hide themselves by toggling `hidden`; this watches them all.
const POPUPS = ['#dlg', '#modal', '#updModal'];
const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const openers = new Map(); // popup element -> the element that had focus when it opened, and its test hook
// The popups move focus into themselves the moment they open, so "what had focus" is tracked as it changes: the last
// element focused outside every popup.
let lastFocusOutsidePopups = /** @type {HTMLElement | null} */ (null);
document.addEventListener('focusin', (focusEvent) => {
  const target = /** @type {HTMLElement} */ (focusEvent.target);
  if (!POPUPS.some((selector) => $(selector).contains(target))) lastFocusOutsidePopups = target;
});

const focusablesIn = (popup) => [...popup.querySelectorAll(FOCUSABLE)].filter((item) => item.offsetParent !== null);

const popupWatcher = new MutationObserver((records) => {
  for (const record of records) {
    const popup = /** @type {HTMLElement} */ (record.target);
    if (!popup.hidden) {
      const opener = lastFocusOutsidePopups;
      openers.set(popup, { element: opener, hook: opener?.dataset?.test });
      focusablesIn(popup)[0]?.focus();
    } else {
      const opener = openers.get(popup);
      openers.delete(popup);
      if (!opener) continue;
      // the tab behind the popup may have been redrawn meanwhile: then look for the button's twin by its test hook
      const target = document.contains(opener.element)
        ? opener.element
        : opener.hook && $(`[data-test="${opener.hook}"]`);
      target?.focus();
    }
  }
});
for (const selector of POPUPS) popupWatcher.observe($(selector), { attributes: true, attributeFilter: ['hidden'] });

addEventListener('keydown', (keyEvent) => {
  if (keyEvent.key !== 'Tab') return;
  const popup = POPUPS.map((selector) => $(selector)).find((item) => !item.hidden);
  const items = popup ? focusablesIn(popup) : [];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const outside = !popup.contains(document.activeElement);
  if (outside || (keyEvent.shiftKey && document.activeElement === first)) {
    keyEvent.preventDefault();
    (outside || !keyEvent.shiftKey ? first : last).focus();
  } else if (!keyEvent.shiftKey && document.activeElement === last) {
    keyEvent.preventDefault();
    first.focus();
  }
});

// ---- Esc and Enter -----------------------------------------------------------------------------------------------------
// What Esc does, and whether the popup is locked, for each popup that is open: { onEscape, isLocked }.
const keyRules = new Map();

/** Give an open popup its Esc action and, optionally, a lock (while true, Esc and Enter do nothing). */
export function popupKeys(selector, { onEscape, isLocked = () => false }) {
  keyRules.set(selector, { onEscape, isLocked });
}

/** The popup on screen, if any (only one is ever open). */
const openPopup = () => POPUPS.find((selector) => !$(selector).hidden);

/** True while any popup is open (the Keys tab's shortcuts stay quiet then). */
export const isPopupOpen = () => !!openPopup();

addEventListener('keydown', (keyEvent) => {
  const selector = openPopup();
  const rules = selector && keyRules.get(selector);
  if (!rules || rules.isLocked()) return;
  if (keyEvent.key === 'Escape') {
    keyEvent.preventDefault();
    rules.onEscape();
    return;
  }
  // Enter on a button already presses that button, and a text box may want Enter itself, except a one-line one.
  const target = /** @type {HTMLElement} */ (keyEvent.target);
  const ownEnter = target.tagName === 'BUTTON' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
  if (keyEvent.key !== 'Enter' || ownEnter) return;
  const main = /** @type {HTMLButtonElement | null} */ ($(`${selector} .primary`));
  if (!main || main.disabled) return;
  keyEvent.preventDefault();
  main.click();
});

/**
 * Show a dialog. buttons: [{ label, test?, primary?, danger?, run? }]. `test` is the button's test hook. If `run` returns
 * false the dialog stays open.
 */
export function dialog({ title, body, buttons }) {
  $('#dTitle').textContent = title;
  $('#dBody').replaceChildren(...body);
  const close = () => {
    $('#dlg').hidden = true;
  };
  popupKeys('#dlg', { onEscape: close });
  $('#dFoot').replaceChildren(
    ...buttons.map((buttonSpec) =>
      el('button', {
        type: 'button',
        textContent: buttonSpec.label,
        className: buttonSpec.primary ? 'primary' : buttonSpec.danger ? 'danger' : '',
        test: buttonSpec.test,
        onclick: async () => {
          if (!buttonSpec.run || (await buttonSpec.run()) !== false) close();
        },
      }),
    ),
  );
  $('#dlg').hidden = false;
  return close;
}
