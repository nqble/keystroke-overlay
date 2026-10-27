// =====================================================================================================================
//  The key editor's board (docs/design/key-editor.md §3 and §4): draws every key of the layout on a fixed board, lets you
//  select keys (click, Ctrl- or Shift-click, or drag a box), drag them, and zoom and pan the view.
//
//  It is built ONCE (getEditor) and kept alive: leaving the Keys tab only takes its element off the page, so the zoom, the
//  pan and the key elements are still there when you come back. keys.js calls update() after every change; update() only
//  touches the keys whose place or look changed. The page never sets a style here except CSS variables (--x, --y, --w,
//  --h on a key; --zoom, --pan-x, --pan-y on the board): all looks are in settings.css.
//
//  This file builds the board and draws the keys. The gestures are in their own files next to it, each taking the shared
//  `ctx` (context.js): view.js (zoom and pan), drag.js (moving keys), resize.js (the handles), marquee.js (selecting with a
//  box) and arrange-bar.js (align and space evenly). The geometry (board size, clamping, zoom and pan limits) is in
//  tabs/keys-board.js and tabs/keys-view.js, the group moves in tabs/keys-arrange.js; they are plain maths with their own
//  unit tests.
// =====================================================================================================================
import { el } from '../helpers.js';
import { gridShown, round2, showHiddenKeys } from '../profiles.js';
import { render } from '../settings.js';
import { selectedKeys, setSelectedKeys } from '../state.js';
import { TEXT } from '../text.js';
import { boardFrame, overlappingCodes } from '../tabs/keys-board.js';
import { buildArrangeBar, placeArrangeBar } from './arrange-bar.js';
import { isAdditive } from './context.js';
import { dragKeys } from './drag.js';
import { startMarquee } from './marquee.js';
import { updateHandles } from './resize.js';
import { coveredBox, layoutBoxesFor, placeKeys, turnedBox } from './places.js';
import { bindViewGestures, buildZoomControls, firstView, refit, setView } from './view.js';

let editor = null;

/** The one editor (made the first time it is asked for). */
export const getEditor = () => (editor ??= createEditor());

function createEditor() {
  /** @type {import('./context.js').EditorContext} */
  const ctx = {
    nodes: new Map(),
    view: { zoom: 1, panX: 0, panY: 0 },
    board: { w: 24, h: 12 },
    frame: { w: 24, h: 12, originX: 0, originY: 0 },
    layoutPlaces: [],
    boxSize: { w: 0, h: 0 },
    shownFor: '',
    needsFirstView: true,
    viewTouched: false,
    placed: [],
    profile: null,
    layout: null,
    justDragged: false,
    handles: null,
    canvas: el('div', { className: 'keymap-canvas', test: 'keymap-canvas' }),
    box: null,
    arrangeBar: null,
    zoomLabel: null,
  };
  const zoomControls = buildZoomControls(ctx);
  const arrangeBar = buildArrangeBar(ctx);
  const box = el(
    'div',
    { className: 'keymap', title: TEXT.keyPictureHelp, test: 'keymap' },
    ctx.canvas,
    arrangeBar,
    zoomControls,
  );
  box.setAttribute('role', 'group');
  ctx.box = box;
  bindViewGestures(ctx);

  // A press on the empty board (a key stops its own presses) starts drawing a selection box.
  box.onpointerdown = (pointerEvent) => {
    if (pointerEvent.target.closest?.('.zoom-controls, .arrange-bar')) return;
    startMarquee(ctx, pointerEvent);
  };

  return {
    element: box,
    update: (nextLayout, nextProfile) => update(ctx, nextLayout, nextProfile),
    focusKey: (code) => ctx.nodes.get(code)?.focus(),
  };
}

// ---- Keys ---------------------------------------------------------------------------------------------------------
function makeKey(ctx, item) {
  const { key } = item;
  const node = el('div', { className: 'kmk', test: 'key-cell' });
  node.dataset.code = key.code;
  node.tabIndex = 0;
  node.setAttribute('role', 'button');
  node.onclick = (clickEvent) => {
    if (ctx.justDragged) return;
    chooseKey(ctx, key.code, isAdditive(clickEvent));
    render();
  };
  // Enter or Space on a focused key selects it (with Ctrl or Shift: adds it), so the board works without a mouse.
  node.onkeydown = async (keyEvent) => {
    if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return;
    keyEvent.preventDefault();
    chooseKey(ctx, key.code, isAdditive(keyEvent));
    await render();
    ctx.nodes.get(key.code)?.focus(); // the page was drawn again: put the focus back on the key
  };
  node.onpointerdown = (pointerEvent) => {
    if (pointerEvent.button !== 0) return;
    pointerEvent.stopPropagation(); // do not also start a selection box
    dragKeys(ctx, pointerEvent, node, key);
  };
  return node;
}

