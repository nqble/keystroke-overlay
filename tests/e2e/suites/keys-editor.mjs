// Suite: moving keys (Keys tab). Dragging, arrow-key nudging, exact X/Y fields, Tidy up, Reset positions, overlap
// warning,
// and that every move shows up in the live preview and shrinks the overlay when the layout gets more compact.
import { connect, check, finish, sleep, PORT } from '../lib/cdp.mjs';

const p = await connect();
await sleep(3500);
const tab = async (n) => {
  await p.ev(`[...document.querySelectorAll('nav button')].find(b => b.textContent === '${n}').click()`);
  await sleep(400);
};
const state = async () => (await p.invoke('get_state')).ok;
const profile = async (id) => (await state()).settings.layout.profiles[id] ?? {};
const previewKey = (code) =>
  p
    .evIn(
      `localhost:${PORT}`,
      `const e = document.querySelector('[data-code="${code}"]'); return e ? { left: parseFloat(e.style.left), top: parseFloat(e.style.top) } : null`,
    )
    .catch(() => null);
const previewSize = () => p.evIn(`localhost:${PORT}`, `return window.__size`).catch(() => null);
const eventually = async (fn, ms = 4000) => {
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
const id = (await p.invoke('create_layout', { name: 'Editor Test' })).ok;
const keep = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];
const full = (await p.invoke('list_layouts')).ok.find((l) => l.id === id);
const S0 = (await state()).settings;
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
await tab('Keys');
await sleep(600);
const orig = Object.fromEntries(full.keys.filter((k) => keep.includes(k.code)).map((k) => [k.code, k]));
const sizeBefore = await eventually(async () => {
  const s = await previewSize();
  return { ok: !!s && s.w > 0, s };
});

const drag = async (code, dxUnits, dyUnits) =>
  p.ev(`
  const n = document.querySelector('.kmk[data-code="${code}"]'); const unit = n.offsetWidth + 3, r = n.getBoundingClientRect();
  const x0 = r.left + 4, y0 = r.top + 4, ev = (t, x, y) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 7 });
  n.dispatchEvent(ev('pointerdown', x0, y0));
  for (let i = 1; i <= 4; i++) n.dispatchEvent(ev('pointermove', x0 + (${dxUnits} * unit) * i / 4, y0 + (${dyUnits} * unit) * i / 4));
  n.dispatchEvent(ev('pointerup', x0 + ${dxUnits} * unit, y0 + ${dyUnits} * unit));`);

// ---- drag
const w0 = orig.KeyW,
  before = await previewKey('KeyW');
await drag('KeyW', 1.1, 0.6);
await sleep(700);
const pw = (await profile(id)).positions?.KeyW;
check(
  'dragging a key saves its position, snapped to quarter steps',
  !!pw &&
    Math.abs(pw.x * 4 - Math.round(pw.x * 4)) < 1e-6 &&
    Math.abs(pw.y * 4 - Math.round(pw.y * 4)) < 1e-6 &&
    pw.x > w0.x + 0.9 &&
    pw.y > w0.y + 0.4,
  JSON.stringify(pw),
);
const after = await eventually(async () => {
  const k = await previewKey('KeyW');
  return { ok: !!k && !!before && k.left > before.left, k };
});
check('the live preview moved the key straight away', after.ok, JSON.stringify([before, after.k]));
check('selecting by dragging did not hide or relabel anything', JSON.stringify((await profile(id)).labels) === '{}');

