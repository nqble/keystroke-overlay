// =====================================================================================================================
//  The shared building blocks every v2.0 screen is made of (docs/design/ui-design-v2.md, "Building blocks" and
//  "States"): a section card, a switch, a segmented choice, a gallery card and the "⋯" menu button. Preact components
//  (docs/proposals/v2-preact.md); their look is in blocks.css, and every one of them can be seen in every state in the
//  UI sandbox at /__sandbox__/blocks.html. Popups are not a component: screens call dialog() in popup.js.
//
//  Each block is a real control with a name a screen reader can say, works with the keyboard, and takes a `test` hook
//  (data-test, tests/README.md). Plain logic lives outside, with tests (choice-keys.js).
// =====================================================================================================================
import { stepChoice } from './choice-keys.js';
import { html, useRef, useState } from './html.js';
import { showMenu } from './menu.js';

// How far below the "⋯" button its menu opens, in px.
const MENU_GAP = 4;

let lastId = 0;
/** An id that stays the same for this component's life, to link a label to its control. */
function useId(prefix) {
  const [id] = useState(() => `${prefix}-${++lastId}`);
  return id;
}

/** A short section title and its controls (one card of a tab). */
export function Section({ title, test = '', children }) {
  const titleId = useId('section');
  return html`<section class="section-card" aria-labelledby=${titleId} data-test=${test || null}>
    <h3 id=${titleId} class="section-title">${title}</h3>
    ${children}
  </section>`;
}

/** An on/off switch with its label; clicking the label flips it too. */
export function Switch({ label, checked, onChange, test = '' }) {
  const switchId = useId('switch');
  return html`<div class="switch-row">
    <label for=${switchId} class="switch-label">${label}</label>
    <button
      id=${switchId}
      class="switch"
      type="button"
      role="switch"
      aria-checked=${checked ? 'true' : 'false'}
      data-test=${test || null}
      onClick=${() => onChange(!checked)}
    ></button>
  </div>`;
}

/**
 * A small choice of two to five options (Stable | Latest), instead of a dropdown. It is one Tab stop: the arrow keys,
 * Home and End move the choice, like any radio group. choices: [{ value, text }]
 */
export function Segmented({ label, choices, value, onChange, test = '' }) {
  const group = useRef(null);
  const chosen = Math.max(
    0,
    choices.findIndex((choice) => choice.value === value),
  );
  const onKeyDown = (keyEvent) => {
    const next = stepChoice(choices.length, chosen, keyEvent.key);
    if (next === null) return;
    keyEvent.preventDefault();
    onChange(choices[next].value);
    group.current.querySelectorAll('[role="radio"]')[next].focus();
  };
  return html`<div
    class="segmented"
    role="radiogroup"
    aria-label=${label}
    data-test=${test || null}
    ref=${group}
    onKeyDown=${onKeyDown}
  >
    ${choices.map(
      (choice, index) =>
        html`<button
          type="button"
          role="radio"
          aria-checked=${index === chosen ? 'true' : 'false'}
          tabindex=${index === chosen ? 0 : -1}
          onClick=${() => onChange(choice.value)}
        >
          ${choice.text}
        </button>`,
    )}
  </div>`;
}

/**
 * A card in a gallery (a layout, theme, preset or animation). Selected shows on the border only. `children` is the
 * card's picture; `menu` (optional) adds a "⋯" button beside it, which is a separate control (a button can't hold one).
 */
export function GalleryCard({ title, detail = '', selected, onSelect, menu = null, test = '', children }) {
  const card = html`<button
    type="button"
    class=${selected ? 'gallery-card sel' : 'gallery-card'}
    aria-pressed=${selected ? 'true' : 'false'}
    data-test=${test || null}
    onClick=${onSelect}
  >
    ${children ? html`<span class="gallery-picture" aria-hidden="true">${children}</span>` : null}
    <b class="gallery-title">${title}</b>
    ${detail ? html`<span class="gallery-detail">${detail}</span>` : null}
  </button>`;
  if (!menu) return card;
  return html`<div class="gallery-item">
    ${card}
    <${MenuButton} label=${menu.label} items=${menu.items} test=${menu.test} />
  </div>`;
}

/** The "⋯" button that opens a small menu (menu.js) just below itself. items: [{ label, run?, danger?, disabled? }] */
export function MenuButton({ label, items, test = '' }) {
  const openMenu = (clickEvent) => {
    const box = clickEvent.currentTarget.getBoundingClientRect();
    showMenu(clickEvent, items, { x: box.left, y: box.bottom + MENU_GAP });
  };
  return html`<button
    type="button"
    class="menu-button"
    aria-label=${label}
    aria-haspopup="menu"
    data-test=${test || null}
    onClick=${openMenu}
  >
    ⋯
  </button>`;
}
