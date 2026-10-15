// Suite: moving keys (Keys tab). Dragging, arrow-key nudging, exact X/Y fields, Tidy up, Reset positions, overlap
// warning,
// and that every move shows up in the live preview and shrinks the overlay when the layout gets more compact.
import { connect, check, finish, sleep, PORT } from '../lib/cdp.mjs';

const p = await connect(); await sleep(3500);
const tab = async n => { await p.ev(`[...document.querySelectorAll('nav button')].find(b => b.textContent === '${n}').click()`); await sleep(400); };
const state = async () => (await p.invoke('get_state')).ok;
const profile = async id => (await state()).settings.layout.profiles[id] ?? {};
const previewKey = code => p.evIn(`localhost:${PORT}`, `const e = document.querySelector('[data-code="${code}"]'); return e ? { left: parseFloat(e.style.left), top: parseFloat(e.style.top) } : null`).catch(() => null);
const previewSize = () => p.evIn(`localhost:${PORT}`, `return window.__size`).catch(() => null);
const eventually = async (fn, ms = 4000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v?.ok) return v; await sleep(150); } return v ?? { ok: false }; };

// ---- a layout like the user's: the full-size copy with only W A S D and Space left
const id = (await p.invoke('create_layout', { name: 'Editor Test' })).ok;
const keep = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'];
const full = (await p.invoke('list_layouts')).ok.find(l => l.id === id);
const S0 = (await state()).settings;
await p.invoke('save_settings', { settings: { ...S0, layout: { ...S0.layout, id, profiles: { ...S0.layout.profiles, [id]: { disabledKeys: full.keys.map(k => k.code).filter(c => !keep.includes(c)), labels: {} } } } } });
// the window re-reads the settings the test just saved behind its back
await p.ev(`await resync()`);
await tab('Keys'); await sleep(600);
const orig = Object.fromEntries(full.keys.filter(k => keep.includes(k.code)).map(k => [k.code, k]));
const sizeBefore = await eventually(async () => { const s = await previewSize(); return { ok: !!s && s.w > 0, s }; });

const drag = async (code, dxUnits, dyUnits) => p.ev(`
  const n = document.querySelector('.kmk[data-code="${code}"]'); const unit = n.offsetWidth + 3, r = n.getBoundingClientRect();
  const x0 = r.left + 4, y0 = r.top + 4, ev = (t, x, y) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 7 });
  n.dispatchEvent(ev('pointerdown', x0, y0));
  for (let i = 1; i <= 4; i++) n.dispatchEvent(ev('pointermove', x0 + (${dxUnits} * unit) * i / 4, y0 + (${dyUnits} * unit) * i / 4));
  n.dispatchEvent(ev('pointerup', x0 + ${dxUnits} * unit, y0 + ${dyUnits} * unit));`);

// ---- drag
const w0 = orig.KeyW, before = await previewKey('KeyW');
await drag('KeyW', 1.1, 0.6); await sleep(700);
const pw = (await profile(id)).positions?.KeyW;
check('dragging a key saves its position, snapped to quarter steps', !!pw && Math.abs(pw.x * 4 - Math.round(pw.x * 4)) < 1e-6 && Math.abs(pw.y * 4 - Math.round(pw.y * 4)) < 1e-6 && pw.x > w0.x + 0.9 && pw.y > w0.y + 0.4, JSON.stringify(pw));
const after = await eventually(async () => { const k = await previewKey('KeyW'); return { ok: !!k && !!before && k.left > before.left, k }; });
check('the live preview moved the key straight away', after.ok, JSON.stringify([before, after.k]));
check('selecting by dragging did not hide or relabel anything', JSON.stringify((await profile(id)).labels) === '{}');

// ---- arrow keys nudge the selected key
await p.ev(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`); await sleep(500);
const pw2 = (await profile(id)).positions?.KeyW;
check('Right arrow nudges the selected key by a quarter key', !!pw2 && Math.abs(pw2.x - (pw.x + 0.25)) < 1e-6, JSON.stringify([pw, pw2]));
await p.ev(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }))`); await sleep(500);
check('Shift + Down arrow moves it a whole key', Math.abs(((await profile(id)).positions.KeyW.y) - (pw.y + 1)) < 1e-6);

