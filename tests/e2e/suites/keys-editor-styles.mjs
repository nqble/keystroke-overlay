// Suite: the view staying where the person left it, layout styles (Keyboard shape | Even grid) and the Reset menu, the
// board centered on the layout, key height, junk positions cleaned by the app, and deleting the layout.
// The test layout and the shared helpers are in ../lib/keys-editor-kit.mjs.
import { byTest, check, finish, sleep, PORT } from '../lib/cdp.mjs';
import {
  arrangeButton,
  boardInfo,
  clearSelection,
  clickKey,
  drag,
  dragHandle,
  flip,
  id,
  keep,
  keyCell,
  p,
  posOf,
  pressed,
  profile,
  saveProfileEdits,
  setShapeEdits,
  shapeEdits,
  state,
} from '../lib/keys-editor-kit.mjs';

// ---- the view stays where the person left it: Close gaps, its Undo and a layout-style switch never move it
const viewOf = async () => {
  const info = await boardInfo();
  return JSON.stringify([info.zoom, info.panX, info.panY]);
};
await p.ev(`document.querySelector('${byTest('editor-zoom-in')}').click()`);
await sleep(500);
const viewBeforeEdits = await viewOf();
await p.ev(`document.querySelector('${byTest('keys-tidy')}').click()`);
await sleep(800);
check(
  'Close gaps leaves the view where it was',
  (await viewOf()) === viewBeforeEdits,
  `${viewBeforeEdits} -> ${await viewOf()}`,
);
await p.ev(`${arrangeButton('key-undo')}.click()`);
await sleep(800);
check(
  'Undo of Close gaps leaves the view where it was',
  (await viewOf()) === viewBeforeEdits,
  `${viewBeforeEdits} -> ${await viewOf()}`,
);
await p.ev(`document.querySelector('${byTest('layout-style-grid')}').click()`);
await sleep(800);
check(
  'switching to the Even grid leaves the view where it was',
  (await viewOf()) === viewBeforeEdits,
  `${viewBeforeEdits} -> ${await viewOf()}`,
);
await p.ev(`document.querySelector('${byTest('layout-style-shape')}').click()`);
await sleep(800);
await saveProfileEdits({});

// ---- layout style (Keyboard shape | Even grid), Close gaps in the grid, and the Reset menu (M4.3)
const savedLayoutStyle = async () => (await profile(id)).layoutStyle ?? 'shape';
const styleOn = (style) =>
  p.q(`document.querySelector('${byTest('layout-style-' + style)}').getAttribute('aria-checked') === 'true'`);
