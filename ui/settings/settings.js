// Settings window. Plain JS, no build step.
//
// HOW TO ADD A SETTING (UI side): add a descriptor to CONTROLS below
// ({ tab, group, path, type, label, ... }); it is rendered automatically.
// Also add the default value in src-tauri/src/settings.rs and (if the overlay
// uses it) read it in ui/overlay/overlay.js.
const { invoke } = window.__TAURI__.core;
const $ = (s, el = document) => el.querySelector(s);

let S = null;                 // current settings (mirrors the Rust side)
let layouts = [];             // [{id,name,keys}]
let reg = { animations: [], themes: [], easings: [], layouts: [] };
let tab = 'layout';
let selKey = null;            // selected key in the Keys tab
let obsUrl = '', size = null, appVersion = '', lastUpdate = null, paused = false, upProg = null, inputActive = 'hook', inputError = null;

// ------------------------------------------------------------------ helpers
const get = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const put = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k != null) e.append(k);
  return e;
}
function toast(msg, err = false) {
  const t = $('#toast'); t.textContent = msg; t.className = err ? 'err' : ''; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
}
const call = async (cmd, args) => { try { return await invoke(cmd, args); } catch (e) { toast(String(e), true); throw e; } };

// ------------------------------------------------------------------ live sync
const frame = $('#preview');
let saveTimer = 0;
function push() { frame.contentWindow?.postMessage({ type: 'cfg', settings: S }, '*'); }
function changed(rebuildUi = false, immediate = false) {
  push();
  clearTimeout(saveTimer);
  if (immediate) { saveTimer = 0; call('save_settings', { settings: S }); }   // switches/toggles: no delay at all
  else saveTimer = setTimeout(() => { saveTimer = 0; call('save_settings', { settings: S }); }, 150);   // sliders/typing: batch
  if (rebuildUi) render();
}

// Every layout keeps its own disabled keys + labels in S.layout.profiles[layoutId]; edits save automatically.
const curLayout = () => layouts.find(l => l.id === S.layout.id) ?? layouts[0];
const viewProf = () => S.layout.profiles[curLayout()?.id] ?? { disabledKeys: [], labels: {} };   // read-only view
const editProf = () => (S.layout.profiles[curLayout().id] ??= { disabledKeys: [], labels: {} });  // creates on first edit
function tidyProf() {   // drop empty profiles so "customized" only shows when something differs from default
  const id = curLayout().id, p = S.layout.profiles[id];
  if (p && !p.disabledKeys.length && !Object.keys(p.labels).length) delete S.layout.profiles[id];
}
const isCustom = id => { const p = S.layout.profiles[id]; return !!p && (p.disabledKeys.length > 0 || Object.keys(p.labels).length > 0); };

// Closing the window destroys it, so flush any pending save first.
function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; invoke('save_settings', { settings: S }); } }
addEventListener('pagehide', flush);
addEventListener('beforeunload', flush);

