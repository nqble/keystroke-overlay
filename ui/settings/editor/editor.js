// =====================================================================================================================
//  The key editor's board (docs/design/key-editor.md §3 and §4): draws every key of the layout on a fixed board, lets you
//  select keys (click, Ctrl- or Shift-click, or drag a box), drag them, and zoom and pan the view.
//
//  It is built ONCE (getEditor) and kept alive: leaving the Keys tab only takes its element off the page, so the zoom, the
//  pan and the key elements are still there when you come back. keys.js calls update() after every change; update() only
//  touches the keys whose place or look changed. The page never sets a style here except CSS variables (--x, --y, --w,
//  --h on a key; --zoom, --pan-x, --pan-y on the board): all looks are in settings.css.
//
//  The geometry (board size, clamping, zoom and pan limits) is in tabs/keys-board.js and tabs/keys-view.js, the group
//  moves in tabs/keys-arrange.js; they are plain maths with their own unit tests.
// =====================================================================================================================
import { button, el } from '../helpers.js';
import { changed, push } from '../preview.js';
import {
  baseHeight,
  baseWidth,
  gridShown,
  round2,
  setKeyHeight,
  setKeyPos,
  setKeyWidth,
  showHiddenKeys,
  snap,
  snapStep,
} from '../profiles.js';
import { render } from '../settings.js';
import { selectedKeys, setSelectedKeys } from '../state.js';
import { TEXT } from '../text.js';
import { alignPositions, boundsOf, clampMove, distributePositions, movedPositions } from '../tabs/keys-arrange.js';
import { boardArea, boardFrame, overlappingCodes, resizeBox } from '../tabs/keys-board.js';
import { snapToGuides } from '../tabs/keys-guides.js';
import {
  BUTTON_ZOOM,
  ZOOM_MAX,
  centredView,
  clampView,
  coverZoom,
  stretchPan,
  toBoard,
  toScreen,
  wheelFactor,
  zoomAt,
} from '../tabs/keys-view.js';
import { layoutBoxesFor, placeKeys } from './places.js';

const UNIT = 40; // pixels per key at 100% zoom (keep in step with --unit in settings.css)
const KEY_GAP = 3; // pixels between neighboring keys at 100% zoom (keep in step with the .kmk size in settings.css)
const DRAG_START_DISTANCE = 3; // pixels the pointer must move before a press counts as a drag, not a click
const MIN_DOT_SPACING = 6; // pixels: grid dots closer together than this are thinned out so the grid stays readable
const MIDDLE_BUTTON = 1;
const OVERSCAN = 120; // pixels of empty room that may show beyond the board's edge (so the keys can sit in the middle)
const FIRST_VIEW_PADDING = 28; // pixels of space between the keyboard and the editor box in the first view
const FIRST_VIEW_BOTTOM = 44; // extra room kept under the keyboard for the zoom buttons
const ARRANGE_GAP = 10; // pixels between the arrange bar and the selected keys

// The arrange bar: [hook name, label, tooltip, kind, how many keys it needs]. It floats above two or more selected keys.
const ARRANGE_BUTTONS = [
  ['key-align-left', 'Left', 'Line the keys up along their left edge', 'align', 'left', 2],
  ['key-align-center', 'Center', 'Line the keys up along their vertical middle', 'align', 'center', 2],
  ['key-align-right', 'Right', 'Line the keys up along their right edge', 'align', 'right', 2],
  ['key-align-top', 'Top', 'Line the keys up along their top edge', 'align', 'top', 2],
  ['key-align-middle', 'Middle', 'Line the keys up along their horizontal middle', 'align', 'middle', 2],
  ['key-align-bottom', 'Bottom', 'Line the keys up along their bottom edge', 'align', 'bottom', 2],
  ['key-distribute-across', 'Across', 'Make the gaps between the keys equal, left to right', 'distribute', 'across', 3],
  ['key-distribute-down', 'Down', 'Make the gaps between the keys equal, top to bottom', 'distribute', 'down', 3],
];

/** True when Ctrl, Shift or Cmd is held: clicking then adds a key to the selection or removes it. */
const isAdditive = (pointerEvent) => pointerEvent.ctrlKey || pointerEvent.shiftKey || pointerEvent.metaKey;