// ---- arrow keys nudge the selected key
await p.ev(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
await sleep(500);
const pw2 = (await profile(id)).positions?.KeyW;
check(
  'Right arrow nudges the selected key by a quarter key',
  !!pw2 && Math.abs(pw2.x - (pw.x + 0.25)) < 1e-6,
  JSON.stringify([pw, pw2]),
);
await p.ev(
  `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }))`,
);
await sleep(500);
check('Shift + Down arrow moves it a whole key', Math.abs((await profile(id)).positions.KeyW.y - (pw.y + 1)) < 1e-6);

// ---- exact fields
await p.ev(
  `const [x, y] = [...document.querySelectorAll('.editor input[type=number]')]; x.value = '4.5'; x.dispatchEvent(new Event('input', { bubbles: true })); y.value = '0.25'; y.dispatchEvent(new Event('input', { bubbles: true }));`,
);
await sleep(500);
const pw3 = (await profile(id)).positions?.KeyW;
check('the X / Y fields set an exact position', !!pw3 && pw3.x === 4.5 && pw3.y === 0.25, JSON.stringify(pw3));

// ---- overlap warning (use the key's real width and height)
await p.ev(
  `const [x, y] = [...document.querySelectorAll('.editor input[type=number]')]; x.value = '${orig.KeyA.x}'; x.dispatchEvent(new Event('input', { bubbles: true })); y.value = '${orig.KeyA.y}'; y.dispatchEvent(new Event('input', { bubbles: true })); x.dispatchEvent(new Event('change', { bubbles: true }));`,
);
await sleep(800);
check(
  'two keys on the same spot get the red overlap outline',
  (await p.q(`document.querySelectorAll('.kmk.clash').length`)) >= 2,
);

// ---- tidy up: keep the shape, close the dead space
await p.ev(`[...document.querySelectorAll('#pane button')].find(b => b.textContent === 'Reset positions').click()`);
await sleep(500);
check('Reset positions puts every key back', Object.keys((await profile(id)).positions ?? {}).length === 0);
await p.ev(`[...document.querySelectorAll('#pane button')].find(b => b.textContent === 'Tidy up').click()`);
await sleep(800);
const pos = (await profile(id)).positions ?? {};
const at = (c) => pos[c] ?? { x: orig[c].x, y: orig[c].y };
const [W, A, Sx, D, Sp] = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].map(at);
const minX = Math.min(...[W, A, Sx, D, Sp].map((q) => q.x)),
  minY = Math.min(...[W, A, Sx, D, Sp].map((q) => q.y));
check(
  'Tidy up moves the keys to the top-left corner',
  Math.abs(minX) < 1e-6 && Math.abs(minY) < 1e-6,
  JSON.stringify(pos),
);
check(
  'Tidy up closes the empty row between WASD and the space bar',
  Math.abs(Sp.y - (A.y + 1)) < 1e-6,
  `A.y=${A.y} Space.y=${Sp.y}`,
);
check(
  'Tidy up keeps the shape: W above A/S, A S D in order',
  W.y < A.y && A.x < Sx.x && Sx.x < D.x && W.x >= A.x - 1e-6 && W.x <= Sx.x + 1e-6,
  JSON.stringify({ W, A, S: Sx, D }),
);
const sizeAfter = await eventually(async () => {
  const s = await previewSize();
  return { ok: !!s && !!sizeBefore.s && s.h < sizeBefore.s.h, s };
});
check(
  'the overlay shrinks to the compact layout (smaller height than before)',
  sizeAfter.ok,
  JSON.stringify([sizeBefore.s, sizeAfter.s]),
);

// ---- selecting several keys and moving them as a group
const selectedCodes = () => p.q(`[...document.querySelectorAll('.kmk.sel')].map(n => n.dataset.code).sort()`);
const clickKey = (code, ctrl = false) =>
  p.ev(
    `document.querySelector('.kmk[data-code="${code}"]').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: ${ctrl} }))`,
  );
const clickButton = (selector) => p.ev(`document.querySelector('${selector}').click()`);
const placeOf = async (code) => ((await profile(id)).positions ?? {})[code] ?? { x: orig[code].x, y: orig[code].y };