// ------------------------------------------------------------------ controls
const COMMON_FONTS = ['Segoe UI', 'Arial', 'Consolas', 'Courier New', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Impact', 'Comic Sans MS', 'Bahnschrift', 'Cascadia Mono'];
const CONTROLS = [
  { tab: 'style', group: 'Key colors', path: 'style.keyFill', type: 'color', label: 'Fill (idle)' },
  { tab: 'style', group: 'Key colors', path: 'style.keyFillPressed', type: 'color', label: 'Fill (pressed)' },
  { tab: 'style', group: 'Key colors', path: 'style.borderColor', type: 'color', label: 'Border (idle)' },
  { tab: 'style', group: 'Key colors', path: 'style.borderColorPressed', type: 'color', label: 'Border (pressed)' },
  { tab: 'style', group: 'Key colors', path: 'style.glowColor', type: 'color', label: 'Glow color' },
  { tab: 'style', group: 'Shape', path: 'style.borderWidth', type: 'range', min: 0, max: 10, step: 1, unit: 'px', label: 'Border thickness' },
  { tab: 'style', group: 'Shape', path: 'style.radius', type: 'range', min: 0, max: 40, step: 1, unit: 'px', label: 'Corner radius' },
  { tab: 'style', group: 'Shape', path: 'style.glowSize', type: 'range', min: 0, max: 60, step: 1, unit: 'px', label: 'Glow size' },
  { tab: 'style', group: 'Text', path: 'style.fontFamily', type: 'font', label: 'Font family' },
  { tab: 'style', group: 'Text', path: 'style.fontSize', type: 'range', min: 0, max: 48, step: 1, unit: 'px', label: 'Font size' },
  { tab: 'style', group: 'Text', path: 'style.fontWeight', type: 'range', min: 100, max: 900, step: 100, label: 'Font weight' },
  { tab: 'style', group: 'Text', path: 'style.textColor', type: 'color', label: 'Text (idle)' },
  { tab: 'style', group: 'Text', path: 'style.textColorPressed', type: 'color', label: 'Text (pressed)' },
  { tab: 'style', group: 'Size', path: 'style.keySize', type: 'range', min: 24, max: 120, step: 1, unit: 'px', label: 'Key size' },
  { tab: 'style', group: 'Size', path: 'style.gap', type: 'range', min: 0, max: 24, step: 1, unit: 'px', label: 'Key spacing' },
  { tab: 'style', group: 'Size', path: 'style.scale', type: 'range', min: 0.3, max: 3, step: 0.05, unit: '×', label: 'Overall scale' },
  { tab: 'style', group: 'Size', path: 'style.opacity', type: 'range', min: 0, max: 1, step: 0.05, label: 'Opacity' },

  { tab: 'animation', group: 'Animation', path: 'animation.type', type: 'select', options: () => reg.animations.map(a => [a.id, a.name]), label: 'Type' },
  { tab: 'animation', group: 'Animation', path: 'animation.speed', type: 'range', min: 0, max: 600, step: 10, unit: 'ms', label: 'Speed (duration)' },
  { tab: 'animation', group: 'Animation', path: 'animation.easing', type: 'select', options: () => [['default', 'Animation default'], ...reg.easings.map(e => [e.id, e.name])], label: 'Easing' },
  { tab: 'animation', group: 'Animation', path: 'animation.intensity', type: 'range', min: 0, max: 2.5, step: 0.1, unit: '×', label: 'Intensity' },
];

function colorCtl(c) {
  const v = get(S, c.path) || '#000000ff';
  const hex = v.slice(0, 7), a = v.length >= 9 ? parseInt(v.slice(7, 9), 16) : 255;
  const pick = el('input', { type: 'color', value: hex });
  const alpha = el('input', { type: 'range', min: 0, max: 255, step: 1, value: a, title: 'Transparency' });
  const num = el('span', { className: 'val', textContent: Math.round(a / 2.55) + '%' });
  const upd = () => {
    const h = Math.round(+alpha.value).toString(16).padStart(2, '0');
    put(S, c.path, pick.value + h); num.textContent = Math.round(alpha.value / 2.55) + '%'; changed();
  };
  pick.oninput = alpha.oninput = upd;
  return [pick, alpha, num];
}
function rangeCtl(c) {
  const r = el('input', { type: 'range', min: c.min, max: c.max, step: c.step, value: get(S, c.path) });
  const fmt = v => (+v).toFixed(c.step < 1 ? 2 : 0).replace(/\.?0+$/, m => (m === '.00' ? '' : m)) + (c.unit ? (c.unit === '×' ? '×' : ' ' + c.unit) : '');
  const out = el('span', { className: 'val', textContent: fmt(r.value) });
  r.oninput = () => { put(S, c.path, +r.value); out.textContent = fmt(r.value); changed(); };
  return [r, out];
}
function selectCtl(c) {
  const s = el('select', {}, c.options().map(([v, n]) => el('option', { value: v, textContent: n })));
  s.value = get(S, c.path);
  s.onchange = () => { put(S, c.path, s.value); changed(); };
  return [s];
}
let customFonts = [];
function fontCtl(c) {
  const id = 'fontlist';
  const inp = el('input', { type: 'text', value: get(S, c.path), placeholder: 'Font name' });
  inp.setAttribute('list', id);
  const dl = el('datalist', { id }, [...customFonts.map(f => f.replace(/\.[^.]+$/, '')), ...COMMON_FONTS].map(f => el('option', { value: f })));
  inp.oninput = () => { put(S, c.path, inp.value); changed(); };
  return [inp, dl];
}
function renderControls(tabName, parent) {
  let group = null;
  for (const c of CONTROLS.filter(c => c.tab === tabName)) {
    if (c.group !== group) { group = c.group; parent.append(el('h2', { textContent: group })); }
    const ctl = { color: colorCtl, range: rangeCtl, select: selectCtl, font: fontCtl }[c.type](c);
    parent.append(el('div', { className: 'row' }, el('label', { textContent: c.label }), el('div', { className: 'ctl' }, ctl)));
  }
}
const row = (label, ...ctl) => el('div', { className: 'row' }, el('label', { textContent: label }), el('div', { className: 'ctl' }, ctl));
function toggle(path, label, onchange) {
  const cb = el('input', { type: 'checkbox', checked: !!get(S, path) });
  cb.onchange = () => { put(S, path, cb.checked); onchange ? onchange(cb.checked) : changed(false, true); };
  return row(label, cb);
}

// ------------------------------------------------------------------ tabs
const TABS = {
  layout() {
    const p = el('div');
    p.append(el('h2', { textContent: 'Keyboard layout' }),
      el('p', { className: 'note', textContent: 'Pick a layout, or click + to make your own from the full-size keyboard. Right-click a layout you made to delete it.' }));
    const cards = el('div', { className: 'cards' });
    for (const l of layouts) {
      cards.append(el('div', { className: 'card' + (S.layout.id === l.id ? ' sel' : ''), onclick: () => { S.layout.id = l.id; selKey = null; changed(true); },
        oncontextmenu: e => showMenu(e, [l.user
          ? { label: 'Delete layout', danger: true, run: async () => { await call('delete_layout', { id: l.id }); toast(l.name + ' deleted'); } }
          : { label: 'Built-in layouts can’t be deleted', disabled: true }]) },
        el('b', { textContent: l.name }), el('span', { textContent: l.keys.length + ' keys' + (isCustom(l.id) ? ' · customized' : '') })));
    }
    const mine = layouts.filter(l => l.user).length;
    cards.append(el('div', { className: 'card add', title: 'Add a layout', onclick: addLayoutDialog },
      el('span', { className: 'plus', textContent: '+' }), el('small', { textContent: `${mine}/${MAX_LAYOUTS} layouts` })));
    p.append(cards);
    return p;
  },

  keys() {
    const p = el('div'), L = curLayout();
    if (!L) return p;
    const V = viewProf();
    p.append(el('h2', { textContent: 'Keys — ' + L.name }),
      el('p', { className: 'note', textContent: 'Click a key to edit it. Disabled keys are hidden in the overlay. Changes are saved automatically for each layout.' }));
    const U = 38, minX = Math.min(...L.keys.map(k => k.x)), minY = Math.min(...L.keys.map(k => k.y));
    const map = el('div', { className: 'keymap' });
    let mw = 0, mh = 0;
    for (const k of L.keys) {
      const off = V.disabledKeys.includes(k.code), w = (k.w ?? 1) * U - 3, h = (k.h ?? 1) * U - 3;
      const left = (k.x - minX) * U + 8, top = (k.y - minY) * U + 8;
      mw = Math.max(mw, left + w + 8); mh = Math.max(mh, top + h + 8);
      map.append(el('div', {
        className: 'kmk' + (off ? ' off' : '') + (selKey === k.code ? ' sel' : ''),
        style: `left:${left}px;top:${top}px;width:${w}px;height:${h}px`,
        textContent: V.labels[k.code] ?? k.label, title: k.code,
        onclick: () => { selKey = k.code; render(); },
      }));
    }
    map.style.height = mh + 'px'; map.firstChild && (map.style.minWidth = mw + 'px');
    const inner = el('div', { style: `position:relative;width:${mw}px;height:${mh}px` }, [...map.childNodes]);
    map.replaceChildren(inner);
    p.append(map);

    const revert = el('button', { className: 'danger', textContent: 'Revert to Default', disabled: !isCustom(L.id), title: 'Undo all key edits (hidden keys and labels) for this layout' });
    let armed = 0;
    revert.onclick = () => {
      if (!armed) {   // two-step confirm, no pop-up needed
        revert.textContent = 'Click again to confirm';
        armed = setTimeout(() => { armed = 0; revert.textContent = 'Revert to Default'; }, 3500); return;
      }
      clearTimeout(armed); delete S.layout.profiles[L.id]; selKey = null; changed(true); toast(L.name + ' reverted to default');
    };
    p.append(el('div', { className: 'btns' },
      el('button', { textContent: 'Enable all', onclick: () => { editProf().disabledKeys = []; tidyProf(); changed(true); } }),
      el('button', { textContent: 'Disable all', onclick: () => { editProf().disabledKeys = L.keys.map(k => k.code); changed(true); } }),
      el('button', { textContent: 'Reset all labels', onclick: () => { editProf().labels = {}; tidyProf(); changed(true); } }),
      revert));

    if (selKey) {
      const k = L.keys.find(x => x.code === selKey);
      if (k) {
        const ed = el('div', { className: 'editor' }, el('b', { textContent: `${k.code}` }));
        const en = el('input', { type: 'checkbox', checked: !V.disabledKeys.includes(k.code) });
        en.onchange = () => {
          const pr = editProf(), d = new Set(pr.disabledKeys); en.checked ? d.delete(k.code) : d.add(k.code);
          pr.disabledKeys = [...d]; tidyProf(); changed(true);
        };
        const lab = el('input', { type: 'text', value: V.labels[k.code] ?? k.label ?? '', placeholder: 'Label', maxLength: 12 });
        lab.oninput = () => { editProf().labels[k.code] = lab.value; changed(); };
        const reset = el('button', { textContent: 'Reset', onclick: () => { delete editProf().labels[k.code]; tidyProf(); changed(true); } });
        ed.append(row('Show this key', en), row('Custom label', lab, reset),
          el('p', { className: 'note', textContent: 'Tip: use symbols like ⎵ or ↑, or words like "Jump".' }));
        p.append(ed);
      }
    }
    return p;
  },

  async style() {
    const p = el('div');
    p.append(el('h2', { textContent: 'Themes & presets' }));
    const th = el('select', {}, el('option', { value: '', textContent: 'Built-in themes…' }), reg.themes.map(t => el('option', { value: t.id, textContent: t.name })));
    th.onchange = () => {
      const t = reg.themes.find(x => x.id === th.value); if (!t) return;
      Object.assign(S.style, t.style); Object.assign(S.animation, t.animation); changed(true);
    };
    p.append(row('Built-in theme', th));

    const names = await call('list_presets');
    const mine = el('select', {}, el('option', { value: '', textContent: names.length ? 'My presets…' : 'No saved presets yet' }), names.map(n => el('option', { value: n, textContent: n })));
    const apply = d => { if (d.style) Object.assign(S.style, d.style); if (d.animation) Object.assign(S.animation, d.animation); changed(true); };
    p.append(row('My presets', mine,
      el('button', { textContent: 'Load', onclick: async () => { if (mine.value) apply(await call('load_preset', { name: mine.value })); } }),
      el('button', { textContent: 'Delete', className: 'danger', onclick: async () => { if (mine.value) { await call('delete_preset', { name: mine.value }); render(); } } })));
    const nm = el('input', { type: 'text', placeholder: 'Preset name' });
    p.append(row('Save current as', nm, el('button', {
      textContent: 'Save', onclick: async () => {
        await call('save_preset', { name: nm.value, data: { style: S.style, animation: S.animation } }); toast('Preset saved'); render();
      },
    })));
    p.append(el('div', { className: 'btns' },
      el('button', { textContent: 'Export to file…', onclick: async () => { if (await call('export_preset', { data: { style: S.style, animation: S.animation } })) toast('Exported'); } }),
      el('button', { textContent: 'Import from file…', onclick: async () => { const d = await call('import_preset'); if (d) { apply(d); toast('Imported'); } } })));
    renderControls('style', p);
    return p;
  },

  animation() {
    const p = el('div');
    renderControls('animation', p);
    p.append(el('p', { className: 'note', textContent: 'Only transform and opacity are animated (GPU friendly). Click keys in the preview to try an animation.' }));
    return p;
  },

  async fonts() {
    const p = el('div');
    p.append(el('h2', { textContent: 'Custom fonts' }),
      el('p', { className: 'note', textContent: 'Add TTF, OTF or WOFF files. They are copied into the app’s fonts folder. After adding, type the font’s file name (without extension) in Style → Font family, or click Use.' }));
    p.append(el('div', { className: 'btns' },
      el('button', { className: 'primary', textContent: 'Add font…', onclick: async () => { const n = await call('add_font'); if (n) { toast('Added ' + n); await reloadFonts(); render(); } } }),
      el('button', { textContent: 'Open fonts folder', onclick: () => call('open_folder', { kind: 'fonts' }) })));
    const list = el('div', { className: 'fontlist' });
    if (!customFonts.length) list.append(el('p', { className: 'note', textContent: 'No custom fonts yet.' }));
    for (const f of customFonts) {
      const fam = f.replace(/\.[^.]+$/, '');
      list.append(el('div', { className: 'fontitem' }, el('span', { className: 'n', textContent: f }),
        el('button', { textContent: S.style.fontFamily === fam ? 'In use' : 'Use', onclick: () => { S.style.fontFamily = fam; changed(true); } }),
        el('button', { className: 'danger', textContent: 'Remove', onclick: async () => { await call('remove_font', { name: f }); await reloadFonts(); render(); } })));
    }
    p.append(list);
    return p;
  },

  general() {
    const p = el('div');
    p.append(el('h2', { textContent: 'OBS' }));
    p.append(row('Browser Source URL', el('input', { value: obsUrl, readOnly: true }), el('button', { className: 'primary', textContent: 'Copy', onclick: copyUrl })));
    p.append(el('p', { className: 'note', id: 'sizeNote', textContent: sizeText() }));
    // ---- optional secure link
    p.append(el('h2', { textContent: 'Secure link' }));
    const SL_OFF = '**Off (default):** your OBS link is simple and needs no extra step. Any program running on this PC can read your key presses through it. Turn this on if you share the PC or want that closed.';
    const SL_ON = '**On:** your OBS link now contains a private key, and only a program that knows the full link can read your key presses. **Copy the new link into your OBS Browser Source once** — the old link stops working. Keep the link off your stream. “Make a new key” cuts off anyone who has the old one.';
    const slCb = el('input', { type: 'checkbox', checked: !!S.general.secureLink });
    const slNote = el('div', { className: 'note' });
    const newKey = el('button', { className: 'danger', textContent: 'Make a new key' });
    const slBtns = el('div', { className: 'btns', hidden: !S.general.secureLink }, el('button', { className: 'primary', textContent: 'Copy secure link', onclick: copyUrl }), newKey);
    const paintSL = on => { slNote.replaceChildren(md(on ? SL_ON : SL_OFF)); slBtns.hidden = !on; };
    const applyUrl = url => { obsUrl = url; updateObs(); frame.src = previewSrc(); };   // reload the live preview with the new link
    slCb.onchange = async () => {
      const want = slCb.checked; slCb.disabled = true;
      try {
        applyUrl(await invoke('set_secure_link', { enabled: want })); S.general.secureLink = want; updateObs();
        toast(want ? 'Secure link on — copy the new link into OBS.' : 'Secure link off.');
      } catch (e) { slCb.checked = !want; toast(String(e), true); }
      slCb.disabled = false; paintSL(slCb.checked);
    };
    let armedKey = 0;
    newKey.onclick = async () => {
      if (!armedKey) { newKey.textContent = 'Click again to confirm'; armedKey = setTimeout(() => { armedKey = 0; newKey.textContent = 'Make a new key'; }, 3500); return; }
      clearTimeout(armedKey); armedKey = 0; newKey.textContent = 'Make a new key';
      try { applyUrl(await invoke('regenerate_link_key')); toast('New key made — copy the new link into OBS.'); } catch (e) { toast(String(e), true); }
    };
    paintSL(!!S.general.secureLink);
    p.append(row('Secure my OBS link', slCb), slNote, slBtns);
    p.append(el('h2', { textContent: 'Server' }));
    const port = el('input', { type: 'number', min: 1024, max: 65535, value: S.general.port, style: 'width:100px' });
    p.append(row('Port', port, el('button', {
      textContent: 'Apply', onclick: async () => {
        try { obsUrl = await invoke('set_port', { port: +port.value }); S.general.port = +port.value; $('#banner').hidden = true; toast('Port changed — update your OBS source URL'); frame.src = previewSrc(); updateObs(); render(); }
        catch (e) { toast(String(e), true); }
      },
    })));
    p.append(el('div', { className: 'btns' }, el('button', {
      textContent: 'Restart server', onclick: async e => {
        e.target.disabled = true;
        try { await invoke('restart_server'); toast('Server restarted'); } catch (err) { toast(String(err), true); }
        e.target.disabled = false;
      },
    })));
    p.append(el('p', { className: 'note', textContent: 'The server only listens on 127.0.0.1 (this PC). Keystrokes are never saved or sent anywhere. OBS reconnects by itself after a restart.' }));
    // ---- keyboard input method
    p.append(el('h2', { textContent: 'Keyboard input' }));
    const METHODS = { hook: 'Standard (keyboard hook) — recommended', rawinput: 'Compatibility (Raw Input)' };
    const INFO = {
      hook: '**Standard** is what the app has always used: it listens to your keys through a Windows keyboard hook. It works with nearly every game, so keep it unless keys stop lighting up in one particular game.',
      rawinput: '**Compatibility** reads your keys straight from the keyboard (Windows Raw Input) instead of hooking into Windows. Some games and anti-cheat tools block the standard method but not this one, so try it if keys don’t light up in a certain game. It uses the same tiny amount of CPU. If anything looks off, switch back to Standard.',
    };
    const inSel = el('select', {}, Object.entries(METHODS).map(([v, n]) => el('option', { value: v, textContent: n })));
    inSel.value = inputActive;
    const inInfo = el('div', { className: 'note' }), inErr = el('div', { className: 'errnote', hidden: !inputError, textContent: inputError || '' });
    const showInfo = () => inInfo.replaceChildren(md(INFO[inSel.value]));
    inSel.onchange = async () => {
      const want = inSel.value;
      try {
        await invoke('set_input_method', { method: want });
        inputActive = want; S.general.inputMethod = want; inputError = null; inErr.hidden = true;
        toast('Keyboard input: ' + METHODS[want].replace(' — recommended', ''));
      } catch (e) {
        inSel.value = inputActive; inputError = String(e); inErr.textContent = inputError; inErr.hidden = false; toast(inputError, true);
      }
      showInfo();
    };
    showInfo();
    p.append(row('Input method', inSel), inErr, inInfo,
      el('p', { className: 'note', textContent: 'Both methods read keys the same way and never save or send them. If a game runs as administrator, start Keystroke Overlay as administrator too. Not sure? Leave it on Standard.' }));
    p.append(el('h2', { textContent: 'Program updates' }));
    p.append(row('Current version', el('b', { textContent: 'v' + appVersion }),
      el('button', { textContent: 'View release notes', onclick: () => showNotes(appVersion) })));
    const status = el('span', { className: 'hint', textContent: '' });
    const installBtn = el('button', { className: 'primary', textContent: 'Install update', hidden: true });
    const checkBtn = el('button', { textContent: 'Check for updates' });
    const note = el('p', { className: 'note', hidden: true });
    let manualUrl = '';
    const showResult = r => {
      installBtn.textContent = 'Install update'; manualUrl = '';
      if (r.available && r.manual) {
        manualUrl = r.url;
        status.textContent = `Version ${r.version} is available — this update needs a manual install`;
        note.textContent = (r.notes ? r.notes + '\n\n' : '') + 'It can’t be installed from inside the app. Download the new installer from GitHub, close this app, and run it; your settings are kept.';
        note.style.whiteSpace = 'pre-line'; note.hidden = false;
        installBtn.textContent = 'Open GitHub installer'; installBtn.hidden = false;
      } else if (r.available) {
        status.textContent = `Version ${r.version} is available`;
        note.textContent = r.notes || ''; note.hidden = !r.notes; installBtn.hidden = false;
      } else { status.textContent = `You're up to date (version ${r.current})`; installBtn.hidden = true; note.hidden = true; }
    };
    checkBtn.onclick = async () => {
      checkBtn.disabled = true; status.textContent = 'Checking…';
      try { showResult(setUpdate(await invoke('check_update'))); } catch (e) { status.textContent = String(e); }
      checkBtn.disabled = false;
    };
    installBtn.onclick = () => openUpdateDialog();   // same confirm dialog as the corner button
    if (lastUpdate) showResult(lastUpdate);
    const chSel = el('select', {}, el('option', { value: 'stable', textContent: 'Stable (recommended)' }), el('option', { value: 'latest', textContent: 'Latest' }));
    chSel.value = S.general.updateChannel;
    chSel.onchange = async () => {
      S.general.updateChannel = chSel.value;
      try { await invoke('save_settings', { settings: S }); } catch {}   // the check below must see the new channel
      setUpdate(null); status.textContent = 'Checking…';
      try { showResult(setUpdate(await invoke('check_update'))); } catch (e) { status.textContent = String(e); }
    };
    p.append(row('Update channel', chSel), el('p', { className: 'note', textContent: 'Stable: the main, well-tested releases (like 1.2.0 or 1.3.0) — recommended. Latest: every release as soon as it is published, including the small fixes in between (like 1.2.1).' }));
    const bar = el('div', { className: 'bar', id: 'upBar', hidden: true }, el('div', { className: 'fill', id: 'upFill' }));
    p.append(row('Software update', checkBtn, installBtn), el('div', { className: 'row' }, el('label'), el('div', { className: 'ctl', style: 'flex-direction:column;align-items:stretch;gap:6px' }, status, bar, el('span', { className: 'hint', id: 'upText' }))), note);
    p.append(toggle('general.autoCheckUpdates', 'Check for updates automatically'));
    p.append(el('p', { className: 'note', textContent: 'Updates are never installed without your click. The app only contacts GitHub for the update check (when this window opens, at most every 6 hours) and for release notes, and sends nothing except its version. Your keystrokes never leave this PC.' }));
    setTimeout(paintProgress, 0);
    p.append(el('h2', { textContent: 'App' }));
    p.append(toggle('general.autostart', 'Start with Windows', async on => { try { await invoke('set_autostart', { enabled: on }); } catch (e) { toast(String(e), true); S.general.autostart = !on; render(); } }));
    p.append(toggle('general.minimizeToTray', 'Minimize to tray'));
    p.append(toggle('general.openOnLaunch', 'Open this window on launch'));
    p.append(el('div', { className: 'btns' },
      el('button', { textContent: 'Open data folder', onclick: () => call('open_folder', { kind: 'root' }) }),
      el('button', { className: 'danger', textContent: 'Quit app', onclick: () => call('quit_app') })));
    // Group everything under its heading, then show the sections in a sensible order: connecting OBS first, updates last.
    const groups = new Map(); let cur = null;
    for (const n of [...p.children]) { if (n.tagName === 'H2') { cur = []; groups.set(n.textContent, cur); } cur.push(n); }
    p.replaceChildren(...['OBS', 'Server', 'Secure link', 'Keyboard input', 'App', 'Program updates'].flatMap(k => groups.get(k) ?? []));
    return p;
  },
};
const TAB_NAMES = { layout: 'Layout', keys: 'Keys', style: 'Style', animation: 'Animation', fonts: 'Fonts', general: 'General' };

async function render() {
  const nav = $('#tabs');
  nav.replaceChildren(...Object.entries(TAB_NAMES).map(([id, n]) => el('button', { textContent: n, className: id === tab ? 'active' : '', onclick: () => { tab = id; render(); } })));
  const pane = $('#pane'), top = pane.scrollTop;
  const content = await TABS[tab]();
  pane.replaceChildren(content);
  pane.scrollTop = top;
}

// ------------------------------------------------------------------ update progress
function paintProgress() {
  const ub = $('#uBar');   // the update dialog's own bar
  if (ub) {
    ub.hidden = !upProg;
    $('#uFill').style.width = (upProg ? Math.max(0, upProg.pct) : 0) + '%';
    $('#uFill').classList.toggle('indet', !!upProg && upProg.pct < 0);
    if (upProg) $('#uText').textContent = upProg.text;
  }
  const bar = $('#upBar'), fill = $('#upFill'), txt = $('#upText');
  if (!bar) return;
  bar.hidden = !upProg;
  if (upProg) { fill.style.width = upProg.pct + '%'; fill.classList.toggle('indet', upProg.pct < 0); txt.textContent = upProg.text; }
  else txt.textContent = '';
}
const mb = n => (n / 1048576).toFixed(1) + ' MB';
const ev = window.__TAURI__.event;
ev.listen('update-progress', e => {
  const { done, total } = e.payload;
  upProg = total ? { pct: Math.min(100, Math.round(done / total * 100)), text: `Downloading… ${mb(done)} of ${mb(total)} (${Math.min(100, Math.round(done / total * 100))}%)` }
                 : { pct: -1, text: `Downloading… ${mb(done)}` };
  paintProgress();
});
ev.listen('update-installing', () => { upProg = { pct: 100, text: 'Installing… the app will restart in a moment.' }; paintProgress(); });

// ------------------------------------------------------------------ What's new (release notes from GitHub)
function md(src) {   // tiny, safe markdown: headings, bullets, **bold**, `code`; everything via textContent
  const frag = document.createDocumentFragment(); let list = null;
  const inline = (parent, text) => {
    const re = /(\*\*[^*]+\*\*|`[^`]+`)/g; let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.append(text.slice(last, m.index));
      parent.append(m[0].startsWith('**') ? el('strong', { textContent: m[0].slice(2, -2) }) : el('code', { textContent: m[0].slice(1, -1) }));
      last = m.index + m[0].length;
    }
    if (last < text.length) parent.append(text.slice(last));
  };
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd().replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'); let m;
    if (!line.trim()) { list = null; continue; }
    if ((m = /^#{1,6}\s+(.*)$/.exec(line))) { list = null; const h = el('h4'); inline(h, m[1]); frag.append(h); }
    else if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) { if (!list) { list = el('ul'); frag.append(list); } const li = el('li'); inline(li, m[1]); list.append(li); }
    else { list = null; const q = el('p'); inline(q, line); frag.append(q); }
  }
  return frag;
}
function closeModal() { $('#modal').hidden = true; document.removeEventListener('keydown', escClose); }
const escClose = e => { if (e.key === 'Escape' || e.key === 'Enter') closeModal(); };
// "Typing" reveal for the release notes. Each text node is split into [typed part][hidden remainder];
// the hidden remainder still takes up its space, so nothing shifts or re-wraps while typing. Only the
// text at the cursor is touched each frame, it runs on requestAnimationFrame for under a second, and
// there is no timer once it finishes.
let typingRun = 0;
function typeIn(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const run = ++typingRun, nodes = [], walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) if (n.nodeValue) nodes.push(n);
  const parts = nodes.map(n => {
    const full = n.nodeValue, typed = document.createTextNode(''), rest = el('span', { textContent: full });
    rest.style.visibility = 'hidden'; n.replaceWith(typed, rest);
    return { full, typed, rest, done: 0 };
  });
  const total = parts.reduce((a, p) => a + p.full.length, 0);
  if (!total) return;
  const dur = Math.min(800, Math.max(300, total * 7));   // always under one second
  let shown = 0, idx = 0, t0 = 0;
  const frame = now => {
    if (run !== typingRun || $('#modal').hidden) return;
    t0 ||= now;
    const want = Math.min(total, Math.ceil(total * (now - t0) / dur));
    while (shown < want && idx < parts.length) {
      const p = parts[idx], take = Math.min(p.full.length - p.done, want - shown);
      if (take > 0) { p.done += take; shown += take; p.typed.nodeValue = p.full.slice(0, p.done); p.rest.textContent = p.full.slice(p.done); }
      if (p.done >= p.full.length) { p.rest.remove(); idx++; } else break;
    }
    if (shown < total) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // Safety net: if the browser throttles animation frames (hidden/background window), still finish.
  setTimeout(() => {
    if (run !== typingRun) return;
    for (const p of parts) { p.typed.nodeValue = p.full; p.rest.remove(); }
  }, dur + 400);
}
function loadingDots() {   // pure-CSS animation (opacity only): '.' 0.3s, '..' 0.3s, '...' 0.1s, repeat
  return el('p', { className: 'dots', role: 'status', ariaLabel: 'Loading release notes' }, el('span', { textContent: '.' }), el('span', { textContent: '.' }), el('span', { textContent: '.' }));
}
async function showNotes(version, heading) {
  typingRun++;   // cancel any typing still in progress
  $('#mTitle').textContent = heading || `Release notes — v${version}`;
  const body = $('#mBody'); body.replaceChildren(loadingDots());
  $('#modal').hidden = false; document.addEventListener('keydown', escClose); $('#mOk').focus();
  try {
    const n = await invoke('get_release_notes', { version });
    if ($('#modal').hidden) return;
    body.replaceChildren(n.body.trim() ? md(n.body) : el('p', { className: 'hint', textContent: 'This release has no written notes.' }));
    typeIn(body);
  } catch (e) { if (!$('#modal').hidden) body.replaceChildren(el('p', { className: 'hint', textContent: String(e) })); }
}
$('#mOk').onclick = closeModal;

// ------------------------------------------------------------------ update button + dialog
// The corner button only appears when a newer version exists. Nothing is downloaded or installed
// until the user clicks it and confirms in the dialog.
function setUpdate(r) {
  lastUpdate = r;
  $('#updateBtn').hidden = !(r && r.available);
  return r;
}
let updBusy = false;
function openUpdateDialog() {
  const r = lastUpdate; if (!r?.available) return;
  $('#uTitle').textContent = `Update available — v${r.version}`;
  const body = $('#uBody'); body.replaceChildren(...[
    el('p', { className: 'hint', textContent: `You have v${r.current} · ${r.channel === 'latest' ? 'Latest' : 'Stable'} channel` }),
    r.manual ? el('p', { textContent: 'This update needs a manual install: download the new installer from GitHub, close this app, and run it. Your settings are kept.' }) : null,
    r.notes ? md(r.notes) : null].filter(Boolean));   // replaceChildren would print "null" for empty slots
  $('#uGo').textContent = r.manual ? 'Open GitHub installer' : 'Update now';
  $('#uGo').disabled = $('#uLater').disabled = false; updBusy = false;
  upProg = null; paintProgress(); $('#uText').textContent = '';
  $('#updModal').hidden = false; $('#uGo').focus();
}
$('#updateBtn').onclick = openUpdateDialog;
$('#uLater').onclick = () => { if (!updBusy) $('#updModal').hidden = true; };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !updBusy && !$('#updModal').hidden) $('#updModal').hidden = true; });
$('#uGo').onclick = async () => {
  const r = lastUpdate; if (!r?.available) return;
  if (r.manual) { try { await invoke('open_release_page', { url: r.url }); } catch (e) { toast(String(e), true); } return; }
  updBusy = true; $('#uGo').disabled = $('#uLater').disabled = true;
  try { if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; } await invoke('save_settings', { settings: S }); } catch {}   // nothing pending when the app restarts
  upProg = { pct: 0, text: 'Starting download…' }; paintProgress();
  try { await invoke('install_update'); }   // downloads, verifies the signature, installs, restarts
  catch (e) { updBusy = false; upProg = null; paintProgress(); $('#uText').textContent = String(e); $('#uGo').disabled = $('#uLater').disabled = false; }
};

// ------------------------------------------------------------------ pause bar + changes made elsewhere (tray)
function paintPause() { $('#pausebar').hidden = !paused; }
$('#resumeBtn').onclick = async () => { await call('toggle_pause'); };
async function resync() {
  try { const s0 = await invoke('get_state'); obsUrl = s0.url; } catch { /* keep the old address */ }
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; try { await invoke('save_settings', { settings: S }); } catch {} }   // never lose a pending edit
  const st = await invoke('get_state');
  try { layouts = await invoke('list_layouts'); } catch { /* keep the old list */ }
  S = st.settings; paused = st.paused; inputActive = st.inputActive; inputError = st.inputError; paintPause();
  const b = $('#banner');
  if (st.serverError) { b.hidden = false; b.textContent = st.serverError + ' — pick another port in General → Port.'; } else b.hidden = true;
  push(); render();
}
ev.listen('settings-changed', resync);

// ------------------------------------------------------------------ OBS bits
const sizeText = () => size ? `Recommended Browser Source size: ${size.w} × ${size.h}` : '';
function updateObs() {
  $('#obsUrl').value = obsUrl;
  $('#obsUrl').type = S?.general?.secureLink ? 'password' : 'text';   // a secured link is hidden on screen (Copy still copies it)
  $('#obsSize').textContent = size ? `Size: ${size.w}×${size.h}` : '';
  const n = $('#sizeNote'); if (n) n.textContent = sizeText();
}
async function copyUrl() { await call('copy_text', { text: obsUrl }); toast('OBS URL copied'); }
$('#copyUrl').onclick = copyUrl;

const previewSrc = () => { const u = new URL(obsUrl); u.searchParams.set('preview', '1'); return u.toString(); };   // keeps ?key= when the link is secured
async function reloadFonts() { customFonts = await call('list_fonts'); }

// Scale the preview iframe to fit its box.
function fit() {
  if (!size) return;
  const box = $('#previewBox'), k = Math.min(1, (box.clientWidth - 24) / size.w, (box.clientHeight - 24) / size.h);
  frame.style.width = size.w + 'px'; frame.style.height = size.h + 'px';
  frame.style.transform = `scale(${k})`;
  frame.style.left = Math.max(12, (box.clientWidth - size.w * k) / 2) + 'px';
  frame.style.top = Math.max(12, (box.clientHeight - size.h * k) / 2) + 'px';
}
addEventListener('resize', fit);

// ------------------------------------------------------------------ boot
addEventListener('message', e => {
  if (e.source !== frame.contentWindow) return;
  const m = e.data || {};
  if (m.type === 'ready') { push(); frame.contentWindow.postMessage({ type: 'getRegistry' }, '*'); }
  else if (m.type === 'registry') { reg = m; if (booted && (tab === 'style' || tab === 'animation')) render(); }   // only these tabs need the lists
  else if (m.type === 'size') { size = m; fit(); updateObs(); }
});
let booted = false;

(async () => {
  // Three independent IPC calls at once, then draw the UI immediately. The live preview loads
  // afterwards in the background, so it never delays the first paint.
  const [st, ly, fonts] = await Promise.all([call('get_state'), call('list_layouts'), call('list_fonts')]);
  S = st.settings; obsUrl = st.url; appVersion = st.version; paused = st.paused; layouts = ly; customFonts = fonts;
  inputActive = st.inputActive; inputError = st.inputError;
  paintPause(); updateObs();
  if (st.serverError) {
    const b = $('#banner'); b.hidden = false;
    b.textContent = st.serverError + ' — pick another port in General → Port.';
    tab = 'general';   // overlay can't load; still allow fixing the port
  }
  booted = true;
  await render();
  window.__uiReady = performance.timeOrigin + performance.now();   // for startup measurements
  if (!st.serverError) requestAnimationFrame(() => { frame.src = previewSrc(); });
  if (st.whatsNew) {   // shown once after an update
    await invoke('ack_whats_new');
    showNotes(appVersion, `What's new in v${appVersion}`);
  }
})();