let editor = null;

/** The one editor (made the first time it is asked for). */
export const getEditor = () => (editor ??= createEditor());

function createEditor() {
  /** @type {Map<string, HTMLElement>} */
  const nodes = new Map(); // key code -> its element
  let view = { zoom: 1, panX: 0, panY: 0 };
  let board = { w: 24, h: 12 };
  let frame = { w: 24, h: 12, originX: 0, originY: 0 }; // the board and where the layout's own origin sits on it (in keys)
  let layoutPlaces = []; // the layout style's own places before any edit, in saved places: [{ code, x, y, w, h }]
  let boxSize = { w: 0, h: 0 }; // the editor box in pixels (0 while it is not on the page)
  let shownFor = ''; // layout id and style the key elements were made for
  let needsFirstView = true;
  let viewTouched = false; // true once the user zoomed or panned: the view is theirs from then on
  let placed = []; // [{ key, x, y, w, h }] as of the last update
  let profile = null;
  let layout = null;
  let justDragged = false; // true right after a drag, so the click that follows does not also change the selection
  let handles = null; // the two resize handles of the selected key, when there are any

  const canvas = el('div', { className: 'keymap-canvas', test: 'keymap-canvas' });
  const zoomLabel = button(
    '100%',
    () => {
      viewTouched = true;
      setView(centredView(boxSize, content(), 1, OVERSCAN));
    },
    'zoom-percent',
    'editor-zoom-reset',
  );
  zoomLabel.title = 'Zoom to 100% and center the board';
  const zoomBy = (factor) => () => {
    viewTouched = true;
    setView(zoomAt(view, factor, { x: boxSize.w / 2, y: boxSize.h / 2 }, boxSize, content(), OVERSCAN));
  };
  const zoomOut = button('−', zoomBy(1 / BUTTON_ZOOM), 'zoom-step', 'editor-zoom-out');
  zoomOut.title = 'Zoom out';
  const zoomIn = button('+', zoomBy(BUTTON_ZOOM), 'zoom-step', 'editor-zoom-in');
  zoomIn.title = 'Zoom in';
  const zoomControls = el('div', { className: 'zoom-controls' }, zoomOut, zoomLabel, zoomIn);
  // The bar of align and space-evenly buttons that floats above two or more selected keys (it does not scale with the zoom).
  const arrangeBar = el('div', { className: 'arrange-bar', test: 'key-arrange-bar' });
  arrangeBar.hidden = true;
  arrangeBar.setAttribute('role', 'toolbar');
  arrangeBar.setAttribute('aria-label', 'Arrange the selected keys');
  for (const [hook, label, tooltip, kind, how, needed] of ARRANGE_BUTTONS) {
    const arrangeButton = button(String(label), () => arrange(String(kind), String(how)), 'arrange', String(hook));
    arrangeButton.dataset.needed = String(needed);
    arrangeButton.dataset.tooltip = String(tooltip);
    arrangeBar.append(arrangeButton);
  }
  const box = el(
    'div',
    { className: 'keymap', title: TEXT.keyPictureHelp, test: 'keymap' },
    canvas,
    arrangeBar,
    zoomControls,
  );
  box.setAttribute('role', 'group');

  const content = () => ({ w: board.w * UNIT, h: board.h * UNIT });

  /** Save a key's place, given as a board place (the board is centered on the layout, so a saved place is the board place minus the origin). */
  const saveAt = (key, x, y) => setKeyPos(key, x - frame.originX, y - frame.originY);

  /** The selected keys as boxes in board places: [{ code, x, y, w, h }]. */
  const selectedBoardBoxes = () =>
    placed
      .filter((item) => selectedKeys.has(item.key.code))
      .map((item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h }));

  /** The area the first view shows: the keys that are drawn (the whole layout while hidden keys are shown), in board places. */
  function shownBounds() {
    const hidden = new Set(profile.disabledKeys);
    const drawn = placed.filter((item) => !hidden.has(item.key.code));
    const boxes =
      showHiddenKeys() || !drawn.length
        ? layoutPlaces.map((place) => ({ ...place, x: place.x + frame.originX, y: place.y + frame.originY }))
        : drawn.map((item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h }));
    return boundsOf(boxes);
  }

  // ---- The view: zoom and pan ---------------------------------------------------------------------------------------
  /** Show the board at `next` (a { zoom, panX, panY } view state). */
  function setView(next) {
    view = next;
    canvas.style.setProperty('--zoom', String(view.zoom));
    canvas.style.setProperty('--pan-x', view.panX + 'px');
    canvas.style.setProperty('--pan-y', view.panY + 'px');
    zoomLabel.textContent = Math.round(view.zoom * 100) + '%';
    placeArrangeBar();
    // grid dots every half key (every whole key in the Even grid), whatever the Snap switch says, thinned out (every 2nd, 4th,
    // ...) when they would be closer than MIN_DOT_SPACING on screen
    const dotStep = profile?.layoutStyle === 'grid' ? 1 : 0.5;
    const spacing = dotStep * UNIT * view.zoom;
    let every = 1;
    while (spacing * every < MIN_DOT_SPACING) every *= 2;
    canvas.style.setProperty('--dot-spacing', dotStep * UNIT * every + 'px');
  }

  /** Keep the view legal after the box or the board changed size. */
  function refit() {
    if (!boxSize.w) return;
    const zoom = Math.max(view.zoom, coverZoom(boxSize, content()));
    setView(clampView({ ...view, zoom: Math.min(ZOOM_MAX, zoom) }, boxSize, content(), OVERSCAN));
  }

  /** The first view of a layout: its keys centered in the box, as large as fits (never more than 100%). */
  function firstView() {
    // The keyboard goes in the middle of the box with FIRST_VIEW_PADDING of space around it, and the zoom buttons get their own
    // strip underneath (FIRST_VIEW_BOTTOM), so nothing sits on top of the keys.
    const shown = shownBounds();
    const spanX = shown.maxX - shown.minX;
    const spanY = shown.maxY - shown.minY;
    const availableW = boxSize.w - FIRST_VIEW_PADDING * 2;
    const availableH = boxSize.h - FIRST_VIEW_PADDING * 2 - FIRST_VIEW_BOTTOM;
    const fit = Math.min(1, availableW / (spanX * UNIT), availableH / (spanY * UNIT));
    const zoom = Math.min(ZOOM_MAX, Math.max(fit, coverZoom(boxSize, content())));
    const panX = FIRST_VIEW_PADDING + (availableW - spanX * UNIT * zoom) / 2 - shown.minX * UNIT * zoom;
    const panY = FIRST_VIEW_PADDING + (availableH - spanY * UNIT * zoom) / 2 - shown.minY * UNIT * zoom;
    box.classList.add('instant'); // no sliding into the first view
    setView(clampView({ zoom, panX, panY }, boxSize, content(), OVERSCAN));
    requestAnimationFrame(() => box.classList.remove('instant'));
    needsFirstView = false;
  }

  // The box is measured while it is on the page; leaving the Keys tab and coming back keeps zoom and pan.
  new ResizeObserver(() => {
    const width = box.clientWidth,
      height = box.clientHeight;
    if (!width || !height) return; // off the page: keep the view as it was
    boxSize = { w: width, h: height };
    // until the user zooms or pans, the first view follows the box (it may still be settling into the page layout)
    if ((needsFirstView || !viewTouched) && layout) firstView();
    else refit();
  }).observe(box);

  box.addEventListener(
    'wheel',
    (wheelEvent) => {
      wheelEvent.preventDefault(); // zoom the board, not the window (this listener is not passive on purpose)
      viewTouched = true;
      setView(zoomAt(view, wheelFactor(wheelEvent.deltaY), insideBox(wheelEvent), boxSize, content(), OVERSCAN));
    },
    { passive: false },
  );

  // Middle button + drag pans the view from anywhere in the box, even from on top of a key. Pulling past an edge stretches
  // the view, and it springs back when the button is released.
  box.addEventListener(
    'pointerdown',
    (pointerEvent) => {
      if (pointerEvent.button !== MIDDLE_BUTTON) return;
      pointerEvent.preventDefault(); // no browser autoscroll
      pointerEvent.stopPropagation(); // never selects or moves the key under the pointer
      viewTouched = true;
      const start = { x: pointerEvent.clientX, y: pointerEvent.clientY, panX: view.panX, panY: view.panY };
      box.classList.add('panning');
      try {
        box.setPointerCapture(pointerEvent.pointerId);
      } catch {
        /* not a real pointer (tests) */
      }
      const move = (moveEvent) => {
        const panX = start.panX + moveEvent.clientX - start.x;
        const panY = start.panY + moveEvent.clientY - start.y;
        setView({
          zoom: view.zoom,
          panX: stretchPan(panX, view.zoom, boxSize.w, content().w, OVERSCAN),
          panY: stretchPan(panY, view.zoom, boxSize.h, content().h, OVERSCAN),
        });
      };
      const done = () => {
        box.removeEventListener('pointermove', move);
        box.removeEventListener('pointerup', done);
        box.removeEventListener('pointercancel', done);
        box.classList.remove('panning');
        setView(clampView(view, boxSize, content(), OVERSCAN)); // springs back with the board's transition
      };
      box.addEventListener('pointermove', move);
      box.addEventListener('pointerup', done);
      box.addEventListener('pointercancel', done);
    },
    true,
  );
  box.addEventListener('auxclick', (clickEvent) => clickEvent.preventDefault());

  /** A pointer position as a point inside the box, measured from the inside of its border (where the board starts). */
  function insideBox(pointerEvent) {
    const rect = box.getBoundingClientRect();
    return { x: pointerEvent.clientX - rect.left - box.clientLeft, y: pointerEvent.clientY - rect.top - box.clientTop };
  }

  /** A pointer position as a point on the board in pixels at 100% zoom. */
  const boardPoint = (pointerEvent) => toBoard(insideBox(pointerEvent), view);

  // A press on the empty board (a key stops its own presses) starts drawing a selection box.
  box.onpointerdown = (pointerEvent) => {
    if (pointerEvent.target.closest?.('.zoom-controls, .arrange-bar')) return;
    startMarquee(pointerEvent);
  };

  // ---- Keys ---------------------------------------------------------------------------------------------------------
  function makeKey(item) {
    const { key } = item;
    const node = el('div', { className: 'kmk', test: 'key-cell' });
    node.dataset.code = key.code;
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.onclick = (clickEvent) => {
      if (justDragged) return;
      chooseKey(key.code, isAdditive(clickEvent));
      render();
    };
    // Enter or Space on a focused key selects it (with Ctrl or Shift: adds it), so the board works without a mouse.
    node.onkeydown = async (keyEvent) => {
      if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return;
      keyEvent.preventDefault();
      chooseKey(key.code, isAdditive(keyEvent));
      await render();
      nodes.get(key.code)?.focus(); // the page was drawn again: put the focus back on the key
    };
    node.onpointerdown = (pointerEvent) => {
      if (pointerEvent.button !== 0) return;
      pointerEvent.stopPropagation(); // do not also start a selection box
      dragKeys(pointerEvent, node, key);
    };
    return node;
  }

  /** Put one key's element in step with its place, look and state. */
  function paintKey(node, item, { hidden, clash }) {
    const { key } = item;
    node.style.setProperty('--x', String(item.x));
    node.style.setProperty('--y', String(item.y));
    node.style.setProperty('--w', String(item.w));
    node.style.setProperty('--h', String(item.h));
    const label = profile.labels[key.code] ?? key.label;
    if (node.textContent !== (label ?? '')) node.textContent = label ?? '';
    node.title = key.code + ' (drag to move)';
    node.hidden = !showHiddenKeys() && hidden.has(key.code); // the Hidden keys switch is off
    node.classList.toggle('off', hidden.has(key.code));
    node.classList.toggle('sel', selectedKeys.has(key.code));
    node.classList.toggle('clash', clash.has(key.code));
    node.classList.toggle('moved', !!profile.positions[key.code]);
    const state = [
      hidden.has(key.code) ? 'hidden in the overlay' : 'shown',
      selectedKeys.has(key.code) ? 'selected' : null,
    ];
    node.setAttribute('aria-pressed', String(selectedKeys.has(key.code)));
    node.setAttribute(
      'aria-label',
      `${key.code}${label ? ', label ' + label : ''}, ${state.filter(Boolean).join(', ')}`,
    );
  }

  /** Make a key the selection, or add it to / remove it from the selection when `additive`. */
  function chooseKey(code, additive) {
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
  function update(nextLayout, nextProfile) {
    layout = nextLayout;
    profile = nextProfile;
    const savedPlaces = placeKeys(layout, profile);
    layoutPlaces = layoutBoxesFor(layout, profile);
    frame = boardFrame(
      layoutPlaces,
      savedPlaces.map((item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h })),
    );
    board = { w: frame.w, h: frame.h };
    // everything below works in board places: the saved place plus the origin (the layout sits in the middle of the board)
    placed = savedPlaces.map((item) => ({
      ...item,
      x: round2(item.x + frame.originX),
      y: round2(item.y + frame.originY),
    }));
    const placedBoxes = placed.map((item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h }));
    canvas.style.setProperty('--board-w', String(board.w));
    canvas.style.setProperty('--board-h', String(board.h));
    box.style.setProperty('--board-w', String(board.w));
    box.style.setProperty('--board-h', String(board.h));
    canvas.dataset.boardW = String(board.w);
    canvas.dataset.boardH = String(board.h);
    canvas.dataset.originX = String(frame.originX);
    canvas.dataset.originY = String(frame.originY);
    box.setAttribute('aria-label', `Keyboard layout ${layout.name}`);

    const key = `${layout.id}:${profile.layoutStyle}`;
    if (key !== shownFor) {
      shownFor = key;
      nodes.clear();
      handles = null;
      canvas.replaceChildren();
      needsFirstView = true;
      viewTouched = false;
    }
    const hidden = new Set(profile.disabledKeys);
    const clash = overlappingCodes(placedBoxes.filter((boxOf) => !hidden.has(boxOf.code)));
    const present = new Set();
    for (const item of placed) {
      present.add(item.key.code);
      let node = nodes.get(item.key.code);
      if (!node) {
        node = makeKey(item);
        nodes.set(item.key.code, node);
        canvas.append(node);
      }
      paintKey(node, item, { hidden, clash });
    }
    for (const [code, node] of nodes)
      if (!present.has(code)) {
        node.remove();
        nodes.delete(code);
      }
    canvas.classList.toggle('dots', gridShown());
    updateHandles(hidden);
    placeArrangeBar();
    if (box.clientWidth && box.clientHeight) {
      boxSize = { w: box.clientWidth, h: box.clientHeight };
      if (needsFirstView || !viewTouched) firstView();
      else refit();
    } else setView(view); // keep the dots in step with the snap choice while off the page
  }

  // ---- Dragging keys ------------------------------------------------------------------------------------------------
  /**
   * Drag a key, or the whole selection when the pressed key is part of it. Snaps to the snap step, keeps the group's
   * shape, stops at the edge of the board, and the live preview follows while you drag.
   */
  function dragKeys(pointerEvent, node, pressedKey) {
    if (isAdditive(pointerEvent)) return;
    const movingCodes = selectedKeys.has(pressedKey.code) ? [...selectedKeys] : [pressedKey.code];
    const boxes = placed
      .filter((item) => movingCodes.includes(item.key.code))
      .map((item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h }));
    const pressed = boxes.find((boxOf) => boxOf.code === pressedKey.code);
    const area = boardArea(board);
    // Smart guides (shape style, Snap on): the key edges stick to the edges of the keys that stay where they are.
    const hiddenCodes = new Set(profile.disabledKeys);
    const others = placed
      .filter((item) => !movingCodes.includes(item.key.code) && !hiddenCodes.has(item.key.code))
      .map((item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h }));
    const useGuides = snapStep() > 0 && profile.layoutStyle === 'shape';
    const guideLines = { x: null, y: null };
    const keysByCode = new Map(placed.map((item) => [item.key.code, item.key]));
    const start = { x: pointerEvent.clientX, y: pointerEvent.clientY };
    let moving = false;
    let lastMove = null;
    let readout = null; // the small "x 3.25  y 1" label that follows the key while dragging
    try {
      node.setPointerCapture(pointerEvent.pointerId);
    } catch {
      /* not a real pointer (tests): events still arrive on the key itself */
    }

    const move = (moveEvent) => {
      const pixelsX = moveEvent.clientX - start.x;
      const pixelsY = moveEvent.clientY - start.y;
      if (!moving && Math.hypot(pixelsX, pixelsY) < DRAG_START_DISTANCE) return; // a click, not a drag
      if (!moving) {
        moving = true;
        if (!selectedKeys.has(pressedKey.code)) setSelectedKeys([pressedKey.code]);
        box.classList.add('panning'); // no sliding while a key is dragged
        canvas.classList.add('holding'); // the other keys fade while one is held
        arrangeBar.hidden = true;
        if (handles) handles.hidden = true; // the resize handles step aside while a key is dragged
        for (const boxOf of boxes) nodes.get(boxOf.code)?.classList.add('drag');
        readout = el('div', { className: 'readout', test: 'key-readout' });
        canvas.append(readout);
      }
      const keysPerPixel = 1 / (UNIT * view.zoom);
      // the pressed key snaps to a guide or to the grid; the rest of the group moves by the same amount
      const rawX = pressed.x + pixelsX * keysPerPixel;
      const rawY = pressed.y + pixelsY * keysPerPixel;
      const stuck = useGuides ? snapToGuides(pressed, rawX, rawY, others) : null;
      const wishedX = (stuck?.guideX != null ? stuck.x : snap(rawX)) - pressed.x;
      const wishedY = (stuck?.guideY != null ? stuck.y : snap(rawY)) - pressed.y;
      const allowed = clampMove(boxes, wishedX, wishedY, area);
      if (lastMove && lastMove.dx === allowed.dx && lastMove.dy === allowed.dy) return;
      lastMove = allowed;
      const positions = movedPositions(boxes, allowed.dx, allowed.dy);
      for (const [code, position] of Object.entries(positions)) {
        const dragged = nodes.get(code);
        dragged?.style.setProperty('--x', String(position.x));
        dragged?.style.setProperty('--y', String(position.y));
        saveAt(keysByCode.get(code), position.x, position.y);
      }
      showGuides(guideLines, stuck?.guideX ?? null, stuck?.guideY ?? null);
      const at = positions[pressed.code];
      readout.textContent = `x ${round2(at.x)}   y ${round2(at.y)}`;
      readout.style.setProperty('--x', String(at.x));
      readout.style.setProperty('--y', String(at.y));
      push();
    };
    const done = () => {
      readout?.remove();
      showGuides(guideLines, null, null);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', done);
      node.removeEventListener('pointercancel', done);
      box.classList.remove('panning');
      canvas.classList.remove('holding');
      for (const boxOf of boxes) nodes.get(boxOf.code)?.classList.remove('drag');
      if (!moving) return;
      justDragged = true;
      setTimeout(() => {
        justDragged = false;
      }, 0);
      changed(true);
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', done);
    node.addEventListener('pointercancel', done);
  }

  /** Draw (or remove) the orange guide lines at the edge x / y (in keys) that a dragged key has stuck to. */
  function showGuides(lines, x, y) {
    for (const [axis, at] of [
      ['x', x],
      ['y', y],
    ]) {
      if (at === null) {
        lines[axis]?.remove();
        lines[axis] = null;
        continue;
      }
      if (!lines[axis]) {
        lines[axis] = el('div', {
          className: 'guide ' + (axis === 'x' ? 'vertical' : 'horizontal'),
          test: 'key-guide-' + axis,
        });
        canvas.append(lines[axis]);
      }
      lines[axis].style.setProperty('--at', String(at));
    }
  }

  // ---- The arrange bar ----------------------------------------------------------------------------------------------
  /** Save new positions ({ code: { x, y } }) for keys of this layout, then draw again. */
  function applyPositions(positions) {
    for (const item of placed) {
      const position = positions[item.key.code];
      if (position) saveAt(item.key, position.x, position.y);
    }
    changed(true);
  }

  /** Line the selected keys up, or space them evenly. */
  function arrange(kind, how) {
    const boxes = selectedBoardBoxes();
    applyPositions(kind === 'align' ? alignPositions(boxes, how) : distributePositions(boxes, how));
  }

  /** Show the bar above the selected keys (below them when there is no room above), or hide it. */
  function placeArrangeBar() {
    const count = selectedKeys.size;
    arrangeBar.hidden = count < 2 || !layout || box.classList.contains('selecting');
    if (arrangeBar.hidden) return;
    for (const arrangeButton of /** @type {NodeListOf<HTMLButtonElement>} */ (arrangeBar.querySelectorAll('button'))) {
      const enough = count >= Number(arrangeButton.dataset.needed);
      arrangeButton.disabled = !enough;
      arrangeButton.title = enough
        ? arrangeButton.dataset.tooltip
        : `Select at least ${arrangeButton.dataset.needed} keys first`;
    }
    const boxes = selectedBoardBoxes();
    if (!boxes.length) return;
    const bounds = boundsOf(boxes);
    const topLeft = toScreen({ x: bounds.minX * UNIT, y: bounds.minY * UNIT }, view);
    const bottomRight = toScreen({ x: bounds.maxX * UNIT, y: bounds.maxY * UNIT }, view);
    const height = arrangeBar.offsetHeight || 32;
    const above = topLeft.y - ARRANGE_GAP - height;
    // centered over the selection, but kept inside the box
    const half = (arrangeBar.offsetWidth || 0) / 2 + ARRANGE_GAP / 2;
    const center = Math.min(Math.max((topLeft.x + bottomRight.x) / 2, half), Math.max(half, boxSize.w - half));
    arrangeBar.style.setProperty('--bar-x', center + 'px');
    arrangeBar.style.setProperty('--bar-y', (above >= 0 ? above : bottomRight.y + ARRANGE_GAP) + 'px');
  }

  // ---- Resizing the selected key ------------------------------------------------------------------------------------
  /** Show the resize handles on the left and right edge of the selected key (only when one shown key is selected). */
  function updateHandles(hidden) {
    const code = selectedKeys.size === 1 ? [...selectedKeys][0] : null;
    const item = code && !hidden.has(code) ? placed.find((candidate) => candidate.key.code === code) : null;
    if (!item) {
      handles?.remove();
      handles = null;
      return;
    }
    if (!handles) {
      handles = el('div', { className: 'handles', test: 'key-handles' });
      for (const side of ['left', 'right', 'top', 'bottom']) {
        const handle = el('div', { className: 'handle ' + side, test: 'key-handle-' + side });
        handle.onpointerdown = (pointerEvent) => {
          if (pointerEvent.button !== 0) return;
          pointerEvent.stopPropagation(); // not a selection box, not a key drag
          resizeKey(pointerEvent, handle, side);
        };
        handles.append(handle);
      }
      canvas.append(handles);
    }
    handles.hidden = false;
    handles.dataset.code = item.key.code;
    handles.style.setProperty('--x', String(item.x));
    handles.style.setProperty('--y', String(item.y));
    handles.style.setProperty('--w', String(item.w));
    handles.style.setProperty('--h', String(item.h));
  }

  /**
   * Drag a handle to resize the key: the opposite edge stays put, the width snaps to the snap step, and it stays between
   * the layout own width (or one key) and the board edge. Saved once, when the handle is let go.
   */
  function resizeKey(pointerEvent, handle, side) {
    const item = placed.find((candidate) => candidate.key.code === handles.dataset.code);
    if (!item) return;
    const { key } = item;
    const start = { x: pointerEvent.clientX, y: pointerEvent.clientY };
    const startBox = { code: key.code, x: item.x, y: item.y, w: item.w, h: item.h };
    const vertical = side === 'top' || side === 'bottom';
    const layoutSize = vertical ? baseHeight(key) : baseWidth(key, profile.layoutStyle);
    const node = nodes.get(key.code);
    const readout = el('div', { className: 'readout', test: 'key-readout' });
    canvas.append(readout);
    canvas.classList.add('holding');
    node?.classList.add('drag');
    box.classList.add('panning');
    arrangeBar.hidden = true;
    try {
      handle.setPointerCapture(pointerEvent.pointerId);
    } catch {
      /* not a real pointer (tests) */
    }
    const move = (moveEvent) => {
      const delta = (vertical ? moveEvent.clientY - start.y : moveEvent.clientX - start.x) / (UNIT * view.zoom);
      const resized = resizeBox(startBox, side, delta, board, snapStep(), layoutSize);
      const at = { x: resized.x ?? startBox.x, y: resized.y ?? startBox.y };
      for (const target of [node, handles]) {
        if (vertical) {
          target?.style.setProperty('--y', String(resized.y));
          target?.style.setProperty('--h', String(resized.h));
        } else {
          target?.style.setProperty('--x', String(resized.x));
          target?.style.setProperty('--w', String(resized.w));
        }
      }
      if (side === 'left' || side === 'top') saveAt(key, at.x, at.y); // the opposite edge stays put, so the place moves
      if (vertical) setKeyHeight(key, resized.h);
      else setKeyWidth(key, resized.w);
      readout.textContent = vertical ? `height ${round2(resized.h)}` : `width ${round2(resized.w)}`;
      readout.style.setProperty('--x', String(at.x));
      readout.style.setProperty('--y', String(at.y));
      push();
    };
    const done = () => {
      readout.remove();
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', done);
      handle.removeEventListener('pointercancel', done);
      box.classList.remove('panning');
      canvas.classList.remove('holding');
      node?.classList.remove('drag');
      changed(true);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', done);
    handle.addEventListener('pointercancel', done);
  }

  // ---- Selecting with a box -----------------------------------------------------------------------------------------
  /** The codes of the keys that touch the rectangle (board pixels at 100% zoom). */
  function keysInside(rectangle) {
    const codes = [];
    for (const item of placed) {
      // the key as drawn: its cell minus the 3 pixel gap (KEY_GAP, as in settings.css)
      const touchesAcross = item.x * UNIT < rectangle.right && (item.x + item.w) * UNIT - KEY_GAP > rectangle.left;
      const touchesDown = item.y * UNIT < rectangle.bottom && (item.y + item.h) * UNIT - KEY_GAP > rectangle.top;
      if (touchesAcross && touchesDown) codes.push(item.key.code);
    }
    return codes;
  }

  /**
   * Drag a box on the empty part of the board to select the keys it touches. Ctrl or Shift keeps the keys that are
   * already selected. A plain click on the empty part clears the selection.
   */
  function startMarquee(pointerEvent) {
    if (pointerEvent.button !== 0) return;
    const origin = boardPoint(pointerEvent);
    const keep = isAdditive(pointerEvent) ? [...selectedKeys] : [];
    const rubberBand = el('div', { className: 'marquee' });
    let chosen = keep;
    let drawing = false;
    try {
      box.setPointerCapture(pointerEvent.pointerId);
    } catch {
      /* not a real pointer (tests) */
    }

    const move = (moveEvent) => {
      const point = boardPoint(moveEvent);
      if (
        !drawing &&
        Math.hypot((point.x - origin.x) * view.zoom, (point.y - origin.y) * view.zoom) < DRAG_START_DISTANCE
      )
        return;
      if (!drawing) {
        drawing = true;
        arrangeBar.hidden = true;
        canvas.append(rubberBand);
      }
      const rectangle = {
        left: Math.min(origin.x, point.x),
        top: Math.min(origin.y, point.y),
        right: Math.max(origin.x, point.x),
        bottom: Math.max(origin.y, point.y),
      };
      rubberBand.style.setProperty('--left', rectangle.left + 'px');
      rubberBand.style.setProperty('--top', rectangle.top + 'px');
      rubberBand.style.setProperty('--width', rectangle.right - rectangle.left + 'px');
      rubberBand.style.setProperty('--height', rectangle.bottom - rectangle.top + 'px');
      chosen = [...new Set([...keep, ...keysInside(rectangle)])];
      for (const [code, node] of nodes) node.classList.toggle('sel', chosen.includes(code));
    };
    const done = () => {
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', done);
      box.removeEventListener('pointercancel', done);
      rubberBand.remove();
      setSelectedKeys(chosen);
      render();
    };
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', done);
    box.addEventListener('pointercancel', done);
  }

  return { element: box, update, focusKey: (code) => nodes.get(code)?.focus() };
}
