// Suite: moving keys (Keys tab). Dragging, arrow-key nudging, exact X/Y fields, Tidy up, Reset positions, overlap
// warning,
// and that every move shows up in the live preview and shrinks the overlay when the layout gets more compact.
import { connect, byTest, check, finish, sleep, PORT } from '../lib/cdp.mjs';

const p = await connect();
await sleep(3500);
const tab = async (id) => {
  await p.ev(`document.querySelector('${byTest('tab', `[data-tab="${id}"]`)}').click()`);
  await sleep(400);
};
// one key on the Keys tab's picture (the hook is shared; data-code tells the keys apart)
const keyCell = (code) => byTest('key-cell', `[data-code="${code}"]`);
// the buttons that line keys up or space them evenly, by hook name
const ARRANGE_HOOKS = [
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
const shapeEdits = (savedProfile) => savedProfile.styles?.shape ?? {};
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
// save edits to the test layout's profile behind the window's back (hidden keys kept unless given)
const saveProfileEdits = async (edits) => {
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
await tab('keys');
await sleep(600);
const orig = Object.fromEntries(full.keys.filter((k) => keep.includes(k.code)).map((k) => [k.code, k]));
// wait until the live preview has drawn the layout
await eventually(async () => {
  const s = await previewSize();
  return { ok: !!s && s.w > 0, s };
});

const drag = async (code, dxUnits, dyUnits) =>
  p.ev(`
  const n = document.querySelector('${keyCell(code)}'), r = n.getBoundingClientRect(); const board = document.querySelector('${byTest('keymap-canvas')}'); const unit = board.getBoundingClientRect().width / Number(board.dataset.boardW); // screen pixels per key, whatever the zoom
  const x0 = r.left + 4, y0 = r.top + 4, ev = (t, x, y) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 7 });
  n.dispatchEvent(ev('pointerdown', x0, y0));
  for (let i = 1; i <= 4; i++) n.dispatchEvent(ev('pointermove', x0 + (${dxUnits} * unit) * i / 4, y0 + (${dyUnits} * unit) * i / 4));
  n.dispatchEvent(ev('pointerup', x0 + ${dxUnits} * unit, y0 + ${dyUnits} * unit));`);

// ---- drag
const w0 = orig.KeyW,
  before = await previewKey('KeyW');
await drag('KeyW', 1.1, 0.6);
await sleep(700);
const pw = shapeEdits(await profile(id)).positions?.KeyW;
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
const pw2 = shapeEdits(await profile(id)).positions?.KeyW;
check(
  'Right arrow nudges the selected key by a quarter key',
  !!pw2 && Math.abs(pw2.x - (pw.x + 0.25)) < 1e-6,
  JSON.stringify([pw, pw2]),
);
await p.ev(
  `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }))`,
);
await sleep(500);
check(
  'Shift + Down arrow moves it a whole key',
  Math.abs(shapeEdits(await profile(id)).positions.KeyW.y - (pw.y + 1)) < 1e-6,
);

// ---- exact fields
await p.ev(
  `const x = document.querySelector('${byTest('key-x')}'), y = document.querySelector('${byTest('key-y')}'); x.value = '4.5'; x.dispatchEvent(new Event('input', { bubbles: true })); y.value = '0.25'; y.dispatchEvent(new Event('input', { bubbles: true }));`,
);
await sleep(500);
const pw3 = shapeEdits(await profile(id)).positions?.KeyW;
check('the X / Y fields set an exact position', !!pw3 && pw3.x === 4.5 && pw3.y === 0.25, JSON.stringify(pw3));

// ---- overlap warning (use the key's real width and height)
await p.ev(
  `const x = document.querySelector('${byTest('key-x')}'), y = document.querySelector('${byTest('key-y')}'); x.value = '${orig.KeyA.x}'; x.dispatchEvent(new Event('input', { bubbles: true })); y.value = '${orig.KeyA.y}'; y.dispatchEvent(new Event('input', { bubbles: true })); x.dispatchEvent(new Event('change', { bubbles: true }));`,
);
await sleep(800);
check(
  'two keys on the same spot get the red overlap outline',
  (await p.q(`document.querySelectorAll('${byTest('key-cell', '.clash')}').length`)) >= 2,
);

// ---- Close gaps: fill the holes hidden keys leave between shown keys in a row; nothing else moves
// the Reset menu: open it, then choose one of its items by hook name
const resetMenuItem = async (hook) => {
  await p.ev(`document.querySelector('${byTest('keys-reset-menu')}').click()`);
  await sleep(250);
  await p.ev(`document.querySelector('${byTest(hook)}').click()`);
  await sleep(500);
};
await resetMenuItem('keys-reset-positions');
check(
  '"Put all keys back" puts every key back',
  Object.keys(shapeEdits(await profile(id)).positions ?? {}).length === 0,
);
const tidyAndRead = async () => {
  await p.ev(`document.querySelector('${byTest('keys-tidy')}').click()`);
  await sleep(800);
  return shapeEdits(await profile(id)).positions ?? {};
};
check(
  'with no holes (W A S D and Space, the rest hidden around them), Close gaps moves nothing: WASD keeps its shape',
  Object.keys(await tidyAndRead()).length === 0,
);
// hide S: a hole between A and D
await saveProfileEdits({ disabledKeys: [...(await profile(id)).disabledKeys, 'KeyS'] });
await p.ev(`await __ko.resync()`);
await sleep(600);
const filled = await tidyAndRead();
check(
  'with S hidden, Close gaps slides D left into the hole S left, in that row only',
  filled.KeyD?.x === orig.KeyA.x + 1 && filled.KeyD?.y === orig.KeyD.y && !filled.KeyA && !filled.KeyW && !filled.Space,
  JSON.stringify(filled),
);
check('pressing Close gaps again changes nothing', JSON.stringify(await tidyAndRead()) === JSON.stringify(filled));
await saveProfileEdits({ disabledKeys: (await profile(id)).disabledKeys.filter((code) => code !== 'KeyS') });
await p.ev(`await __ko.resync()`);
await sleep(600);
await resetMenuItem('keys-reset-positions');

// ---- selecting several keys and moving them as a group
const selectedCodes = () =>
  p.q(`[...document.querySelectorAll('${byTest('key-cell', '.sel')}')].map(n => n.dataset.code).sort()`);
const clickKey = (code, ctrl = false) =>
  p.ev(
    `document.querySelector('${keyCell(code)}').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: ${ctrl} }))`,
  );
const clickButton = (selector) => p.ev(`document.querySelector('${selector}').click()`);
// a key press on the page itself (the Keys tab shortcuts listen there)
const pressOnPage = (key, shift = false) =>
  p.ev(
    `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', shiftKey: ${shift}, bubbles: true, cancelable: true }))`,
  );
const clearSelection = async () => {
  await pressOnPage('Escape');
  await sleep(300);
};
const placeOf = async (code) =>
  (shapeEdits(await profile(id)).positions ?? {})[code] ?? { x: orig[code].x, y: orig[code].y };

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
  'the inspector says two keys are selected',
  (await p.q(`document.querySelector('${byTest('key-editor-title')}').textContent`)) === '2 keys selected',
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

await pressOnPage('ArrowRight');
await sleep(500);
const nudged = { A: await placeOf('KeyA'), S: await placeOf('KeyS') };
check(
  'the → arrow key moves the whole selection a quarter key',
  Math.abs(nudged.A.x - (groupAfter.A.x + 0.25)) < 1e-6 && Math.abs(nudged.S.x - (groupAfter.S.x + 0.25)) < 1e-6,
  JSON.stringify([groupAfter.A, nudged.A]),
);
await pressOnPage('ArrowUp', true);
await sleep(500);
const nudgedUp = { A: await placeOf('KeyA'), S: await placeOf('KeyS') };
check(
  'Shift + ↑ moves them a whole key',
  Math.abs(nudgedUp.A.y - (nudged.A.y - 1)) < 1e-6 && Math.abs(nudgedUp.S.y - (nudged.S.y - 1)) < 1e-6,
  JSON.stringify([nudged, nudgedUp]),
);

await p.ev(`document.querySelector('${byTest('key-show')}').click()`);
await sleep(500);
const hiddenNow = (await profile(id)).disabledKeys ?? [];
check('"Show these keys" hides both selected keys at once', hiddenNow.includes('KeyA') && hiddenNow.includes('KeyS'));
await p.ev(`document.querySelector('${byTest('key-show')}').click()`);
await sleep(500);
const shownAgain = (await profile(id)).disabledKeys ?? [];
check('...and shows them again', !shownAgain.includes('KeyA') && !shownAgain.includes('KeyS'));

await clickButton(byTest('key-clear-selection'));
await sleep(300);
check('Clear selection deselects everything', (await selectedCodes()).length === 0);
check(
  'with nothing selected the inspector says so and offers no key controls',
  (await p.q(`!!document.querySelector('${byTest('key-inspector-empty')}')`)) &&
    (await p.q(`!document.querySelector('${byTest('key-editor')}')`)),
);

// a box drawn on the empty background selects exactly the keys it touches (checked against the real on-screen positions)
const boxResult = await p.ev(`
  const map = document.querySelector('${byTest('keymap')}'), r = map.getBoundingClientRect();
  const x0 = r.left + 6, y0 = r.bottom - 6, x1 = r.left + r.width * 0.55, y1 = r.top + r.height * 0.25; // from the empty bottom-left corner (the zoom buttons are bottom-right)
  const ev = (t, x, y) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 9 });
  map.dispatchEvent(ev('pointerdown', x0, y0));
  for (let i = 1; i <= 4; i++) map.dispatchEvent(ev('pointermove', x0 + (x1 - x0) * i / 4, y0 + (y1 - y0) * i / 4));
  map.dispatchEvent(ev('pointerup', x1, y1));
  const L = Math.min(x0, x1), R = Math.max(x0, x1), T = Math.min(y0, y1), B = Math.max(y0, y1);
  const expected = [...document.querySelectorAll('${byTest('key-cell')}')].filter(n => { const q = n.getBoundingClientRect(); return q.left < R && q.right > L && q.top < B && q.bottom > T; }).map(n => n.dataset.code).sort();
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
  const map = document.querySelector('${byTest('keymap')}'), r = map.getBoundingClientRect();
  const ev = (t) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.bottom - 5, button: 0, pointerId: 10 });
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
          styles: { shape: { positions: { KeyA: { x: 0, y: 0 }, KeyS: { x: 1, y: 1 }, KeyD: { x: 5, y: 3 } } } },
        },
      },
    },
  },
});
await p.ev(`await __ko.resync()`);
await sleep(600);
const arrangeButton = (hook) => `document.querySelector('${byTest(hook)}')`;
await clickKey('KeyA');
await sleep(300);
check(
  'the arrange bar is not shown while only one key is selected',
  await p.q(`document.querySelector('${byTest('key-arrange-bar')}').hidden`),
);
await clickKey('KeyS', true);
await sleep(300);
check(
  'with two keys selected the arrange bar floats above them; Space evenly needs three',
  (await p.q(`!document.querySelector('${byTest('key-arrange-bar')}').hidden`)) &&
    (await p.q(`!${arrangeButton('key-align-left')}.disabled && ${arrangeButton('key-distribute-across')}.disabled`)),
);
check(
  '...and the tooltip says why',
  (await p.q(`${arrangeButton('key-distribute-across')}.title`)) === 'Select at least 3 keys first',
);
const barAbove = await p.ev(`
  const bar = document.querySelector('${byTest('key-arrange-bar')}').getBoundingClientRect();
  const a = document.querySelector('${keyCell('KeyA')}').getBoundingClientRect(), s = document.querySelector('${keyCell('KeyS')}').getBoundingClientRect();
  const top = Math.min(a.top, s.top), bottom = Math.max(a.bottom, s.bottom);
  const boxRect = document.querySelector('${byTest('keymap')}').getBoundingClientRect();
  const canvasStyle = document.querySelector('${byTest('keymap-canvas')}').style, barStyle = document.querySelector('${byTest('key-arrange-bar')}').style;
  return { bar: [bar.top, bar.bottom], keys: [top, bottom], box: [boxRect.top, boxRect.bottom], zoom: canvasStyle.getPropertyValue('--zoom'), panY: canvasStyle.getPropertyValue('--pan-y'), barY: barStyle.getPropertyValue('--bar-y') };`);
check(
  'the bar sits just above the selection (or just below it when there is no room above)',
  barAbove.bar[1] <= barAbove.keys[0] + 1 || barAbove.bar[0] >= barAbove.keys[1] - 1,
  JSON.stringify(barAbove),
);
await clickKey('KeyD', true);
await sleep(300);
check(
  'with three keys selected every arrange button is enabled',
  await p.q(
    `${JSON.stringify(ARRANGE_HOOKS.map((hook) => byTest(hook)))}.every(selector => !document.querySelector(selector).disabled)`,
  ),
);
await p.ev(`${arrangeButton('key-align-top')}.click()`);
await sleep(500);
const topAligned = { A: await placeOf('KeyA'), S: await placeOf('KeyS'), D: await placeOf('KeyD') };
check(
  'Top lines the keys up on the same row and leaves x alone',
  topAligned.A.y === 0 && topAligned.S.y === 0 && topAligned.D.y === 0 && topAligned.S.x === 1 && topAligned.D.x === 5,
  JSON.stringify(topAligned),
);
await p.ev(`${arrangeButton('key-distribute-across')}.click()`);
await sleep(500);
const spread = { A: await placeOf('KeyA'), S: await placeOf('KeyS'), D: await placeOf('KeyD') };
check(
  'Across makes the gaps equal and keeps the first and last key where they were',
  spread.A.x === 0 && spread.S.x === 2.5 && spread.D.x === 5,
  JSON.stringify(spread),
);
await p.ev(`${arrangeButton('key-align-left')}.click()`);
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
  await p.q(`!${arrangeButton('key-undo')}.disabled && ${arrangeButton('key-redo')}.disabled`),
);
await p.ev(`${arrangeButton('key-undo')}.click()`);
await sleep(600);
check(
  'Undo takes back the last Align (Left): the keys are spread out again',
  JSON.stringify(await xs()) === '[0,2.5,5]',
  JSON.stringify(await xs()),
);
await p.ev(`${arrangeButton('key-undo')}.click()`);
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
await p.ev(`${arrangeButton('key-redo')}.click()`);
await sleep(600);
check('Redo puts the spread back', JSON.stringify(await xs()) === '[0,2.5,5]', JSON.stringify(await xs()));
await p.ev(`${arrangeButton('key-redo')}.click()`);
await sleep(600);
check(
  'a second Redo puts the Left alignment back, and Redo is then disabled',
  JSON.stringify(await xs()) === '[0,0,0]' && (await p.q(`${arrangeButton('key-redo')}.disabled`)),
);

await p.ev(`${arrangeButton('key-undo')}.click()`);
await sleep(600);
await pressOnPage('ArrowRight');
await sleep(600);
check('a new change after an Undo clears Redo', await p.q(`${arrangeButton('key-redo')}.disabled`));
await p.ev(`${arrangeButton('key-undo')}.click()`);
await sleep(600);
check('Undo also takes back a nudge', JSON.stringify(await xs()) === '[0,2.5,5]', JSON.stringify(await xs()));

await p.ev(`document.querySelector('${byTest('key-show')}').click()`);
await sleep(600);
check('hiding keys is one step too...', ((await profile(id)).disabledKeys ?? []).includes('KeyD'));
await p.ev(`${arrangeButton('key-undo')}.click()`);
await sleep(600);
check('...and Undo shows them again', !((await profile(id)).disabledKeys ?? []).includes('KeyD'));

// ---- snap and grid switches, drag readout and status line
const editorChoices = async () => (await state()).settings.layout.editor;
const choicesAre = async (snap, grid) => {
  const choices = await editorChoices();
  return choices.snap === snap && choices.grid === grid;
};
const pressed = (hook) => p.q(`document.querySelector('${byTest(hook)}').getAttribute('aria-pressed') === 'true'`);
const flip = async (hook) => {
  await p.ev(`document.querySelector('${byTest(hook)}').click()`);
  await sleep(600);
};
check(
  'the Keys tab starts with quarter-key snapping and no grid',
  await choicesAre(0.25, false),
  JSON.stringify(await editorChoices()),
);
check('the Snap switch is on and the Grid switch is off', (await pressed('key-snap')) && !(await pressed('key-grid')));
await clickKey('KeyD');
await sleep(300);
await flip('key-snap');
check(
  'switching Snap off is saved in the settings',
  (await editorChoices()).snap === 0,
  JSON.stringify(await editorChoices()),
);
const beforeFree = await placeOf('KeyD');
await drag('KeyD', 0.37, 0);
await sleep(600);
const afterFree = await placeOf('KeyD');
const moved = afterFree.x - beforeFree.x;
check(
  'with Snap off a drag can land between the grid steps',
  moved > 0.2 && moved < 0.5 && Math.abs(moved * 4 - Math.round(moved * 4)) > 0.05,
  JSON.stringify([beforeFree, afterFree]),
);
await pressOnPage('ArrowRight');
await sleep(500);
const afterFine = await placeOf('KeyD');
check(
  'with Snap off an arrow key moves a fine step (0.05)',
  Math.abs(afterFine.x - (afterFree.x + 0.05)) < 1e-6,
  JSON.stringify([afterFree, afterFine]),
);

await flip('key-snap');
await flip('key-grid');
check('switching Snap on and Grid on is saved', await choicesAre(0.25, true), JSON.stringify(await editorChoices()));
check(
  'the board draws grid dots at the snap spacing',
  await p.q(
    `(() => { const s = getComputedStyle(document.querySelector('${byTest('keymap-canvas')}')); return s.backgroundImage.includes('radial-gradient') && parseFloat(s.backgroundSize) > 0; })()`,
  ),
);
await p.ev(`await __ko.resync()`);
await sleep(600);
check(
  'the switches come back after the window re-reads its settings',
  (await pressed('key-snap')) && (await pressed('key-grid')),
);

// while a key is being dragged a small label shows its position; it goes away when the key is dropped
const readoutDuring = await p.ev(`
  const n = document.querySelector('${keyCell('KeyW')}'), r = n.getBoundingClientRect(), board = document.querySelector('${byTest('keymap-canvas')}'), unit = board.getBoundingClientRect().width / Number(board.dataset.boardW);
  const ev = (t, x, y) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 11 });
  n.dispatchEvent(ev('pointerdown', r.left + 4, r.top + 4));
  n.dispatchEvent(ev('pointermove', r.left + 4 + unit, r.top + 4));
  const label = document.querySelector('${byTest('key-readout')}');
  return label ? label.textContent : null;`);
check(
  'a label with the key position follows a key while it is dragged',
  /^x [\d.-]+\s+y [\d.-]+$/.test(readoutDuring ?? ''),
  String(readoutDuring),
);
await p.ev(
  `document.querySelector('${keyCell('KeyW')}').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 11 }))`,
);
await sleep(600);
check(
  '...and it disappears when the key is dropped',
  (await p.q(`document.querySelectorAll('${byTest('key-readout')}').length`)) === 0,
);

await clickKey('KeyW');
await sleep(300);
const statusText = await p.q(`document.querySelector('${byTest('key-status')}').textContent`);
check('the toolbar shows how many keys are moved and hidden', /^\d+ moved · \d+ hidden/.test(statusText), statusText);
check(
  'the inspector shows the selected key position and width',
  await p.q(
    `document.querySelector('${byTest('key-x')}').value !== '' && document.querySelector('${byTest('key-width')}').value !== ''`,
  ),
);
await flip('key-grid');
check('snap and grid are put back for the rest of the suite', await choicesAre(0.25, false));

// ---- keyboard use and screen-reader labels
await clearSelection();
check(
  'every key is a tab stop with a button role and a spoken name',
  await p.q(
    `[...document.querySelectorAll('${byTest('key-cell')}')].every(n => n.tabIndex === 0 && n.getAttribute('role') === 'button' && n.getAttribute('aria-label').startsWith(n.dataset.code) && n.hasAttribute('aria-pressed'))`,
  ),
);
const pressOnKey = (code, extra = '') =>
  p.ev(
    `const n = document.querySelector('${keyCell(code)}'); n.focus(); n.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true${extra} }))`,
  );
await pressOnKey('KeyA');
await sleep(500);
check(
  'Enter on a focused key selects it and says so (aria-pressed)',
  JSON.stringify(await selectedCodes()) === '["KeyA"]' &&
    (await p.q(`document.querySelector('${keyCell('KeyA')}').getAttribute('aria-pressed')`)) === 'true',
);
check(
  'the keyboard focus stays on the key after the picture is redrawn',
  (await p.q(
    `document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.code : null`,
  )) === 'KeyA',
);
await pressOnKey('KeyS', ', ctrlKey: true');
await sleep(500);
check(
  'Ctrl+Enter on another key adds it to the selection',
  JSON.stringify(await selectedCodes()) === '["KeyA","KeyS"]',
);
check(
  'the spoken name says whether a key is selected',
  (await p.q(`document.querySelector('${keyCell('KeyA')}').getAttribute('aria-label')`)).includes('selected'),
);
check(
  'the toolbar groups are named for assistive technology',
  (await p.q(
    `[...document.querySelectorAll('${byTest('key-tool-group')}')].map(g => g.getAttribute('aria-label')).join('|')`,
  )) === 'History|View|Tidy',
);
check(
  'the status line is announced politely when it changes',
  (await p.q(`document.querySelector('${byTest('key-status')}').getAttribute('aria-live')`)) === 'polite',
);
await clearSelection();

// ---- keyboard shortcuts (Delete, Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y, Ctrl+A, Esc)
const press = (key, extra = '', target = 'document.body') =>
  p.ev(
    `${target}.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true, cancelable: true${extra} }))`,
  );
const hiddenKeys = async () => (await profile(id)).disabledKeys ?? [];
check(
  'the hint line lists the shortcuts',
  /Del/.test(await p.q(`document.querySelector('${byTest('keys-shortcut-hint')}').textContent`)) &&
    /Scroll/.test(await p.q(`document.querySelector('${byTest('keys-shortcut-hint')}').textContent`)) &&
    /Space \+ drag/.test(await p.q(`document.querySelector('${byTest('keys-shortcut-hint')}').textContent`)),
);
await clickKey('KeyD');
await sleep(400);
await press('Delete');
await sleep(600);
check('Delete hides the selected key', (await hiddenKeys()).includes('KeyD'));
await press('z', ', ctrlKey: true');
await sleep(600);
check('Ctrl+Z undoes it', !(await hiddenKeys()).includes('KeyD'));
await press('Z', ', ctrlKey: true, shiftKey: true');
await sleep(600);
check('Ctrl+Shift+Z redoes it', (await hiddenKeys()).includes('KeyD'));
await press('z', ', ctrlKey: true');
await sleep(600);
await press('y', ', ctrlKey: true');
await sleep(600);
check('Ctrl+Y also redoes', (await hiddenKeys()).includes('KeyD'));
await press('z', ', ctrlKey: true');
await sleep(600);
check('...and Ctrl+Z puts it back for the rest of the suite', !(await hiddenKeys()).includes('KeyD'));
await clickKey('KeyD');
await sleep(400);
await press('Delete', '', `document.querySelector('${byTest('key-label')}')`);
await sleep(500);
check('shortcuts are ignored while typing in the label field', !(await hiddenKeys()).includes('KeyD'));
await press('a', ', ctrlKey: true');
await sleep(500);
check(
  'Ctrl+A selects every key',
  (await selectedCodes()).length === (await p.q(`document.querySelectorAll('${byTest('key-cell')}').length`)),
);
await press('Escape');
await sleep(500);
check('Esc clears the selection', (await selectedCodes()).length === 0);

// ---- saved sizes and the even-grid layout style show up in the overlay (settings version 3)
const previewWidth = (code) =>
  p
    .evIn(
      `localhost:${PORT}`,
      `const e = document.querySelector('[data-code="${code}"]'); return e ? parseFloat(e.style.width) : null`,
    )
    .catch(() => null);
await saveProfileEdits({ styles: { shape: { sizes: { KeyW: { w: 3 } } } } });
const wide = await eventually(async () => {
  const [w, a] = [await previewWidth('KeyW'), await previewWidth('KeyA')];
  return { ok: !!w && !!a && Math.abs(w - (3 * (a + 6) - 6)) < 0.5, w, a };
});
check('a saved width makes the key wider in the overlay (3 keys wide)', wide.ok, JSON.stringify(wide));
check(
  'a saved width survives the app cleaning the settings',
  shapeEdits(await profile(id)).sizes?.KeyW?.w === 3,
  JSON.stringify(shapeEdits(await profile(id))),
);
await saveProfileEdits({ styles: { shape: { sizes: { KeyW: { w: 0.01 }, KeyA: { w: 1e9 }, KeyS: { w: 'wide' } } } } });
const cleanedSizes = shapeEdits(await profile(id)).sizes ?? {};
check(
  'hostile widths are clamped or dropped by the app',
  cleanedSizes.KeyW?.w === 0.25 && cleanedSizes.KeyA?.w === 100 && !cleanedSizes.KeyS,
  JSON.stringify(cleanedSizes),
);

await saveProfileEdits({ layoutStyle: 'grid' });
const gridLook = await eventually(async () => {
  const [a, s, space, aWidth] = [
    await previewKey('KeyA'),
    await previewKey('KeyS'),
    await previewWidth('Space'),
    await previewWidth('KeyA'),
  ];
  return {
    ok:
      !!a &&
      !!s &&
      !!space &&
      !!aWidth &&
      Math.abs(space - aWidth) < 0.5 &&
      Math.abs(s.left - a.left - (aWidth + 6)) < 0.5,
    a,
    s,
    space,
    aWidth,
  };
});
check('the even-grid style draws every key one key wide in neat columns', gridLook.ok, JSON.stringify(gridLook));
await saveProfileEdits({ layoutStyle: 'nonsense' });
check('an unknown layout style means the default shape', (await profile(id)).layoutStyle === undefined);
await saveProfileEdits({});

// ---- the editor board (M4.1): zoom, pan, view memory, board limits, hidden preview
const boardInfo = () =>
  p.ev(`
    const box = document.querySelector('${byTest('keymap')}'), canvas = document.querySelector('${byTest('keymap-canvas')}');
    const b = box.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    return { zoom: Number(canvas.style.getPropertyValue('--zoom')), panX: canvas.style.getPropertyValue('--pan-x'), panY: canvas.style.getPropertyValue('--pan-y'),
      label: document.querySelector('${byTest('editor-zoom-reset')}').textContent,
      boxW: b.width, boxH: b.height, left: c.left - b.left, top: c.top - b.top, right: b.right - c.right, bottom: b.bottom - c.bottom, boardW: Number(canvas.dataset.boardW), boardH: Number(canvas.dataset.boardH), w: c.width, h: c.height };`);
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
const hiddenAllButKept = full.keys.map((k) => k.code).filter((c) => !keep.includes(c));
const setShapeEdits = async (edits) => {
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
const dragHandle = (side, dxUnits) =>
  p.ev(`
    const h = document.querySelector('${byTest('key-handle-' + side)}'), r = h.getBoundingClientRect();
    const board = document.querySelector('${byTest('keymap-canvas')}'), unit = board.getBoundingClientRect().width / Number(board.dataset.boardW);
    const ev = (t, x) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: r.top + r.height / 2, button: 0, pointerId: 31 });
    const x0 = r.left + r.width / 2;
    h.dispatchEvent(ev('pointerdown', x0));
    for (let i = 1; i <= 4; i++) h.dispatchEvent(ev('pointermove', x0 + (${dxUnits} * unit) * i / 4));
    h.dispatchEvent(ev('pointerup', x0 + ${dxUnits} * unit));`);
const widthOf = async (code) => shapeEdits(await profile(id)).sizes?.[code]?.w ?? 1;
const posOf = async (code) => shapeEdits(await profile(id)).positions?.[code] ?? { x: orig[code].x, y: orig[code].y };

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
    `(() => { const c = document.querySelector('${byTest('keymap-canvas')}'); return c.classList.contains('grid-dots') && parseFloat(getComputedStyle(c).backgroundSize) > 0; })()`,
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
  `(() => { const c = document.querySelector('${byTest('keymap-canvas')}'); const s = getComputedStyle(c); return [parseFloat(s.backgroundPositionX), parseFloat(s.backgroundPositionY), parseFloat(c.style.getPropertyValue('--dot-spacing'))]; })()`,
);
check(
  'Grid dots sit on the grid lines where keys snap, not between them',
  dotOffset[0] === -dotOffset[2] / 2 && dotOffset[1] === -dotOffset[2] / 2,
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
  (await p.q(`document.querySelectorAll('[data-test^="key-handle-"]').length`)) === 4,
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
