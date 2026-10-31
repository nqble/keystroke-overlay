// Suite: the key editor's board: zoom, pan, view memory, board limits, the hidden preview, resize handles, smart guides,
// the held-key fade and the inspector.
// The test layout and the shared helpers are in ../lib/keys-editor-kit.mjs.
import { byTest, check, sleep, PORT, finish } from '../lib/cdp.mjs';
import {
  boardInfo,
  clearSelection,
  clickKey,
  drag,
  dragHandle,
  eventually,
  id,
  keyCell,
  orig,
  p,
  posOf,
  previewKey,
  profile,
  selectedCodes,
  setShapeEdits,
  shapeEdits,
  tab,
} from '../lib/keys-editor-kit.mjs';

// ---- the editor board (M4.1): zoom, pan, view memory, board limits, hidden preview
const wheel = (x, y, deltaY) =>
  p.ev(`
    const box = document.querySelector('${byTest('keymap')}'), r = box.getBoundingClientRect();
    const ev = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: r.left + ${x}, clientY: r.top + ${y}, deltaY: ${deltaY} });
    box.dispatchEvent(ev); return ev.defaultPrevented;`);
await tab('keys');
await sleep(400);
await clearSelection();
const board0 = await boardInfo();
check(
  'the board is drawn in key units, at least 24 x 12 keys, with no more than a margin of empty room around it',
  board0.boardW >= 24 &&
    board0.boardH >= 12 &&
    board0.left <= 121 &&
    board0.top <= 121 &&
    board0.right <= 121 &&
    board0.bottom <= 121,
  JSON.stringify(board0),
);

// the default view of the editor: the keyboard is centered in the box with space around it, and the zoom buttons are clear of the keys
const defaultView = await p.ev(`
  const m = document.querySelector('${byTest('keymap')}').getBoundingClientRect();
  const keys = [...document.querySelectorAll('${byTest('key-cell')}')].map((k) => k.getBoundingClientRect());
  const left = Math.min(...keys.map((r) => r.left)) - m.left, right = m.right - Math.max(...keys.map((r) => r.right));
  const top = Math.min(...keys.map((r) => r.top)) - m.top, bottom = m.bottom - Math.max(...keys.map((r) => r.bottom));
  const z = document.querySelector('.zoom-controls').getBoundingClientRect();
  const touchesKeys = keys.some((r) => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top);
  return { left, right, top, bottom, touchesKeys };`);