// Background update check shortly after the window is up (setting: "Check for updates automatically").
// The Rust side skips it when disabled and reuses a result from the last 6 hours.
setTimeout(async () => {
  try { const r = await invoke('auto_check_update'); if (r) setUpdate(r); } catch { /* offline: stay quiet */ }
}, 700);

// ------------------------------------------------------------------ right-click: no browser menu anywhere, just our own where it makes sense
let menuEl = null;
function hideMenu() { menuEl?.remove(); menuEl = null; }
function showMenu(e, items) {
  e.preventDefault(); e.stopPropagation(); hideMenu();
  menuEl = el('div', { className: 'ctxmenu' }, items.map(it => el('button', {
    type: 'button', className: it.danger ? 'danger' : '', textContent: it.label, disabled: !!it.disabled,
    onclick: () => { hideMenu(); it.run && it.run(); } })));
  document.body.append(menuEl);
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.max(4, Math.min(e.clientX, innerWidth - r.width - 4)) + 'px';
  menuEl.style.top = Math.max(4, Math.min(e.clientY, innerHeight - r.height - 4)) + 'px';
}
addEventListener('contextmenu', e => e.preventDefault());   // layout cards call showMenu first (it stops this)
addEventListener('mousedown', e => { if (menuEl && !menuEl.contains(e.target)) hideMenu(); }, true);
addEventListener('blur', hideMenu); addEventListener('resize', hideMenu);
addEventListener('keydown', e => { if (e.key === 'Escape') hideMenu(); });
addEventListener('dragstart', e => e.preventDefault());

