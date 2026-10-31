// What the four key-editor suites (tests/e2e/suites/keys-editor*.mjs) share: the connection to the app, a test layout
// like the user's (the full-size copy with only W A S D and Space left) opened on the Keys tab, and the helpers that
// drive the board and read the saved settings. Each suite runs in its own fresh app, so it imports this once.
import { connect, byTest, sleep, PORT } from './cdp.mjs';

export const p = await connect();
await sleep(3500);
export const tab = async (id) => {
  await p.ev(`document.querySelector('${byTest('tab', `[data-tab="${id}"]`)}').click()`);
  await sleep(400);
};
// one key on the Keys tab's picture (the hook is shared; data-code tells the keys apart)
export const keyCell = (code) => byTest('key-cell', `[data-code="${code}"]`);
// the buttons that line keys up or space them evenly, by hook name
export const ARRANGE_HOOKS = [
  'key-align-left',
  'key-align-center',
  'key-align-right',
  'key-align-top',
  'key-align-middle',
  'key-align-bottom',
  'key-distribute-across',
  'key-distribute-down',
];
// a layout's moved keys are saved per layout style; these tests use the default "shape" style
export const shapeEdits = (savedProfile) => savedProfile.styles?.shape ?? {};
export const state = async () => (await p.invoke('get_state')).ok;
export const profile = async (id) => (await state()).settings.layout.profiles[id] ?? {};
export const previewKey = (code) =>
  p
    .evIn(
      `localhost:${PORT}`,
      `const e = document.querySelector('[data-code="${code}"]'); return e ? { left: parseFloat(e.style.left), top: parseFloat(e.style.top) } : null`,
    )
    .catch(() => null);
export const previewSize = () => p.evIn(`localhost:${PORT}`, `return window.__size`).catch(() => null);
export const eventually = async (fn, ms = 4000) => {
  const t0 = Date.now();
  let v;
  while (Date.now() - t0 < ms) {
    v = await fn();
    if (v?.ok) return v;
    await sleep(150);
  }
  return v ?? { ok: false };
};

// ---- a layout like the user's: the full-size copy with only W A S D and Space left
export const id = (await p.invoke('create_layout', { name: 'Editor Test' })).ok;
export const keep = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];
// save edits to the test layout's profile behind the window's back (hidden keys kept unless given)
export const saveProfileEdits = async (edits) => {
  const current = (await state()).settings;
  await p.invoke('save_settings', {
    settings: {
      ...current,
      layout: {
        ...current.layout,
        profiles: {
          ...current.layout.profiles,
          [id]: { disabledKeys: current.layout.profiles[id]?.disabledKeys ?? [], labels: {}, ...edits },
        },
      },
    },
  });
};
export const full = (await p.invoke('list_layouts')).ok.find((l) => l.id === id);
export const S0 = (await state()).settings;
await p.invoke('save_settings', {
  settings: {
    ...S0,
    layout: {
      ...S0.layout,
      id,
      profiles: {
        ...S0.layout.profiles,
        [id]: { disabledKeys: full.keys.map((k) => k.code).filter((c) => !keep.includes(c)), labels: {} },
      },
    },
  },
});
// the window re-reads the settings the test just saved behind its back
await p.ev(`await __ko.resync()`);
await tab('keys');
await sleep(600);
export const orig = Object.fromEntries(full.keys.filter((k) => keep.includes(k.code)).map((k) => [k.code, k]));
// wait until the live preview has drawn the layout
await eventually(async () => {
  const s = await previewSize();
  return { ok: !!s && s.w > 0, s };
});

export const drag = async (code, dxUnits, dyUnits) =>
  p.ev(`
  const n = document.querySelector('${keyCell(code)}'), r = n.getBoundingClientRect(); const board = document.querySelector('${byTest('keymap-canvas')}'); const unit = board.getBoundingClientRect().width / Number(board.dataset.boardW); // screen pixels per key, whatever the zoom
  const x0 = r.left + 4, y0 = r.top + 4, ev = (t, x, y) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 7 });
  n.dispatchEvent(ev('pointerdown', x0, y0));
  for (let i = 1; i <= 4; i++) n.dispatchEvent(ev('pointermove', x0 + (${dxUnits} * unit) * i / 4, y0 + (${dyUnits} * unit) * i / 4));
  n.dispatchEvent(ev('pointerup', x0 + ${dxUnits} * unit, y0 + ${dyUnits} * unit));`);