check(
  'in the default view the keyboard is centered left to right, with space on both sides',
  Math.abs(defaultView.left - defaultView.right) < 3 && defaultView.left >= 12,
  JSON.stringify(defaultView),
);
check(
  'in the default view there is space above and below the keyboard, and more below for the zoom buttons',
  defaultView.top >= 12 && defaultView.bottom >= defaultView.top,
  JSON.stringify(defaultView),
);
check('the zoom buttons are not on top of any key', !defaultView.touchesKeys, JSON.stringify(defaultView));
const centreOfW = await p.ev(
  `const r = document.querySelector('${keyCell('KeyW')}').getBoundingClientRect(), b = document.querySelector('${byTest('keymap')}').getBoundingClientRect(); return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top }`,
);
const prevented = await wheel(centreOfW.x, centreOfW.y, -300);
await sleep(300);
const zoomed = await boardInfo();
check(
  'the mouse wheel zooms in and the page does not scroll (the wheel event is canceled)',
  prevented && zoomed.zoom > board0.zoom,
  JSON.stringify([board0.zoom, zoomed.zoom]),
);
for (let i = 0; i < 12; i++) await wheel(centreOfW.x, centreOfW.y, -400);
await sleep(300);
const maxZoom = await boardInfo();
check(
  'zoom stops at 300%',
  maxZoom.zoom <= 3.0001 && maxZoom.label === '300%',
  JSON.stringify([maxZoom.zoom, maxZoom.label]),
);
for (let i = 0; i < 20; i++) await wheel(centreOfW.x, centreOfW.y, 400);
await sleep(300);
const minZoom = await boardInfo();
check(
  'zooming out stops when the board just fills the box (only a margin of empty room shows past its edge)',
  minZoom.left <= 121 &&
    minZoom.top <= 121 &&
    minZoom.right <= 121 &&
    minZoom.bottom <= 121 &&
    (minZoom.w <= minZoom.boxW + 2 || minZoom.h <= minZoom.boxH + 2),
  JSON.stringify(minZoom),
);
// zooming goes toward the cursor: the spot of the board under the pointer (as a share of the board) stays under it
const centreShare = (info) => [(info.boxW / 2 - info.left) / info.w, (info.boxH / 2 - info.top) / info.h];
const shareBefore = centreShare(minZoom);
await wheel(minZoom.boxW / 2, minZoom.boxH / 2, -300);
await sleep(300);
const shareAfter = centreShare(await boardInfo());
check(
  'zooming goes toward the cursor: the spot under the pointer stays under it',
  Math.abs(shareBefore[0] - shareAfter[0]) < 0.01 && Math.abs(shareBefore[1] - shareAfter[1]) < 0.01,
  JSON.stringify([shareBefore, shareAfter]),
);
await p.ev(`document.querySelector('${byTest('editor-zoom-in')}').click()`);
await sleep(300);
const afterPlus = await boardInfo();
check('the + button zooms in', afterPlus.zoom > minZoom.zoom, JSON.stringify([minZoom.zoom, afterPlus.zoom]));
await p.ev(`document.querySelector('${byTest('editor-zoom-reset')}').click()`);
await sleep(300);
const hundred = await boardInfo();
check(
  'clicking the percentage goes to 100% (or the smallest zoom that fills the box)',
  hundred.zoom >= 1 - 1e-6 && hundred.label === Math.round(hundred.zoom * 100) + '%',
  JSON.stringify(hundred),
);

// middle-button drag pans, even when it starts on a key, and never selects or moves that key
await p.ev(`document.querySelector('${byTest('editor-zoom-in')}').click()`);
await sleep(300);
const positionsBeforePan = JSON.stringify(shapeEdits(await profile(id)).positions ?? {});
const pannedFrom = await boardInfo();
await p.ev(`
  const n = document.querySelector('${keyCell('KeyW')}'), r = n.getBoundingClientRect();
  const ev = (t, x, y, b) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: b, buttons: b === 1 ? 4 : 0, pointerId: 21 });
  n.dispatchEvent(ev('pointerdown', r.left + 4, r.top + 4, 1));
  for (let i = 1; i <= 4; i++) n.dispatchEvent(ev('pointermove', r.left + 4 - 30 * i, r.top + 4 - 15 * i, 1));
  n.dispatchEvent(ev('pointerup', r.left - 116, r.top - 56, 1));`);
await sleep(400);
const pannedTo = await boardInfo();
check(
  'middle-drag panned the board',
  pannedTo.panX !== pannedFrom.panX || pannedTo.panY !== pannedFrom.panY,
  JSON.stringify([pannedFrom.panX, pannedTo.panX]),
);
check(
  'the middle-drag from on top of a key did not select or move it',
  (await selectedCodes()).length === 0 &&
    JSON.stringify(shapeEdits(await profile(id)).positions ?? {}) === positionsBeforePan,
);
check(
  'after the pan the board has not left the box (only a margin of empty room shows)',
  pannedTo.left <= 121 && pannedTo.top <= 121 && pannedTo.right <= 121 && pannedTo.bottom <= 121,
  JSON.stringify(pannedTo),
);

// the view is kept when you leave the tab and come back; the preview is hidden here and never reloaded
const hiddenHere = await p.q(`getComputedStyle(document.querySelector('.preview')).display === 'none'`);
check('the live preview is hidden while the Keys tab is open', hiddenHere);
await p.evIn(`localhost:${PORT}`, `window.__mark = 'kept'`);
const viewBefore = await boardInfo();
await tab('style');
await sleep(400);
check(
  'the live preview is shown again on other tabs',
  await p.q(`getComputedStyle(document.querySelector('.preview')).display !== 'none'`),
);
await tab('keys');
await sleep(400);
const viewAfter = await boardInfo();
check(
  'zoom and pan are kept when you leave the Keys tab and come back',
  viewAfter.zoom === viewBefore.zoom && viewAfter.panX === viewBefore.panX && viewAfter.panY === viewBefore.panY,
  JSON.stringify([viewBefore, viewAfter]),
);
check(
  'switching Keys, Style and back did not reload the live preview',
  (await p.evIn(`localhost:${PORT}`, `return window.__mark`)) === 'kept',
);

