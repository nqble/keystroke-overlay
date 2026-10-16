// =====================================================================================================================
//  The shared popup: keyboard focus for every popup (focus moves in, Tab stays inside, focus goes back on close) and
//  dialog(), the general-purpose popup. dialogs.js, notes.js and update-popup.js build on it.
//  Design: docs/design/v2-redesign.md, Popups.
// =====================================================================================================================
import { $, el } from './helpers.js';

// ---- Keyboard focus for popups ------------------------------------------------------------------------------------------
// Three popups (the general dialog, the release notes, the update dialog) show and hide themselves by toggling `hidden`.
// This one place gives all of them proper keyboard behaviour: when a popup opens, focus moves into it; while it is open,
// Tab and Shift+Tab stay inside it; when it closes, focus goes back to whatever opened it.
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

/**
 * Show a dialog. buttons: [{ label, test?, primary?, danger?, run? }]. `test` is the button's test hook. If `run` returns
 * false the dialog stays open.
 */
export function dialog({ title, body, buttons }) {
  $('#dTitle').textContent = title;
  $('#dBody').replaceChildren(...body);
  const close = () => {
    $('#dlg').hidden = true;
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
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
  document.addEventListener('keydown', onKey);
  return close;
}
