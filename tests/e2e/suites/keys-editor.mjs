// Suite: moving keys (Keys tab): dragging, arrow-key nudging, exact X/Y fields, the overlap warning, Close gaps, the Reset menu,
// selecting and moving keys as a group, align and space evenly, and undo and redo.
// The test layout and the shared helpers are in ../lib/keys-editor-kit.mjs.
import { byTest, check, sleep, finish } from '../lib/cdp.mjs';
import {
  ARRANGE_HOOKS,
  arrangeButton,
  clickKey,
  drag,
  eventually,
  id,
  keyCell,
  orig,
  p,
  placeOf,
  pressOnPage,
  previewKey,
  profile,
  saveProfileEdits,
  selectedCodes,
  shapeEdits,
  state,
} from '../lib/keys-editor-kit.mjs';

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
const clickButton = (selector) => p.ev(`document.querySelector('${selector}').click()`);

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

await p.invoke('delete_layout', { id });
finish();
