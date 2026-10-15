// Suite: the live preview (and OBS) must follow custom layouts the moment they change.
// Regression test for: "I edited the keys of my custom layout and the preview did not update until I reopened the
// window".
// Cause was a stale layout list in the overlay: it only re-read the list on an "assets" message, which creating,
// deleting and importing layouts never sent, so a new layout was unknown to the overlay and it drew the first built-in
// one.
import { connect, check, finish, sleep, PORT } from '../lib/cdp.mjs';

const p = await connect(); await sleep(3500);
const keysInPreview = () => p.evIn(`localhost:${PORT}`, `return document.querySelectorAll('.key').length`).catch(() => -1);
const waitFor = async (fn, ms = 4000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v.ok) return v; await sleep(150); } return v; };
const hide = async (id, codes) => {
  const S = (await p.invoke('get_state')).ok.settings;
  await p.invoke('save_settings', { settings: { ...S, layout: { ...S.layout, profiles: { ...S.layout.profiles, [id]: { disabledKeys: codes, labels: {} } } } } });
};

const full = (await p.invoke('list_layouts')).ok.find(l => l.id === 'full');
const codes = full.keys.map(k => k.code);
check('the preview starts on the built-in Tenkeyless layout', (await waitFor(async () => ({ ok: (await keysInPreview()) === 87, n: await keysInPreview() }))).ok);

// ---- create: the new layout must show up, and edits to it must show immediately
const id = (await p.invoke('create_layout', { name: 'Preview Test' })).ok;
const made = await waitFor(async () => { const n = await keysInPreview(); return { ok: n === 104, n }; });
check('creating a layout switches the preview to it at once (104 keys, the full-size copy)', made.ok, `${made.n} keys`);
await hide(id, codes.slice(4));                         // hide all but 4 keys
const small = await waitFor(async () => { const n = await keysInPreview(); return { ok: n === 4, n }; });
check('hiding keys of the new custom layout updates the preview right away (4 keys left)', small.ok, `${small.n} keys`);
await hide(id, codes.slice(10));
const ten = await waitFor(async () => { const n = await keysInPreview(); return { ok: n === 10, n }; });
check('editing them again keeps it live (10 keys)', ten.ok, `${ten.n} keys`);

// ---- delete: the preview falls back to a built-in layout without a reload
await p.invoke('delete_layout', { id });
const back = await waitFor(async () => { const n = await keysInPreview(); return { ok: n === 87, n }; });
check('deleting the layout puts the preview back on Tenkeyless (87 keys)', back.ok, `${back.n} keys`);
finish();