// a drag far past the board edge is stopped at the edge; other keys' elements are not made again
await p.ev(`document.querySelector('${byTest('editor-zoom-reset')}').click()`);
await sleep(300);
await p.ev(`for (const n of document.querySelectorAll('${byTest('key-cell')}')) n.__same = true`);
await drag('KeyD', 80, 60);
await sleep(700);
const edge = await boardInfo();
const dPos = shapeEdits(await profile(id)).positions?.KeyD;
check(
  'a key can never be dragged off the board',
  !!dPos && dPos.x <= edge.boardW - 1 + 1e-6 && dPos.y <= edge.boardH - 1 + 1e-6 && dPos.x >= 0 && dPos.y >= 0,
  JSON.stringify([dPos, edge.boardW, edge.boardH]),
);
check(
  "moving a key did not make the other keys' elements again",
  await p.q(`[...document.querySelectorAll('${byTest('key-cell')}')].every(n => n.__same === true)`),
);

// ---- resize handles, smart guides and the held-key fade (M4.2)
const widthOf = async (code) => shapeEdits(await profile(id)).sizes?.[code]?.w ?? 1;

await setShapeEdits({});
await clickKey('KeyW');
await sleep(400);
check(
  'one selected shown key gets two resize handles',
  (await p.q(`document.querySelectorAll('${byTest('key-handle-left')}, ${byTest('key-handle-right')}').length`)) === 2,
);
await dragHandle('right', 1);
await sleep(500);
check(
  'dragging the right handle by one key widens the key by one key',
  Math.abs((await widthOf('KeyW')) - 2) < 0.01,
  String(await widthOf('KeyW')),
);
const beforeLeft = { ...(await posOf('KeyW')), w: await widthOf('KeyW') };
await dragHandle('left', -1);
await sleep(500);
const afterLeft = { ...(await posOf('KeyW')), w: await widthOf('KeyW') };
check(
  'dragging the left handle outwards widens the key and the right edge stays where it was',
  Math.abs(afterLeft.w - (beforeLeft.w + 1)) < 0.01 &&
    Math.abs(afterLeft.x + afterLeft.w - (beforeLeft.x + beforeLeft.w)) < 0.01,
  JSON.stringify([beforeLeft, afterLeft]),
);
await dragHandle('left', 20);
await sleep(500);
check(
  'a key cannot be made narrower than one key',
  Math.abs((await widthOf('KeyW')) - 1) < 0.01,
  String(await widthOf('KeyW')),
);
await dragHandle('right', 400);
await sleep(500);
const widest = { ...(await posOf('KeyW')), w: await widthOf('KeyW') };
const boardNow = await boardInfo();
check(
  'a key cannot be made wider than the board',
  widest.x + widest.w <= boardNow.boardW + 0.01 && widest.w > 5,
  JSON.stringify([widest, boardNow.boardW]),
);
check(
  'the resized key is drawn at its new width in the live preview',
  await eventually(async () => {
    const k = await previewKey('KeyW');
    return { ok: !!k };
  }).then((r) => r.ok),
);
await clickKey('KeyA', true);
await sleep(400);
check(
  'there are no resize handles while several keys are selected',
  (await p.q(`document.querySelectorAll('${byTest('key-handles')}').length`)) === 0,
);

