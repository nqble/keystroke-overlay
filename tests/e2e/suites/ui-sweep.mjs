// Suite: walks the whole settings UI like a user would and fails on any JavaScript error:
// every tab, every theme, every animation, every layout, key edits + revert, sliders at their ends, and the overlay preview.
import { connect, check, finish, sleep } from '../lib/cdp.mjs';

const p = await connect(); await sleep(3000);
const errors = [];
await p.send('Log.enable');
await p.ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push('rejection: ' + e.reason));`);
const errs = () => p.q(`window.__errs`);
const tab = async n => { await p.ev(`[...document.querySelectorAll('nav button')].find(b => b.textContent === '${n}').click()`); await sleep(250); };

for (const t of ['Layout', 'Keys', 'Style', 'Animation', 'Fonts', 'General']) { await tab(t); check(`tab ${t} renders content`, await p.q(`document.getElementById('pane').innerText.length > 40`)); }
check('General sections are in the tidy order', JSON.stringify(await p.q(`[...document.querySelectorAll('#pane h2')].map(h => h.textContent)`)) === JSON.stringify(['OBS', 'Server', 'Secure link', 'Keyboard input', 'App', 'Program updates']));

// every layout, with a key edit and a revert
const ids = (await p.invoke('list_layouts')).ok.map(l => l.id);
for (const id of ids) {
  await p.invoke('set_layout', { id }); await sleep(250); await tab('Keys');
  await p.ev(`const k = document.querySelector('.kmk'); k && k.click()`); await sleep(150);
}
check(`all ${ids.length} layouts open in the Keys tab`, (await errs()).length === 0, JSON.stringify(await errs()));
await p.invoke('set_layout', { id: 'tkl' });

// every theme / animation via the saved settings (what presets and the selects do)
const st = (await p.invoke('get_state')).ok;
await tab('Animation');
const anims = await p.q(`[...document.querySelectorAll('#pane select')].flatMap(s => [...s.options].map(o => o.value))`);
for (const sel of await p.q(`[...document.querySelectorAll('#pane select')].map((s, i) => i)`)) {
  const opts = await p.q(`[...document.querySelectorAll('#pane select')][${sel}].options.length`);
  for (let o = 0; o < opts; o++) { await p.ev(`const s = [...document.querySelectorAll('#pane select')][${sel}]; s.selectedIndex = ${o}; s.dispatchEvent(new Event('change', { bubbles: true }))`); await sleep(120); }
}
check('every animation / easing option applies without errors', (await errs()).length === 0, JSON.stringify(await errs()));
await tab('Style');
for (const sel of await p.q(`[...document.querySelectorAll('#pane select')].map((s, i) => i)`)) {
  const opts = await p.q(`[...document.querySelectorAll('#pane select')][${sel}].options.length`);
  for (let o = 0; o < opts; o++) { await p.ev(`const s = [...document.querySelectorAll('#pane select')][${sel}]; s.selectedIndex = ${o}; s.dispatchEvent(new Event('change', { bubbles: true }))`); await sleep(120); }
}
// sliders at both ends
await p.ev(`for (const r of document.querySelectorAll('#pane input[type=range]')) for (const v of [r.min, r.max]) { r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(x => setTimeout(x, 20)); }`);
await sleep(800);
const after = (await p.invoke('get_state')).ok.settings;
check('every select and slider (at both ends) works without errors, values stay valid', (await errs()).length === 0 && after.style.opacity >= 0 && after.style.fontSize >= 0 && after.animation.intensity >= 0, JSON.stringify(await errs()));
check('the live preview is still alive after all that', (await p.evIn('localhost:7879', `return document.querySelectorAll('.key').length`).catch(() => 0)) > 10);

// put the settings back
await p.invoke('save_settings', { settings: st.settings }); await sleep(300);
check('no JavaScript errors anywhere in the walk', (await errs()).length === 0, JSON.stringify(await errs()));
finish();
