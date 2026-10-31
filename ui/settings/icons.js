// =====================================================================================================================
//  The settings window's small icons, drawn as shapes in a 16 x 16 box so they sit exactly in the middle of their
//  button on every system. Text characters (⏸ ▶ ✕ ⋯ ↓) were drawn by each system's own font, and Windows' emoji font
//  put some of them off center. An icon takes the text color (currentColor) and is sized by CSS (.icon in blocks.css).
//  Add an icon to SHAPES; use <${Icon} name="…" /> in Preact screens, iconElement('…') in plain-DOM code.
//  The window buttons (minimize, maximize, close) are drawn in index.html the same way.
// =====================================================================================================================
import { html } from './html.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Each icon: `line` paths are stroked, `fill` paths are filled. All centered on (8, 8).
const SHAPES = {
  pause: { line: 'M5.5 3.5v9M10.5 3.5v9' },
  play: { fill: 'M5 3.25 12.5 8 5 12.75z' }, // its box is centered; a triangle centered by its box looks centered
  close: { line: 'M4 4l8 8M12 4l-8 8' },
  menu: {
    fill: 'M2.25 8a1.25 1.25 0 1 0 2.5 0 1.25 1.25 0 1 0-2.5 0M6.75 8a1.25 1.25 0 1 0 2.5 0 1.25 1.25 0 1 0-2.5 0M11.25 8a1.25 1.25 0 1 0 2.5 0 1.25 1.25 0 1 0-2.5 0',
  },
  minus: { line: 'M3.5 8h9' },
  plus: { line: 'M3.5 8h9M8 3.5v9' },
  arrowDown: { line: 'M8 2.5v11M3.5 9 8 13.5 12.5 9' },
  chevronDown: { line: 'M3.5 6 8 10.5 12.5 6' }, // turned with CSS for "closed" (.chevron-closed)
};

/** One icon, for Preact screens. Hidden from screen readers: its button carries the name. */
export function Icon({ name }) {
  const shape = SHAPES[name];
  return html`<svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
    ${shape.line ? html`<path class="icon-line" d=${shape.line} />` : null}
    ${shape.fill ? html`<path class="icon-fill" d=${shape.fill} />` : null}
  </svg>`;
}

/** The same icon as a plain element, for code that builds the page without Preact (the key editor). */
export function iconElement(name) {
  const shape = SHAPES[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  for (const [kind, data] of Object.entries(shape)) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', kind === 'line' ? 'icon-line' : 'icon-fill');
    path.setAttribute('d', data);
    svg.append(path);
  }
  return svg;
}
