// =====================================================================================================================
//  The arrange bar: the strip of align and space-evenly buttons that floats above two or more selected keys (it does not
//  scale with the zoom). The movement maths is in tabs/keys-arrange.js.
// =====================================================================================================================
import { button, el } from '../helpers.js';
import { iconElement } from '../icons.js';
import { changed } from '../preview.js';
import { selectedKeys } from '../state.js';
import { alignPositions, boundsOf, distributePositions } from '../tabs/keys-arrange.js';
import { toScreen } from '../tabs/keys-view.js';
import { words } from '../words.js';
import { ARRANGE_GAP, UNIT, saveAt, selectedBoardBoxes } from './context.js';

const WORDS = words('editor');

// The arrange bar: [hook name, kind, which way, how many keys it needs, icon in icons.js]. The button's name and tooltip
// are WORDS.arrange[which way]. It floats above two or more selected keys.
const ARRANGE_BUTTONS = [
  ['key-align-left', 'align', 'left', 2, 'alignLeft'],
  ['key-align-center', 'align', 'center', 2, 'alignCenter'],
  ['key-align-right', 'align', 'right', 2, 'alignRight'],
  ['key-align-top', 'align', 'top', 2, 'alignTop'],
  ['key-align-middle', 'align', 'middle', 2, 'alignMiddle'],
  ['key-align-bottom', 'align', 'bottom', 2, 'alignBottom'],
  ['key-distribute-across', 'distribute', 'across', 3, 'spaceAcross'],
  ['key-distribute-down', 'distribute', 'down', 3, 'spaceDown'],
];

/** Build the bar (hidden until two keys are selected) and put it in the context. */
export function buildArrangeBar(ctx) {
  // The bar of align and space-evenly buttons that floats above two or more selected keys (it does not scale with the zoom).
  const arrangeBar = el('div', { className: 'arrange-bar', test: 'key-arrange-bar' });
  arrangeBar.hidden = true;
  arrangeBar.setAttribute('role', 'toolbar');
  arrangeBar.setAttribute('aria-label', WORDS.arrangeName);
  for (const [hook, kind, how, needed, icon] of ARRANGE_BUTTONS) {
    const name = WORDS.arrange[how];
    const arrangeButton = button('', () => arrange(ctx, String(kind), String(how)), 'arrange', String(hook));
    arrangeButton.replaceChildren(iconElement(String(icon)));
    // the name stays the same while the tooltip may say why the button is off (placeArrangeBar)
    arrangeButton.setAttribute('aria-label', name);
    arrangeButton.dataset.needed = String(needed);
    arrangeButton.dataset.tooltip = name;
    arrangeBar.append(arrangeButton);
  }
  ctx.arrangeBar = arrangeBar;
  return arrangeBar;
}

/** Save new positions ({ code: { x, y } }) for keys of this layout, then draw again. */
function applyPositions(ctx, positions) {
  for (const item of ctx.placed) {
    const position = positions[item.key.code];
    if (position) saveAt(ctx, item.key, position.x, position.y);
  }
  changed(true);
}

/** Line the selected keys up, or space them evenly. */
export function arrange(ctx, kind, how) {
  const boxes = selectedBoardBoxes(ctx);
  applyPositions(ctx, kind === 'align' ? alignPositions(boxes, how) : distributePositions(boxes, how));
}

/** Show the bar above the selected keys (below them when there is no room above), or hide it. */
export function placeArrangeBar(ctx) {
  const count = selectedKeys.size;
  ctx.arrangeBar.hidden = count < 2 || !ctx.layout || ctx.box.classList.contains('selecting');
  if (ctx.arrangeBar.hidden) return;
  for (const arrangeButton of /** @type {NodeListOf<HTMLButtonElement>} */ (
    ctx.arrangeBar.querySelectorAll('button')
  )) {
    const enough = count >= Number(arrangeButton.dataset.needed);
    arrangeButton.disabled = !enough;
    arrangeButton.title = enough ? arrangeButton.dataset.tooltip : WORDS.needMore(arrangeButton.dataset.needed);
  }
  const boxes = selectedBoardBoxes(ctx);
  if (!boxes.length) return;
  const bounds = boundsOf(boxes);
  const topLeft = toScreen({ x: bounds.minX * UNIT, y: bounds.minY * UNIT }, ctx.view);
  const bottomRight = toScreen({ x: bounds.maxX * UNIT, y: bounds.maxY * UNIT }, ctx.view);
  const height = ctx.arrangeBar.offsetHeight || 32;
  const above = topLeft.y - ARRANGE_GAP - height;
  // centered over the selection, but kept inside the box
  const half = (ctx.arrangeBar.offsetWidth || 0) / 2 + ARRANGE_GAP / 2;
  const center = Math.min(Math.max((topLeft.x + bottomRight.x) / 2, half), Math.max(half, ctx.boxSize.w - half));
  ctx.arrangeBar.style.setProperty('--bar-x', center + 'px');
  ctx.arrangeBar.style.setProperty('--bar-y', (above >= 0 ? above : bottomRight.y + ARRANGE_GAP) + 'px');
}