// selecting keys
export const selectedCodes = () =>
  p.q(`[...document.querySelectorAll('${byTest('key-cell', '.sel')}')].map(n => n.dataset.code).sort()`);
export const clickKey = (code, ctrl = false) =>
  p.ev(
    `document.querySelector('${keyCell(code)}').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: ${ctrl} }))`,
  );
// a key press on the page itself (the Keys tab shortcuts listen there)
export const pressOnPage = (key, shift = false) =>
  p.ev(
    `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', shiftKey: ${shift}, bubbles: true, cancelable: true }))`,
  );
export const clearSelection = async () => {
  await pressOnPage('Escape');
  await sleep(300);
};
export const placeOf = async (code) =>
  (shapeEdits(await profile(id)).positions ?? {})[code] ?? { x: orig[code].x, y: orig[code].y };
export const arrangeButton = (hook) => `document.querySelector('${byTest(hook)}')`;
export const pressed = (hook) =>
  p.q(`document.querySelector('${byTest(hook)}').getAttribute('aria-pressed') === 'true'`);
export const flip = async (hook) => {
  await p.ev(`document.querySelector('${byTest(hook)}').click()`);
  await sleep(600);
};
// a key press, on the page or on a given element
export const press = (key, extra = '', target = 'document.body') =>
  p.ev(
    `${target}.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true, cancelable: true${extra} }))`,
  );
// where the board sits in its box, its zoom and pan, and its size in keys
export const boardInfo = () =>
  p.ev(`
    const box = document.querySelector('${byTest('keymap')}'), canvas = document.querySelector('${byTest('keymap-canvas')}');
    const b = box.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    return { zoom: Number(canvas.style.getPropertyValue('--zoom')), panX: canvas.style.getPropertyValue('--pan-x'), panY: canvas.style.getPropertyValue('--pan-y'),
      label: document.querySelector('${byTest('editor-zoom-reset')}').textContent,
      boxW: b.width, boxH: b.height, left: c.left - b.left, top: c.top - b.top, right: b.right - c.right, bottom: b.bottom - c.bottom, boardW: Number(canvas.dataset.boardW), boardH: Number(canvas.dataset.boardH), w: c.width, h: c.height };`);
// every key but W A S D and Space stays hidden when a test writes its own shape edits
export const hiddenAllButKept = full.keys.map((k) => k.code).filter((c) => !keep.includes(c));
export const setShapeEdits = async (edits) => {
  const current = (await state()).settings;
  await p.invoke('save_settings', {
    settings: {
      ...current,
      layout: {
        ...current.layout,
        profiles: {
          ...current.layout.profiles,
          [id]: { disabledKeys: hiddenAllButKept, labels: {}, styles: { shape: edits } },
        },
      },
    },
  });
  await p.ev(`await __ko.resync()`);
  await sleep(600);
};
export const dragHandle = (side, dxUnits) =>
  p.ev(`
    const h = document.querySelector('${byTest('key-handle-' + side)}'), r = h.getBoundingClientRect();
    const board = document.querySelector('${byTest('keymap-canvas')}'), unit = board.getBoundingClientRect().width / Number(board.dataset.boardW);
    const ev = (t, x) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: r.top + r.height / 2, button: 0, pointerId: 31 });
    const x0 = r.left + r.width / 2;
    h.dispatchEvent(ev('pointerdown', x0));
    for (let i = 1; i <= 4; i++) h.dispatchEvent(ev('pointermove', x0 + (${dxUnits} * unit) * i / 4));
    h.dispatchEvent(ev('pointerup', x0 + ${dxUnits} * unit));`);
export const posOf = async (code) =>
  shapeEdits(await profile(id)).positions?.[code] ?? { x: orig[code].x, y: orig[code].y };