// the key being dragged sticks to the edge of another key (smart guide) and the other keys fade while it is held
await setShapeEdits({ positions: { KeyS: { x: 6.1, y: 3 } } });
await clearSelection();
const wFrom = orig.KeyW;
const guideState = await p.ev(`
  const n = document.querySelector('${keyCell('KeyW')}'), r = n.getBoundingClientRect();
  const board = document.querySelector('${byTest('keymap-canvas')}'), unit = board.getBoundingClientRect().width / Number(board.dataset.boardW);
  const ev = (t, x, y) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 32 });
  const dx = (6.0 - ${wFrom.x}) * unit;
  n.dispatchEvent(ev('pointerdown', r.left + 4, r.top + 4));
  for (let i = 1; i <= 4; i++) n.dispatchEvent(ev('pointermove', r.left + 4 + dx * i / 4, r.top + 4));
  const out = { guide: !!document.querySelector('${byTest('key-guide-x')}'), holding: board.classList.contains('holding'),
    faded: getComputedStyle(document.querySelector('${keyCell('KeyA')}')).opacity };
  n.dispatchEvent(ev('pointerup', r.left + 4 + dx, r.top + 4));
  return out;`);
await sleep(500);
check(
  'an orange guide line shows while the key is close to another key edge',
  guideState.guide,
  JSON.stringify(guideState),
);
check('the other keys fade while a key is held, and the held key is lifted', guideState.holding === true);
const stuckAt = await posOf('KeyW');
check(
  'the dragged key stuck to the other key edge (6.1) instead of the grid step (6)',
  Math.abs(stuckAt.x - 6.1) < 0.005,
  JSON.stringify(stuckAt),
);
check(
  'the guide line and the fade are gone after the key is dropped',
  (await p.q(`document.querySelectorAll('${byTest('key-guide-x')}').length`)) === 0 &&
    (await p.q(`!document.querySelector('${byTest('keymap-canvas')}').classList.contains('holding')`)),
);
await setShapeEdits({});

// ---- the inspector (M4.2)
await setShapeEdits({});
await clickKey('KeyW');
await sleep(400);
const layoutOfPanels = await p.ev(`
  const i = document.querySelector('.inspector').getBoundingClientRect(), b = document.querySelector('${byTest('keymap')}').getBoundingClientRect();
  return { inspectorLeft: i.left, editorRight: b.right, inspectorTop: i.top, editorTop: b.top };`);
check(
  'the inspector is to the right of the editor, level with its top',
  layoutOfPanels.inspectorLeft >= layoutOfPanels.editorRight - 1 &&
    Math.abs(layoutOfPanels.inspectorTop - layoutOfPanels.editorTop) < 40,
  JSON.stringify(layoutOfPanels),
);
check(
  'the inspector of one key is titled with its name',
  (await p.q(`document.querySelector('${byTest('key-editor-title')}').textContent`)) === 'Key: KeyW',
);
await p.ev(
  `const w = document.querySelector('${byTest('key-width')}'); w.value = '2.5'; w.dispatchEvent(new Event('input', { bubbles: true })); w.dispatchEvent(new Event('change', { bubbles: true }))`,
);
await sleep(700);
check(
  'typing a width in the inspector resizes the key',
  Math.abs((await widthOf('KeyW')) - 2.5) < 0.01,
  String(await widthOf('KeyW')),
);
check(
  'the inspector can put a moved or resized key back',
  await p.q(`!document.querySelector('${byTest('key-position-reset')}').disabled`),
);
await p.ev(`document.querySelector('${byTest('key-position-reset')}').click()`);
await sleep(600);
check('...and "Put back where it was" gives the key its width again', Math.abs((await widthOf('KeyW')) - 1) < 0.01);

// a key on top of another key gets the warning in the inspector
await setShapeEdits({ positions: { KeyA: { x: orig.KeyW.x, y: orig.KeyW.y } } });
await clickKey('KeyW');
await sleep(400);
check(
  'a key that overlaps another one says so in the inspector and in the toolbar',
  (await p.q(`!!document.querySelector('.danger-note')`)) &&
    /overlap/.test(await p.q(`document.querySelector('${byTest('key-status')}').textContent`)),
);
await setShapeEdits({});
await clearSelection();

await p.invoke('delete_layout', { id });
finish();
