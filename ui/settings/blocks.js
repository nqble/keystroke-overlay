// =====================================================================================================================
//  The shared building blocks every v2.0 screen is made of (docs/design/ui-design-v2.md, "Building blocks" and
//  "States"): a section card, a switch, a segmented choice, a gallery card, the "⋯" menu button, and notes (a short
//  note, and the technical detail Debug mode adds). Preact components
//  (docs/decisions/0013-preact-with-htm-for-the-settings-window.md); their look is in blocks.css, and every one of them can be seen in every state in the
//  UI sandbox at /__sandbox__/blocks.html. Popups are not a component: screens call dialog() in popup.js.
//
//  Each block is a real control with a name a screen reader can say, works with the keyboard, and takes a `test` hook
//  (data-test, tests/README.md). Plain logic lives outside, with tests (choice-keys.js).
// =====================================================================================================================
import { stepChoice } from './choice-keys.js';
import { html, useEffect, useLayoutEffect, useRef, useState } from './html.js';
import { Icon } from './icons.js';
import { showMenu } from './menu.js';
import { md } from './notes.js';
import { settings } from './state.js';

// How far below the "⋯" button its menu opens, in px.
const MENU_GAP = 4;
// How long a ConfirmButton waits for the second click, in ms (the same as confirmTwice in helpers.js).
const CONFIRM_WINDOW_MS = 3500;
const CONFIRM_TEXT = 'Click again to confirm';

let lastId = 0;
/** An id that stays the same for this component's life, to link a label to its control. */
export function useId(prefix) {
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
 * A small choice of two to six options (Stable | Latest), instead of a dropdown. It is one Tab stop: the arrow keys,
 * Home and End move the choice, like any radio group. choices: [{ value, text, test? }]
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
          data-test=${choice.test || null}
          onClick=${() => onChange(choice.value)}
        >
          ${choice.text}
        </button>`,
    )}
  </div>`;
}

/**
 * A card in a gallery (a layout, theme, preset or animation). Selected shows on the border only. `children` is the
 * card's picture; `note` (optional) is a small dim line under the title; `menu` (optional) adds a "⋯" button beside it, which is a separate control (a button can't hold one).
 */
export function GalleryCard({ title, note = null, selected, onSelect, menu = null, test = '', tip = null, children }) {
  const card = html`<button
    type="button"
    class=${selected ? 'gallery-card sel' : 'gallery-card'}
    aria-pressed=${selected ? 'true' : 'false'}
    title=${tip}
    data-test=${test || null}
    onClick=${onSelect}
  >
    ${children ? html`<span class="gallery-picture" aria-hidden="true">${children}</span>` : null}
    <b class="gallery-title">${title}</b>
    ${note ? html`<span class="gallery-note">${note}</span>` : null}
  </button>`;
  if (!menu) return card;
  return html`<div class="gallery-item">
    ${card}
    <${MenuButton} label=${menu.label} items=${menu.items} test=${menu.test} />
  </div>`;
}

/**
 * The "⋯" button that opens a small menu (menu.js) just below itself. items: [{ label, run?, danger?, disabled? }]. With
 * `text` it is a labeled button instead, with a small down arrow (a tab's "Reset"); `tip` is its tooltip.
 */
export function MenuButton({ label, items, test = '', text = '', tip = '' }) {
  const openMenu = (clickEvent) => {
    const box = clickEvent.currentTarget.getBoundingClientRect();
    showMenu(clickEvent, items, { x: box.left, y: box.bottom + MENU_GAP });
  };
  return html`<button
    type="button"
    class=${text ? 'menu-button with-text' : 'menu-button'}
    aria-label=${label}
    title=${tip || null}
    aria-haspopup="menu"
    data-test=${test || null}
    onClick=${openMenu}
  >
    ${text ? html`${text}<${Icon} name="chevronDown" />` : html`<${Icon} name="menu" />`}
  </button>`;
}

/** A short note under a control. **Bold** and `code` work (notes.js reads them; everything stays plain text). */
export function Note({ text, test = '' }) {
  const box = useRef(null);
  useLayoutEffect(() => box.current.replaceChildren(md(text)), [text]);
  return html`<div class="note" data-test=${test || null} ref=${box}></div>`;
}

/**
 * The technical detail beside a plain line, shown only while Debug mode is on (ui-design-v2.md, Words). Never put
 * private data in it: no link key, no key presses.
 */
export function Detail({ text }) {
  if (!settings?.general?.debugMode) return null;
  return html`<div class="detail">${text}</div>`;
}

/**
 * A red button for something that can't be undone (a new link key, say): the first click turns it into "Click again to
 * confirm" for a few seconds, and only a second click within that time does it.
 */
export function ConfirmButton({ text, onConfirm, test = '' }) {
  const [asking, setAsking] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const click = () => {
    clearTimeout(timer.current);
    if (asking) {
      setAsking(false);
      onConfirm();
      return;
    }
    setAsking(true);
    timer.current = setTimeout(() => setAsking(false), CONFIRM_WINDOW_MS);
  };
  return html`<button type="button" class="danger" data-test=${test || null} onClick=${click}>
    ${asking ? CONFIRM_TEXT : text}
  </button>`;
}