// ------------------------------------------------------------------ one dialog style for everything (same look as release notes / updates)
const MAX_LAYOUTS = 20;
function dialog({ title, body, buttons }) {
  $('#dTitle').textContent = title;
  $('#dBody').replaceChildren(...body);
  const close = () => { $('#dlg').hidden = true; document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  $('#dFoot').replaceChildren(...buttons.map(b => el('button', { type: 'button', className: b.primary ? 'primary' : '', textContent: b.label,
    onclick: async () => { if (!b.run || (await b.run()) !== false) close(); } })));
  $('#dlg').hidden = false; document.addEventListener('keydown', onKey);
  return close;
}
function addLayoutDialog() {
  if (layouts.filter(l => l.user).length >= MAX_LAYOUTS) {
    dialog({ title: 'Max layouts reached', body: [el('p', { textContent: `You can make up to ${MAX_LAYOUTS} layouts of your own. Right-click one you no longer need and choose Delete layout to free a spot.` })],
      buttons: [{ label: 'OK', primary: true }] });
    return;
  }
  const nameIn = el('input', { type: 'text', placeholder: 'Layout name', maxLength: 30 });
  const make = async () => {
    try {
      const id = await invoke('create_layout', { name: nameIn.value });
      layouts = await call('list_layouts'); S.layout.id = id; selKey = null; tab = 'keys';
      toast('Layout created. Click keys to hide the ones you don’t want.'); render(); return true;
    } catch (e) { toast(String(e), true); return false; }
  };
  nameIn.onkeydown = e => { if (e.key === 'Enter') $('#dFoot .primary').click(); };
  dialog({ title: 'New layout', body: [el('p', { textContent: 'It starts as the full-size keyboard. You then pick which keys to keep or hide on the Keys tab.' }), nameIn],
    buttons: [{ label: 'Cancel' }, { label: 'Create', primary: true, run: async () => (await make()) ? true : false }] });
  nameIn.focus();
}