await clickKey('KeyA');
await sleep(300);
check('a plain click selects one key', JSON.stringify(await selectedCodes()) === '["KeyA"]');
await clickKey('KeyS', true);
await sleep(300);
check(
  'Ctrl-click adds a second key to the selection',
  JSON.stringify(await selectedCodes()) === '["KeyA","KeyS"]',
  JSON.stringify(await selectedCodes()),
);
check(
  'the toolbar and the panel say two keys are selected',
  (await p.q(`document.querySelector('.sel-summary').textContent`)) === '2 keys selected' &&
    (await p.q(`document.querySelector('.editor b').textContent`)) === '2 keys selected',
);

const groupBefore = {
  A: await placeOf('KeyA'),
  S: await placeOf('KeyS'),
  D: await placeOf('KeyD'),
  W: await placeOf('KeyW'),
};
await drag('KeyA', 1, 1);
await sleep(700);
const groupAfter = {
  A: await placeOf('KeyA'),
  S: await placeOf('KeyS'),
  D: await placeOf('KeyD'),
  W: await placeOf('KeyW'),
};
const moveA = { x: groupAfter.A.x - groupBefore.A.x, y: groupAfter.A.y - groupBefore.A.y };
const moveS = { x: groupAfter.S.x - groupBefore.S.x, y: groupAfter.S.y - groupBefore.S.y };
check(
  'dragging one selected key moves the whole selection by the same amount',
  moveA.x > 0.7 && moveA.y > 0.7 && Math.abs(moveA.x - moveS.x) < 1e-6 && Math.abs(moveA.y - moveS.y) < 1e-6,
  JSON.stringify({ moveA, moveS }),
);
check(
  'keys that were not selected stayed where they were',
  JSON.stringify([groupAfter.D, groupAfter.W]) === JSON.stringify([groupBefore.D, groupBefore.W]),
);

await clickButton('.keytools button[title^="Move right"]');
await sleep(500);
const nudged = { A: await placeOf('KeyA'), S: await placeOf('KeyS') };
check(
  'the → button moves the whole selection a quarter key',
  Math.abs(nudged.A.x - (groupAfter.A.x + 0.25)) < 1e-6 && Math.abs(nudged.S.x - (groupAfter.S.x + 0.25)) < 1e-6,
  JSON.stringify([groupAfter.A, nudged.A]),
);
await clickButton('#nudgeWhole');
await clickButton('.keytools button[title^="Move up"]');
await sleep(500);
const nudgedUp = { A: await placeOf('KeyA'), S: await placeOf('KeyS') };
check(
  'with "Whole key" ticked the ↑ button moves them a whole key',
  Math.abs(nudgedUp.A.y - (nudged.A.y - 1)) < 1e-6 && Math.abs(nudgedUp.S.y - (nudged.S.y - 1)) < 1e-6,
  JSON.stringify([nudged, nudgedUp]),
);

await p.ev(`document.querySelector('.editor input[type=checkbox]').click()`);
await sleep(500);
const hiddenNow = (await profile(id)).disabledKeys ?? [];
check('"Show these keys" hides both selected keys at once', hiddenNow.includes('KeyA') && hiddenNow.includes('KeyS'));
await p.ev(`document.querySelector('.editor input[type=checkbox]').click()`);
await sleep(500);
const shownAgain = (await profile(id)).disabledKeys ?? [];
check('...and shows them again', !shownAgain.includes('KeyA') && !shownAgain.includes('KeyS'));

await clickButton('.keytools .toolgroup .btns button');
await sleep(300);
check('Clear selection deselects everything', (await selectedCodes()).length === 0);
check(
  'the nudge buttons are disabled while nothing is selected',
  await p.q(`[...document.querySelectorAll('.keytools button.nudge')].every(b => b.disabled)`),
);