// ---- exact fields
await p.ev(`const [x, y] = [...document.querySelectorAll('.editor input[type=number]')]; x.value = '4.5'; x.dispatchEvent(new Event('input', { bubbles: true })); y.value = '0.25'; y.dispatchEvent(new Event('input', { bubbles: true }));`); await sleep(500);
const pw3 = (await profile(id)).positions?.KeyW;
check('the X / Y fields set an exact position', !!pw3 && pw3.x === 4.5 && pw3.y === 0.25, JSON.stringify(pw3));

// ---- overlap warning (use the key's real width and height)
await p.ev(`const [x, y] = [...document.querySelectorAll('.editor input[type=number]')]; x.value = '${orig.KeyA.x}'; x.dispatchEvent(new Event('input', { bubbles: true })); y.value = '${orig.KeyA.y}'; y.dispatchEvent(new Event('input', { bubbles: true })); x.dispatchEvent(new Event('change', { bubbles: true }));`); await sleep(800);
check('two keys on the same spot get the red overlap outline', (await p.q(`document.querySelectorAll('.kmk.clash').length`)) >= 2);

// ---- tidy up: keep the shape, close the dead space
await p.ev(`[...document.querySelectorAll('#pane button')].find(b => b.textContent === 'Reset positions').click()`); await sleep(500);
check('Reset positions puts every key back', Object.keys((await profile(id)).positions ?? {}).length === 0);
await p.ev(`[...document.querySelectorAll('#pane button')].find(b => b.textContent === 'Tidy up').click()`); await sleep(800);
const pos = (await profile(id)).positions ?? {};
const at = c => pos[c] ?? { x: orig[c].x, y: orig[c].y };
const [W, A, Sx, D, Sp] = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].map(at);
const minX = Math.min(...[W, A, Sx, D, Sp].map(q => q.x)), minY = Math.min(...[W, A, Sx, D, Sp].map(q => q.y));
check('Tidy up moves the keys to the top-left corner', Math.abs(minX) < 1e-6 && Math.abs(minY) < 1e-6, JSON.stringify(pos));
check('Tidy up closes the empty row between WASD and the space bar', Math.abs(Sp.y - (A.y + 1)) < 1e-6, `A.y=${A.y} Space.y=${Sp.y}`);
check('Tidy up keeps the shape: W above A/S, A S D in order', W.y < A.y && A.x < Sx.x && Sx.x < D.x && W.x >= A.x - 1e-6 && W.x <= Sx.x + 1e-6, JSON.stringify({ W, A, S: Sx, D }));
const sizeAfter = await eventually(async () => { const s = await previewSize(); return { ok: !!s && !!sizeBefore.s && s.h < sizeBefore.s.h, s }; });
check('the overlay shrinks to the compact layout (smaller height than before)', sizeAfter.ok, JSON.stringify([sizeBefore.s, sizeAfter.s]));

// ---- hostile positions are cleaned by the app
const S1 = (await state()).settings;
await p.invoke('save_settings', { settings: { ...S1, layout: { ...S1.layout, profiles: { ...S1.layout.profiles, [id]: { disabledKeys: [], labels: {}, positions: { KeyW: { x: -9, y: 1e9 }, KeyA: { x: 'no', y: 1 }, KeyS: 5 } } } } } });
const cleaned = (await profile(id)).positions ?? {};
check('junk positions are clamped or dropped by the app', JSON.stringify(cleaned) === JSON.stringify({ KeyW: { x: 0, y: 100 } }), JSON.stringify(cleaned));

// ---- delete removes the layout's moved keys with it
await p.invoke('delete_layout', { id });
check('deleting the layout also removes its saved positions', !(await profile(id)).positions);
finish();
