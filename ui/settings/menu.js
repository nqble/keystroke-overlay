// =====================================================================================================================
//  Our own small menu (the layout cards' menu), and the window-wide rules that go with it: the browser's own
//  right-click menu never appears, and nothing in this window can be dragged away.
// =====================================================================================================================
import { el } from './helpers.js';

let menuEl = null;

let menuOpener = /** @type {HTMLElement | null} */ (null); // what had focus when the menu opened

export function hideMenu() {
  menuEl?.remove();
  menuEl = null;
  // keyboard users get their place back (a mouse user's menu opener is usually not focused, so nothing visibly changes)
  if (menuOpener && document.contains(menuOpener)) menuOpener.focus();
  menuOpener = null;
}

/**
 * Show a small menu at the mouse, or at `at` (a "⋯" button opens it just below itself, also for the keyboard, where a
 * click has no mouse position). items: [{ label, run?, danger?, disabled? }]
 */
export function showMenu(event, items, at = { x: event.clientX, y: event.clientY }) {
  event.preventDefault();
  event.stopPropagation();
  hideMenu();
  menuOpener = /** @type {HTMLElement | null} */ (document.activeElement);
  menuEl = el(
    'div',
    { className: 'ctxmenu', test: 'context-menu' },
    items.map((item) =>
      el('button', {
        test: 'context-menu-item',
        type: 'button',
        textContent: item.label,
        className: item.danger ? 'danger' : '',
        disabled: !!item.disabled,
        onclick: () => {
          hideMenu();
          item.run?.();
        },
      }),
    ),
  );
  document.body.append(menuEl);
  const box = menuEl.getBoundingClientRect(); // keep the menu fully inside the window
  menuEl.style.left = Math.max(4, Math.min(at.x, innerWidth - box.width - 4)) + 'px';
  menuEl.style.top = Math.max(4, Math.min(at.y, innerHeight - box.height - 4)) + 'px';
  /** @type {HTMLElement | null} */ (menuEl.querySelector('button:not(:disabled)'))?.focus();
}

// Up and Down arrows move between the menu's items
addEventListener('keydown', (keyEvent) => {
  if (!menuEl || (keyEvent.key !== 'ArrowDown' && keyEvent.key !== 'ArrowUp')) return;
  const items = /** @type {HTMLElement[]} */ ([...menuEl.querySelectorAll('button:not(:disabled)')]);
  if (!items.length) return;
  keyEvent.preventDefault();
  const step = keyEvent.key === 'ArrowDown' ? 1 : -1;
  items[
    (items.indexOf(/** @type {HTMLElement} */ (document.activeElement)) + step + items.length) % items.length
  ].focus();
});

// layout cards call showMenu first, which stops this
addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener(
  'mousedown',
  (e) => {
    if (menuEl && !menuEl.contains(e.target)) hideMenu();
  },
  true,
);

addEventListener('blur', hideMenu);

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideMenu();
});

// nothing in this window can be dragged away
addEventListener('dragstart', (e) => e.preventDefault());
