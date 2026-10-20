// =====================================================================================================================
//  The Built-in choice of the New layout popup (docs/design/ui-design-v2.md, Layouts): the built-in layouts not on the
//  Layout tab, each with an Add button. The popup itself is in dialogs.js; the cards' picture comes from
//  tabs/layout-card.js.
// =====================================================================================================================
import { html, useEffect } from './html.js';
import { refreshFades } from './scroll-fade.js';
import { LayoutPicture } from './tabs/layout-card.js';

const WORDS = {
  add: 'Add',
  addLabel: (name) => `Add ${name}`,
};

export function OtherLayouts({ choices, onAdd }) {
  useEffect(refreshFades, []); // the list's fade needs its height, known once it shows
  return html`<div class="gallery other-layouts-list scroll-fade" data-test="other-layouts">
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
  </div>`;
}