await setShapeEdits({ positions: { KeyW: { x: 7, y: 1 } } });
await clearSelection();
check(
  'the layout style switch starts on Keyboard shape and is a radio group',
  (await styleOn('shape')) &&
    !(await styleOn('grid')) &&
    (await p.q(`document.querySelector('${byTest('layout-style')}').getAttribute('role')`)) === 'radiogroup',
);
await p.ev(`document.querySelector('${byTest('layout-style-grid')}').click()`);
await sleep(800);
check('choosing Even grid is saved with the layout', (await savedLayoutStyle()) === 'grid' && (await styleOn('grid')));
check(
  'in the Even grid every key is one key wide',
  await p.q(
    `(() => { const c = document.querySelector('${byTest('keymap-canvas')}'); return [...c.querySelectorAll('${byTest('key-cell')}')].every((n) => n.style.getPropertyValue('--w') === '1'); })()`,
  ),
);
check(
  'each layout style keeps its own work: the moved key is not moved in the grid',
  !(await profile(id)).styles?.grid?.positions?.KeyW && !!(await profile(id)).styles?.shape?.positions?.KeyW,
);
await clickKey('KeyD');
await sleep(300);
await drag('KeyD', 1.4, 0);
await sleep(700);
const gridPos = (await profile(id)).styles?.grid?.positions?.KeyD;
check(
  'with Snap on, keys move by whole keys in the Even grid',
  !!gridPos && Math.abs(gridPos.x - Math.round(gridPos.x)) < 1e-6,
  JSON.stringify(gridPos),
);
const gridBeforeClose = (await profile(id)).styles?.grid?.positions ?? {};
await p.ev(`document.querySelector('${byTest('keys-tidy')}').click()`);
await sleep(800);
const gridAfterClose = (await profile(id)).styles?.grid?.positions ?? {};
check(
  'Close gaps in the Even grid leaves a dragged key alone when no hidden key sits between shown ones',
  JSON.stringify(gridAfterClose) === JSON.stringify(gridBeforeClose),
  JSON.stringify([gridBeforeClose, gridAfterClose]),
);
// undo step by step until the layout style is Keyboard shape again (the earlier steps are moves and Close gaps)
for (let i = 0; i < 8 && (await savedLayoutStyle()) !== 'shape'; i++) {
  await p.ev(`document.querySelector('${byTest('key-undo')}').click()`);
  await sleep(600);
}
check(
  'Undo takes the layout style switch back too',
  (await savedLayoutStyle()) === 'shape' && (await styleOn('shape')),
  await savedLayoutStyle(),
);
await p.ev(`document.querySelector('${byTest('key-redo')}').click()`);
await sleep(600);
check('...and Redo puts the Even grid back', (await savedLayoutStyle()) === 'grid');
await p.ev(`document.querySelector('${byTest('layout-style-shape')}').click()`);
await sleep(700);
check('switching back to Keyboard shape keeps the earlier work', !!(await profile(id)).styles?.shape?.positions?.KeyW);
await p.ev(
  `document.querySelector('${byTest('layout-style-shape')}').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))`,
);
await sleep(700);
check('the arrow keys move between the two layout styles', (await savedLayoutStyle()) === 'grid');
await p.ev(
  `document.querySelector('${byTest('layout-style-grid')}').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }))`,
);
await sleep(700);
check('...in both directions', (await savedLayoutStyle()) === 'shape');

// the Reset menu
await setShapeEdits({ positions: { KeyA: { x: 5, y: 1 }, KeyS: { x: 6, y: 1 } } });
await clickKey('KeyA');
await sleep(300);
await p.ev(`document.querySelector('${byTest('keys-reset-menu')}').click()`);
await sleep(300);
check(
  'the Reset menu lists its five choices and the danger one is last',
  (await p.q(`[...document.querySelectorAll('.ctxmenu button')].map((b) => b.textContent).join('|')`)) ===
    'Put selected keys back|Put all keys back|Show all hidden keys|Reset all labels|Reset this layout completely',
);
await p.ev(`document.querySelector('${byTest('keys-put-selected-back')}').click()`);
await sleep(600);
const afterPutSelected = shapeEdits(await profile(id)).positions ?? {};
check(
  '"Put selected keys back" only puts the selected key back',
  !afterPutSelected.KeyA && !!afterPutSelected.KeyS,
  JSON.stringify(afterPutSelected),
);
await p.ev(`document.querySelector('${byTest('key-undo')}').click()`);
await sleep(600);
check('every Reset item can be undone', !!(shapeEdits(await profile(id)).positions ?? {}).KeyA);
await p.ev(`document.querySelector('${byTest('keys-reset-menu')}').click()`);
await sleep(300);
await p.ev(`document.querySelector('${byTest('keys-revert')}').click()`);
await sleep(400);
check(
  '"Reset this layout completely" asks first, in the shared dialog',
  (await p.q(
    `!document.querySelector('${byTest('dialog')}').hidden && document.querySelector('${byTest('dialog-title')}').textContent`,
  )) === 'Reset this layout?',
);
await p.ev(`document.querySelector('${byTest('dialog-cancel')}').click()`);
await sleep(300);
check('Cancel leaves the edits alone', !!(shapeEdits(await profile(id)).positions ?? {}).KeyA);
await p.ev(`document.querySelector('${byTest('keys-reset-menu')}').click()`);
await sleep(300);
await p.ev(`document.querySelector('${byTest('keys-revert')}').click()`);
await sleep(400);
await p.ev(`document.querySelector('${byTest('dialog-reset-layout-confirm')}').click()`);
await sleep(800);
check('confirming resets the layout completely', !(await state()).settings.layout.profiles[id]);
await p.ev(`document.querySelector('${byTest('key-undo')}').click()`);
await sleep(600);
check('...and Undo brings the edits back', !!(shapeEdits(await profile(id)).positions ?? {}).KeyA);
await setShapeEdits({});
await clearSelection();

