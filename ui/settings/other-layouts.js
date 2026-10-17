// =====================================================================================================================
//  "Other layouts" in the New layout popup (docs/design/ui-design-v2.md, Layouts): the built-in layouts not on the
//  Layout tab, folded away until asked for. Each card has an Add button. The popup itself is in dialogs.js; the cards'
//  picture comes from tabs/layout-card.js.
// =====================================================================================================================
import { html, useEffect, useState } from './html.js';
import { refreshFades } from './scroll-fade.js';
import { LayoutPicture } from './tabs/layout-card.js';

const WORDS = {
  heading: (count) => `Other layouts (${count})`,
  add: 'Add',
  addLabel: (name) => `Add ${name}`,
};

export function OtherLayouts({ choices, onAdd }) {
  const [open, setOpen] = useState(false);
  useEffect(refreshFades, [open]); // the list's fade needs its height, known once it shows
  if (!choices.length) return null;
  return html`<div class="other-layouts">
    <button
      type="button"
      class="section-toggle"
      aria-expanded=${open ? 'true' : 'false'}
      data-test="other-layouts-toggle"
      onClick=${() => setOpen(!open)}
    >
      <span aria-hidden="true">${open ? '▾' : '▸'}</span>
      <span>${WORDS.heading(choices.length)}</span>
    </button>
    ${
      open
        ? html`<div class="gallery other-layouts-list scroll-fade" data-test="other-layouts">
            ${choices.map(
              (layout) =>
                html`<div class="gallery-card other-layout" data-layout-id=${layout.id}>
                  <span class="gallery-picture"><${LayoutPicture} keys=${layout.keys} /></span>
                  <b class="gallery-title">${layout.name}</b>
                  <button
                    type="button"
                    aria-label=${WORDS.addLabel(layout.name)}
                    data-test="other-layout-add"
                    onClick=${() => onAdd(layout.id)}
                  >
                    ${WORDS.add}
                  </button>
                </div>`,
            )}
          </div>`
        : null
    }
  </div>`;
}