/** Put one key's element in step with its place, look and state. */
function paintKey(ctx, node, item, { hidden, clash }) {
  const { key } = item;
  node.style.setProperty('--x', String(item.x));
  node.style.setProperty('--y', String(item.y));
  node.style.setProperty('--w', String(item.w));
  node.style.setProperty('--h', String(item.h));
  node.style.setProperty('--r', `${item.r ?? 0}deg`); // a turned key (tabs.css turns it around its center)
  const label = ctx.profile.labels[key.code] ?? key.label;
  if (node.textContent !== (label ?? '')) node.textContent = label ?? '';
  node.title = key.code;
  node.hidden = !showHiddenKeys() && hidden.has(key.code); // the Hidden keys switch is off
  node.classList.toggle('off', hidden.has(key.code));
  node.classList.toggle('sel', selectedKeys.has(key.code));
  node.classList.toggle('clash', clash.has(key.code));
  const state = [hidden.has(key.code) ? 'hidden' : 'shown', selectedKeys.has(key.code) ? 'selected' : null];
  node.setAttribute('aria-pressed', String(selectedKeys.has(key.code)));
  node.setAttribute('aria-label', `${key.code}${label ? ', label ' + label : ''}, ${state.filter(Boolean).join(', ')}`);
}

/** Make a key the selection, or add it to / remove it from the selection when `additive`. */
function chooseKey(ctx, code, additive) {
  if (!additive) return setSelectedKeys([code]);
  const next = new Set(selectedKeys);
  if (next.has(code)) next.delete(code);
  else next.add(code);
  setSelectedKeys(next);
}

/**
 * Show a layout and its edits. Only the keys that changed are touched; the key elements are made again only when the
 * layout, or its layout style, is a different one.
 */
function update(ctx, nextLayout, nextProfile) {
  ctx.layout = nextLayout;
  ctx.profile = nextProfile;
  const savedPlaces = placeKeys(ctx.layout, ctx.profile);
  ctx.layoutPlaces = layoutBoxesFor(ctx.layout, ctx.profile);
  ctx.frame = boardFrame(ctx.layoutPlaces, savedPlaces.map(coveredBox)); // turned keys cover more of the board
  ctx.board = { w: ctx.frame.w, h: ctx.frame.h };
  // everything below works in board places: the saved place plus the origin (the layout sits in the middle of the board)
  ctx.placed = savedPlaces.map((item) => ({
    ...item,
    x: round2(item.x + ctx.frame.originX),
    y: round2(item.y + ctx.frame.originY),
  }));
  const placedBoxes = ctx.placed.map(turnedBox); // the overlap warning uses a turned key's real shape
  ctx.canvas.style.setProperty('--board-w', String(ctx.board.w));
  ctx.canvas.style.setProperty('--board-h', String(ctx.board.h));
  ctx.box.style.setProperty('--board-w', String(ctx.board.w));
  ctx.box.style.setProperty('--board-h', String(ctx.board.h));
  ctx.canvas.dataset.boardW = String(ctx.board.w);
  ctx.canvas.dataset.boardH = String(ctx.board.h);
  ctx.canvas.dataset.originX = String(ctx.frame.originX);
  ctx.canvas.dataset.originY = String(ctx.frame.originY);
  ctx.box.setAttribute('aria-label', `Keyboard layout ${ctx.layout.name}`);

  const key = `${ctx.layout.id}:${ctx.profile.layoutStyle}`;
  if (key !== ctx.shownFor) {
    // Another layout starts with its own first view. A layout-style switch (or its Undo) only redraws the keys: the
    // view stays where the person left it.
    if (!ctx.shownFor.startsWith(`${ctx.layout.id}:`)) {
      ctx.needsFirstView = true;
      ctx.viewTouched = false;
    }
    ctx.shownFor = key;
    ctx.nodes.clear();
    ctx.handles = null;
    ctx.canvas.replaceChildren();
  }
  const hidden = new Set(ctx.profile.disabledKeys);
  const clash = overlappingCodes(placedBoxes.filter((boxOf) => !hidden.has(boxOf.code)));
  const present = new Set();
  for (const item of ctx.placed) {
    present.add(item.key.code);
    let node = ctx.nodes.get(item.key.code);
    if (!node) {
      node = makeKey(ctx, item);
      ctx.nodes.set(item.key.code, node);
      ctx.canvas.append(node);
    }
    paintKey(ctx, node, item, { hidden, clash });
  }
  for (const [code, node] of ctx.nodes)
    if (!present.has(code)) {
      node.remove();
      ctx.nodes.delete(code);
    }
  ctx.canvas.classList.toggle('grid-dots', gridShown());
  updateHandles(ctx, hidden);
  placeArrangeBar(ctx);
  if (ctx.box.clientWidth && ctx.box.clientHeight) {
    ctx.boxSize = { w: ctx.box.clientWidth, h: ctx.box.clientHeight };
    // An edit never moves the view; only a new layout gets a first view (the box settling into the page is view.js's job)
    if (ctx.needsFirstView) firstView(ctx);
    else refit(ctx);
  } else setView(ctx, ctx.view); // keep the dots in step with the snap choice while off the page
}