// ---- the board is centered on the layout; Grid works without Snap; handles step aside; Hidden keys switch (v1.4 review fixes)
await setShapeEdits({});
await clearSelection();
const roomAround = await p.ev(`
  const c = document.querySelector('${byTest('keymap-canvas')}').getBoundingClientRect();
  const keys = [...document.querySelectorAll('${byTest('key-cell')}')].map((k) => k.getBoundingClientRect());
  const unit = c.width / Number(document.querySelector('${byTest('keymap-canvas')}').dataset.boardW);
  const left = (Math.min(...keys.map((r) => r.left)) - c.left) / unit, right = (c.right - Math.max(...keys.map((r) => r.right))) / unit;
  const top = (Math.min(...keys.map((r) => r.top)) - c.top) / unit, bottom = (c.bottom - Math.max(...keys.map((r) => r.bottom))) / unit;
  return { left, right, top, bottom };`);
check(
  'the layout sits in the middle of the board, with room on every side',
  Math.abs(roomAround.left - roomAround.right) <= 1.6 &&
    Math.abs(roomAround.top - roomAround.bottom) <= 1.6 &&
    roomAround.left > 1 &&
    roomAround.top > 1,
  JSON.stringify(roomAround),
);

// the Grid switch shows the dots whether or not Snap is on, and in both layout styles
const dotsShown = () =>
  p.q(
    `(() => { const c = document.querySelector('${byTest('keymap-canvas')}'); return c.classList.contains('grid-dots') && parseFloat(getComputedStyle(c, '::before').backgroundSize) > 0; })()`,
  );
if (!(await pressed('key-grid'))) await flip('key-grid');
if (await pressed('key-snap')) await flip('key-snap');
check('Grid shows its dots with Snap off', (await dotsShown()) && !(await pressed('key-snap')));
// zoomed all the way out the dots are still visible: the board is scaled down, so a dot is drawn bigger to stay at least
// about 0.7 px on screen
for (let step = 0; step < 12; step++) await p.ev(`document.querySelector('${byTest('editor-zoom-out')}').click()`);
await sleep(400);
const dotOnScreen = await p.q(
  `(() => { const c = document.querySelector('${byTest('keymap-canvas')}'); return parseFloat(c.style.getPropertyValue('--dot-radius')) * parseFloat(c.style.getPropertyValue('--zoom')); })()`,
);
check('Grid dots stay visible zoomed all the way out', (await dotsShown()) && dotOnScreen >= 0.69, String(dotOnScreen));
await p.ev(`document.querySelector('${byTest('editor-zoom-reset')}').click()`);
await sleep(300);
await p.ev(`document.querySelector('${byTest('layout-style-grid')}').click()`);
await sleep(800);
check('...and in the Even grid layout style too', await dotsShown());
const dotOffset = await p.q(
  `(() => { const c = document.querySelector('${byTest('keymap-canvas')}'); const s = getComputedStyle(c, '::before'); return [parseFloat(s.backgroundPositionX), parseFloat(s.backgroundPositionY), parseFloat(c.style.getPropertyValue('--dot-spacing')), parseFloat(s.left), parseFloat(s.right), parseFloat(s.bottom)]; })()`,
);
check(
  'Grid dots sit in the middle of the gap between neighboring keys, on the grid line, and none on the board’s edge',
  dotOffset[0] === -1.5 &&
    dotOffset[1] === -1.5 &&
    [dotOffset[3], dotOffset[4], dotOffset[5]].every((inset) => inset === dotOffset[2] / 2),
  JSON.stringify(dotOffset),
);
await p.ev(`document.querySelector('${byTest('layout-style-shape')}').click()`);
await sleep(800);
await flip('key-snap'); // Snap back on
await flip('key-grid'); // Grid off

