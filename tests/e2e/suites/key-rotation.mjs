// Suite: turning keys (key rotation, docs/proposals/key-rotation.md). The round handle with and without Snap, the
// Angle field, Undo and Put back, no turning in the Even grid, and the live preview drawing a turned key. The maths has
// unit tests (tests/ui/keys-turn.test.mjs, key-angles.test.mjs, turn.test.mjs); this checks the real window.
import { connect, byTest, check, finish, sleep, PORT } from '../lib/cdp.mjs';

const p = await connect();
await sleep(3500);
const keyCell = (code) => byTest('key-cell', `[data-code="${code}"]`);
const state = async () => (await p.invoke('get_state')).ok;
const profile = async (id) => (await state()).settings.layout.profiles[id] ?? {};
const angleOf = async (id, code) => (await profile(id)).styles?.shape?.rotations?.[code];
const click = (selector) => p.ev(`document.querySelector('${selector}').click()`);
const clickKey = (code) =>
  p.ev(`document.querySelector('${keyCell(code)}').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
const count = (selector) => p.q(`document.querySelectorAll('${selector}').length`);
const previewAngle = (code) =>
  p
    .evIn(
      `localhost:${PORT}`,
      `return document.querySelector('.key[data-code="${code}"]')?.style.getPropertyValue('--r')`,
    )
    .catch(() => null);
const previewSize = () => p.evIn(`localhost:${PORT}`, `return window.__size`).catch(() => null);

/** Drag the turning handle around the key's center by `degrees` (clockwise), in small steps like a real hand. */
const turnByHandle = (degrees) =>
  p.ev(`
    const h = document.querySelector('${byTest('key-handle-turn')}'), hr = h.getBoundingClientRect();
    const k = document.querySelector('${keyCell('KeyW')}'), kr = k.getBoundingClientRect();
    const cx = kr.left + kr.width / 2, cy = kr.top + kr.height / 2;
    const sx = hr.left + hr.width / 2, sy = hr.top + hr.height / 2;
    const radius = Math.hypot(sx - cx, sy - cy), start = Math.atan2(sy - cy, sx - cx);
    const at = (degrees) => ({ x: cx + radius * Math.cos(start + degrees * Math.PI / 180), y: cy + radius * Math.sin(start + degrees * Math.PI / 180) });
    const ev = (t, point) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, button: 0, pointerId: 41 });
    h.dispatchEvent(ev('pointerdown', at(0)));
    for (let i = 1; i <= 8; i++) h.dispatchEvent(ev('pointermove', at(${degrees} * i / 8)));
    h.dispatchEvent(ev('pointerup', at(${degrees})));`);

/** Type an angle into the key's Angle field, the way a person does (input while typing, change when done). */
const typeAngle = (value) =>
  p.ev(
    `const f = document.querySelector('${byTest('key-angle')}'); f.value = '${value}'; f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true }))`,
  );

// ---- a layout of our own (a copy of the full-size keyboard), on the Keys tab, Keyboard shape style
const id = (await p.invoke('create_layout', { name: 'Rotation Test' })).ok;
const S0 = (await state()).settings;
await p.invoke('save_settings', {
  settings: { ...S0, layout: { ...S0.layout, id, editor: { ...S0.layout.editor, snap: 0.25 } } },
});
await p.ev(`await __ko.resync()`);
await p.ev(`document.querySelector('${byTest('tab', '[data-tab="keys"]')}').click()`);
await sleep(1200);
const sizeBefore = await previewSize();

// ---- the handle
await clickKey('KeyW');
await sleep(400);
check('one selected key gets a round turning handle', (await count(byTest('key-handle-turn'))) === 1);
check('...and an Angle field', (await count(byTest('key-angle'))) === 1);
await turnByHandle(40);
await sleep(600);
check(
  'with Snap on, turning the handle 40 degrees lands on 45',
  (await angleOf(id, 'KeyW')) === 45,
  String(await angleOf(id, 'KeyW')),
);
check(
  'the Angle field shows the new angle',
  (await p.q(`document.querySelector('${byTest('key-angle')}').value`)) === '45',
);
await click(byTest('key-snap'));
await sleep(300);
await turnByHandle(-12);
await sleep(600);
const loose = await angleOf(id, 'KeyW');
check('with Snap off the handle turns in whole degrees', Math.abs(loose - 33) <= 1, String(loose));
await click(byTest('key-snap'));
await sleep(300);

// ---- the field, Undo and Put back
await typeAngle(30);
await sleep(600);
check('typing an angle turns the key', (await angleOf(id, 'KeyW')) === 30, String(await angleOf(id, 'KeyW')));
const drawn = await (async () => {
  for (let i = 0; i < 20; i++) {
    if ((await previewAngle('KeyW')) === '30deg') return true;
    await sleep(200);
  }
  return false;
})();
check('the live preview draws the key turned', drawn, String(await previewAngle('KeyW')));
const sizeTurned = await previewSize();
check(
  '...and the overlay still holds the whole keyboard',
  !!sizeTurned && sizeTurned.h >= sizeBefore.h,
  JSON.stringify([sizeBefore, sizeTurned]),
);
await click(byTest('key-undo'));
await sleep(600);
check(
  'Undo puts the previous angle back',
  Math.abs((await angleOf(id, 'KeyW')) - loose) < 0.01,
  String(await angleOf(id, 'KeyW')),
);
await clickKey('KeyW');
await sleep(400);
await click(byTest('key-position-reset'));
await sleep(600);
check('"Put back where it was" straightens the key', (await angleOf(id, 'KeyW')) === undefined);

// ---- not in the Even grid
await typeAngle(15);
await sleep(500);
await click(byTest('layout-style-grid'));
await sleep(800);
await clickKey('KeyW');
await sleep(400);
check(
  'the Even grid has no turning handle and no Angle field',
  (await count(byTest('key-handle-turn'))) === 0 && (await count(byTest('key-angle'))) === 0,
);
check(
  '...and draws the key straight',
  (await p.q(`document.querySelector('${keyCell('KeyW')}').style.getPropertyValue('--r')`)) === '0deg',
);
await click(byTest('layout-style-shape'));
await sleep(800);
check('back in Keyboard shape, the key is turned again', (await angleOf(id, 'KeyW')) === 15);

await p.invoke('delete_layout', { id });
finish();