// a box drawn on the empty background selects exactly the keys it touches (checked against the real on-screen positions)
const boxResult = await p.ev(`
  const map = document.querySelector('.keymap'), r = map.getBoundingClientRect();
  const x0 = r.right - 6, y0 = r.bottom - 6, x1 = r.left + r.width * 0.55, y1 = r.top + r.height * 0.55;
  const ev = (t, x, y) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 9 });
  map.dispatchEvent(ev('pointerdown', x0, y0));
  for (let i = 1; i <= 4; i++) map.dispatchEvent(ev('pointermove', x0 + (x1 - x0) * i / 4, y0 + (y1 - y0) * i / 4));
  map.dispatchEvent(ev('pointerup', x1, y1));
  const L = Math.min(x0, x1), R = Math.max(x0, x1), T = Math.min(y0, y1), B = Math.max(y0, y1);
  const expected = [...document.querySelectorAll('.kmk')].filter(n => { const q = n.getBoundingClientRect(); return q.left < R && q.right > L && q.top < B && q.bottom > T; }).map(n => n.dataset.code).sort();
  return { expected };`);
await sleep(400);
const boxed = await selectedCodes();
check(
  'dragging a box on the background selects exactly the keys it touches',
  boxResult.expected.length > 0 &&
    boxResult.expected.length < 104 &&
    JSON.stringify(boxed) === JSON.stringify(boxResult.expected),
  `${boxed.length} selected, ${boxResult.expected.length} expected`,
);
await p.ev(`
  const map = document.querySelector('.keymap'), r = map.getBoundingClientRect();
  const ev = (t) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: r.right - 5, clientY: r.bottom - 5, button: 0, pointerId: 10 });
  map.dispatchEvent(ev('pointerdown')); map.dispatchEvent(ev('pointerup'));`);
await sleep(400);
check('clicking the empty background clears the selection', (await selectedCodes()).length === 0);

// ---- align and space evenly
const S2 = (await state()).settings;
await p.invoke('save_settings', {
  settings: {
    ...S2,
    layout: {
      ...S2.layout,
      profiles: {
        ...S2.layout.profiles,
        [id]: {
          ...S2.layout.profiles[id],
          positions: { KeyA: { x: 0, y: 0 }, KeyS: { x: 1, y: 1 }, KeyD: { x: 5, y: 3 } },
        },
      },
    },
  },
});
await p.ev(`await __ko.resync()`);
await sleep(600);
const arrangeButton = (label) =>
  `[...document.querySelectorAll('.keytools .toolgroup button')].find(b => b.textContent === '${label}')`;
await clickKey('KeyA');
await sleep(300);
check(
  'align and space-evenly buttons are disabled until enough keys are selected',
  await p.q(`${arrangeButton('Left')}.disabled && ${arrangeButton('Across')}.disabled`),
);
check(
  '...and the tooltip says why',
  (await p.q(`${arrangeButton('Left')}.title`)) === 'Select at least 2 keys first' &&
    (await p.q(`${arrangeButton('Across')}.title`)) === 'Select at least 3 keys first',
);
await clickKey('KeyS', true);
await clickKey('KeyD', true);
await sleep(300);
check(
  'with three keys selected every arrange button is enabled',
  await p.q(
    `[...document.querySelectorAll('.keytools .toolgroup button')].filter(b => ['Left','Centre','Right','Top','Middle','Bottom','Across','Down'].includes(b.textContent)).every(b => !b.disabled)`,
  ),
);
await p.ev(`${arrangeButton('Top')}.click()`);
await sleep(500);
const topAligned = { A: await placeOf('KeyA'), S: await placeOf('KeyS'), D: await placeOf('KeyD') };
check(
  'Top lines the keys up on the same row and leaves x alone',
  topAligned.A.y === 0 && topAligned.S.y === 0 && topAligned.D.y === 0 && topAligned.S.x === 1 && topAligned.D.x === 5,
  JSON.stringify(topAligned),
);
await p.ev(`${arrangeButton('Across')}.click()`);
await sleep(500);
const spread = { A: await placeOf('KeyA'), S: await placeOf('KeyS'), D: await placeOf('KeyD') };
check(
  'Across makes the gaps equal and keeps the first and last key where they were',
  spread.A.x === 0 && spread.S.x === 2.5 && spread.D.x === 5,
  JSON.stringify(spread),
);
await p.ev(`${arrangeButton('Left')}.click()`);
await sleep(500);
const leftAligned = { A: await placeOf('KeyA'), S: await placeOf('KeyS'), D: await placeOf('KeyD') };
check(
  'Left puts all three on the same column',
  leftAligned.A.x === 0 && leftAligned.S.x === 0 && leftAligned.D.x === 0,
  JSON.stringify(leftAligned),
);
check(
  'the live preview shows the aligned keys',
  await (async () => {
    const [a, s] = [await previewKey('KeyA'), await previewKey('KeyS')];
    return !!a && !!s && Math.abs(a.left - s.left) < 1;
  })(),
);