// turning Grid on and off must not move the board
const boardTop = () => p.q(`document.querySelector('${byTest('keymap')}').getBoundingClientRect().top`);
const topBefore = await boardTop();
await flip('key-grid');
const topWithGrid = await boardTop();
await flip('key-grid');
const topAfter = await boardTop();
check(
  'turning Grid on and off does not move the board up or down',
  Math.abs(topBefore - topWithGrid) < 0.5 && Math.abs(topBefore - topAfter) < 0.5,
  JSON.stringify([topBefore, topWithGrid, topAfter]),
);

// the resize handles disappear while a key is dragged and come back afterwards
await clickKey('KeyW');
await sleep(400);
const handlesState = await p.ev(`
  const n = document.querySelector('${keyCell('KeyW')}'), r = n.getBoundingClientRect();
  const handles = () => { const h = document.querySelector('${byTest('key-handles')}'); return !!h && getComputedStyle(h).display !== 'none'; };
  const ev = (t, x, y) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 41 });
  const before = handles();
  n.dispatchEvent(ev('pointerdown', r.left + 4, r.top + 4));
  for (let i = 1; i <= 3; i++) n.dispatchEvent(ev('pointermove', r.left + 4 + 12 * i, r.top + 4));
  const during = handles();
  n.dispatchEvent(ev('pointerup', r.left + 40, r.top + 4));
  return { before, during };`);
await sleep(600);
check(
  'the resize handles show on a selected key and hide while it is dragged',
  handlesState.before === true && handlesState.during === false,
  JSON.stringify(handlesState),
);
check(
  '...and come back when the key is let go',
  await p.q(
    `(() => { const h = document.querySelector('${byTest('key-handles')}'); return !!h && getComputedStyle(h).display !== 'none'; })()`,
  ),
);
await clearSelection();

// the Hidden keys switch: dimmed hidden keys can be shown or taken off the board view
const visibleCount = () =>
  p.q(
    `[...document.querySelectorAll('${byTest('key-cell')}')].filter((n) => getComputedStyle(n).display !== 'none').length`,
  );
const withHidden = await visibleCount();
check(
  'hidden keys are shown dimmed by default, and the switch is on',
  withHidden > 5 && (await pressed('key-show-hidden')),
);
await flip('key-show-hidden');
const withoutHidden = await visibleCount();
check(
  'turning Hidden keys off leaves only the keys the overlay draws',
  withoutHidden === keep.length && !(await pressed('key-show-hidden')),
  String(withoutHidden),
);
check('the choice is saved', (await state()).settings.layout.editor.showHidden === false);
await flip('key-show-hidden');
check('turning it back on shows them again', (await visibleCount()) === withHidden);

// ---- key height: handles on all four sides, thin, and a Height field in the inspector
const dragHandleDown = (side, dyUnits) =>
  p.ev(`
    const h = document.querySelector('${byTest('key-handle-' + side)}'), r = h.getBoundingClientRect();
    const board = document.querySelector('${byTest('keymap-canvas')}'), unit = board.getBoundingClientRect().width / Number(board.dataset.boardW);
    const ev = (t, y) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: y, button: 0, pointerId: 51 });
    const y0 = r.top + r.height / 2;
    h.dispatchEvent(ev('pointerdown', y0));
    for (let i = 1; i <= 4; i++) h.dispatchEvent(ev('pointermove', y0 + (${dyUnits} * unit) * i / 4));
    h.dispatchEvent(ev('pointerup', y0 + ${dyUnits} * unit));`);
const heightOf = async (code) => shapeEdits(await profile(id)).sizes?.[code]?.h ?? 1;
const previewHeight = (code) =>
  p.evIn(
    `localhost:${PORT}`,
    `const e = document.querySelector('[data-code="${code}"]'); return e ? parseFloat(e.style.height) : null`,
  );
