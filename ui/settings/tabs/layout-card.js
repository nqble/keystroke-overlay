// =====================================================================================================================
//  One card of the Layout tab (docs/design/ui-design-v2.md, Layouts): a mini picture of the layout's shape, its name,
//  and its "⋯" menu (also on right-click and the Menu key): Move left, Move right, and Hide (built-in) or Delete… (your
//  own). The card itself is a button: click or Enter picks the layout, Alt+← / Alt+→ moves it, and it can be dragged
//  (layout.js does the dropping). Part of the Layout tab (layout.js).
// =====================================================================================================================
import { MenuButton } from '../blocks.js';
import { html } from '../html.js';
import { showMenu } from '../menu.js';
import { isCustom } from '../profiles.js';

const WORDS = {
  keys: (count) => `${count} keys`,
  customized: ' · customized',
  more: (name) => `More for ${name}`,
  moveLeft: 'Move left',
  moveRight: 'Move right',
  hide: 'Hide',
  remove: 'Delete…',
};

/** The layout's keys as small rectangles, scaled to fit the card (only geometry is set here; blocks.css colours them). */
export function LayoutPicture({ keys }) {
  const width = Math.max(1, ...keys.map((key) => key.x + (key.w ?? 1)));
  const height = Math.max(1, ...keys.map((key) => key.y + (key.h ?? 1)));
  return html`<svg class="layout-picture" viewBox=${`0 0 ${width} ${height}`} aria-hidden="true">
    ${keys.map(
      (key) =>
        html`<rect
          x=${key.x + 0.06}
          y=${key.y + 0.06}
          width=${(key.w ?? 1) - 0.12}
          height=${(key.h ?? 1) - 0.12}
          rx="0.12"
        />`,
    )}
  </svg>`;
}

/**
 * actions: { pick, move(step), remove } from layout.js. `place` says where the card is ('first', 'last', 'only' or
 * ''), so the menu greys out the moves that can't happen. `dragging` draws the card's spot as a faint placeholder.
 */
export function LayoutCard({ layout, selected, place, dragging, actions, drag }) {
  const items = [
    { label: WORDS.moveLeft, disabled: place === 'first' || place === 'only', run: () => actions.move(-1) },
    { label: WORDS.moveRight, disabled: place === 'last' || place === 'only', run: () => actions.move(1) },
    {
      label: layout.user ? WORDS.remove : WORDS.hide,
      danger: !!layout.user,
      disabled: place === 'only',
      run: actions.remove,
    },
  ];
  const onKeyDown = (keyEvent) => {
    if (!keyEvent.altKey || (keyEvent.key !== 'ArrowLeft' && keyEvent.key !== 'ArrowRight')) return;
    keyEvent.preventDefault();
    actions.move(keyEvent.key === 'ArrowLeft' ? -1 : 1);
  };
  const detail = WORDS.keys(layout.keys.length) + (isCustom(layout.id) ? WORDS.customized : '');
  return html`<div
    class=${dragging ? 'gallery-item layout-item dragging' : 'gallery-item layout-item'}
    data-layout-item=${layout.id}
  >
    <button
      type="button"
      class=${selected ? 'gallery-card layout-card sel' : 'gallery-card layout-card'}
      aria-pressed=${selected ? 'true' : 'false'}
      data-test="layout-card"
      data-layout-id=${layout.id}
      draggable="true"
      onClick=${actions.pick}
      onKeyDown=${onKeyDown}
      onContextMenu=${(menuEvent) => showMenu(menuEvent, items)}
      onDragStart=${(dragEvent) => drag.start(dragEvent, layout.id)}
      onDragEnd=${drag.end}
    >
      <span class="gallery-picture"><${LayoutPicture} keys=${layout.keys} /></span>
      <b class="gallery-title">${layout.name}</b>
      <span class="gallery-detail">${detail}</span>
    </button>
    <${MenuButton} label=${WORDS.more(layout.name)} items=${items} test="layout-menu" />
  </div>`;
}