// ---- undo and redo (the steps above are all in the history now)
const xs = async () => [(await placeOf('KeyA')).x, (await placeOf('KeyS')).x, (await placeOf('KeyD')).x];
check(
  'after the earlier changes Undo is available and Redo is not',
  await p.q(`!${arrangeButton('Undo')}.disabled && ${arrangeButton('Redo')}.disabled`),
);
await p.ev(`${arrangeButton('Undo')}.click()`);
await sleep(600);
check(
  'Undo takes back the last Align (Left): the keys are spread out again',
  JSON.stringify(await xs()) === '[0,2.5,5]',
  JSON.stringify(await xs()),
);
await p.ev(`${arrangeButton('Undo')}.click()`);
await sleep(600);
check(
  'a second Undo takes back the Space evenly step',
  JSON.stringify(await xs()) === '[0,1,5]',
  JSON.stringify(await xs()),
);
check(
  'the live preview follows an undo',
  await (async () => {
    const [s, d] = [await previewKey('KeyS'), await previewKey('KeyD')];
    return !!s && !!d && d.left > s.left;
  })(),
);
await p.ev(`${arrangeButton('Redo')}.click()`);
await sleep(600);
check('Redo puts the spread back', JSON.stringify(await xs()) === '[0,2.5,5]', JSON.stringify(await xs()));
await p.ev(`${arrangeButton('Redo')}.click()`);
await sleep(600);
check(
  'a second Redo puts the Left alignment back, and Redo is then disabled',
  JSON.stringify(await xs()) === '[0,0,0]' && (await p.q(`${arrangeButton('Redo')}.disabled`)),
);

await p.ev(`${arrangeButton('Undo')}.click()`);
await sleep(600);
await p.ev(`document.querySelector('.keytools button[title^="Move right"]').click()`);
await sleep(600);
check('a new change after an Undo clears Redo', await p.q(`${arrangeButton('Redo')}.disabled`));
await p.ev(`${arrangeButton('Undo')}.click()`);
await sleep(600);
check('Undo also takes back a nudge', JSON.stringify(await xs()) === '[0,2.5,5]', JSON.stringify(await xs()));

await p.ev(`document.querySelector('.editor input[type=checkbox]').click()`);
await sleep(600);
check('hiding keys is one step too...', ((await profile(id)).disabledKeys ?? []).includes('KeyD'));
await p.ev(`${arrangeButton('Undo')}.click()`);
await sleep(600);
check('...and Undo shows them again', !((await profile(id)).disabledKeys ?? []).includes('KeyD'));

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
          positions: { KeyW: { x: -9, y: 1e9 }, KeyA: { x: 'no', y: 1 }, KeyS: 5 },
        },
      },
    },
  },
});
const cleaned = (await profile(id)).positions ?? {};
check(
  'junk positions are clamped or dropped by the app',
  JSON.stringify(cleaned) === JSON.stringify({ KeyW: { x: 0, y: 100 } }),
  JSON.stringify(cleaned),
);

// ---- delete removes the layout's moved keys with it
await p.invoke('delete_layout', { id });
check('deleting the layout also removes its saved positions', !(await profile(id)).positions);
finish();