await setShapeEdits({});
await clickKey('KeyW');
await sleep(400);
check(
  'a selected key has a handle on all four sides',
  // the round turning handle is checked in the key-rotation suite
  (await p.q(`document.querySelectorAll('[data-test^="key-handle-"]:not([data-test="key-handle-turn"])').length`)) ===
    4,
);
check(
  'the handles are thin lines: the visible part is 4 pixels or less on screen at 100% zoom',
  await p.q(
    `(() => { const b = getComputedStyle(document.querySelector('${byTest('key-handle-right')}'), '::before'); return parseFloat(b.width) <= 4.01; })()`,
  ),
);
const tall0 = await previewHeight('KeyW');
await dragHandleDown('bottom', 1);
await sleep(600);
check(
  'dragging the bottom handle down by one key makes the key one key taller',
  Math.abs((await heightOf('KeyW')) - 2) < 0.01,
  String(await heightOf('KeyW')),
);
const tall1 = await previewHeight('KeyW');
check('the live preview and OBS draw the taller key', tall1 > tall0 * 1.5, JSON.stringify([tall0, tall1]));
const heightBefore = { ...(await posOf('KeyW')), h: await heightOf('KeyW') };
await dragHandleDown('top', -1);
await sleep(600);
const heightAfter = { ...(await posOf('KeyW')), h: await heightOf('KeyW') };
check(
  'dragging the top handle up makes it taller and the bottom edge stays where it was',
  Math.abs(heightAfter.h - (heightBefore.h + 1)) < 0.01 &&
    Math.abs(heightAfter.y + heightAfter.h - (heightBefore.y + heightBefore.h)) < 0.01,
  JSON.stringify([heightBefore, heightAfter]),
);
await dragHandleDown('bottom', -20);
await sleep(600);
check(
  'a key cannot be made shorter than one key',
  Math.abs((await heightOf('KeyW')) - 1) < 0.01,
  String(await heightOf('KeyW')),
);
check(
  'width and height are saved together in one entry',
  await (async () => {
    await dragHandle('right', 1);
    await sleep(500);
    await dragHandleDown('bottom', 1);
    await sleep(500);
    const entry = shapeEdits(await profile(id)).sizes?.KeyW;
    return !!entry && Math.abs(entry.w - 2) < 0.01 && Math.abs(entry.h - 2) < 0.01;
  })(),
);
await p.ev(
  `const h = document.querySelector('${byTest('key-height')}'); h.value = '3'; h.dispatchEvent(new Event('input', { bubbles: true })); h.dispatchEvent(new Event('change', { bubbles: true }))`,
);
await sleep(700);
check(
  'typing a height in the inspector resizes the key',
  Math.abs((await heightOf('KeyW')) - 3) < 0.01,
  String(await heightOf('KeyW')),
);
await p.ev(`document.querySelector('${byTest('key-position-reset')}').click()`);
await sleep(600);
check('"Put back where it was" gives both width and height back', !shapeEdits(await profile(id)).sizes?.KeyW);
await setShapeEdits({});
await clearSelection();

// ---- hostile positions are cleaned by the app
const S1 = (await state()).settings;
await p.invoke('save_settings', {
  settings: {
    ...S1,
    layout: {
      ...S1.layout,
      profiles: {
        ...S1.layout.profiles,
        [id]: {
          disabledKeys: [],
          labels: {},
          styles: { shape: { positions: { KeyW: { x: -9, y: 1e9 }, KeyA: { x: 'no', y: 1 }, KeyS: 5 } } },
        },
      },
    },
  },
});
const cleaned = shapeEdits(await profile(id)).positions ?? {};
check(
  'junk positions are clamped (to -100 and 100) or dropped by the app',
  JSON.stringify(cleaned) === JSON.stringify({ KeyW: { x: -9, y: 100 } }),
  JSON.stringify(cleaned),
);

// ---- delete removes the layout's moved keys with it
await p.invoke('delete_layout', { id });
check('deleting the layout also removes its saved positions', !(await profile(id)).styles);
finish();
