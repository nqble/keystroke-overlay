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
let obsUrl = '', size = null, appVersion = '', lastUpdate = null, paused = false, upProg = null;

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
  { tab: 'style', group: 'Text', path: 'style.fontSize', type: 'range', min: 8, max: 48, step: 1, unit: 'px', label: 'Font size' },
  { tab: 'style', group: 'Text', path: 'style.fontWeight', type: 'range', min: 100, max: 900, step: 100, label: 'Font weight' },
  { tab: 'style', group: 'Text', path: 'style.textColor', type: 'color', label: 'Text (idle)' },
  { tab: 'style', group: 'Text', path: 'style.textColorPressed', type: 'color', label: 'Text (pressed)' },
  { tab: 'style', group: 'Size', path: 'style.keySize', type: 'range', min: 24, max: 120, step: 1, unit: 'px', label: 'Key size' },
  { tab: 'style', group: 'Size', path: 'style.gap', type: 'range', min: 0, max: 24, step: 1, unit: 'px', label: 'Key spacing' },
  { tab: 'style', group: 'Size', path: 'style.scale', type: 'range', min: 0.3, max: 3, step: 0.05, unit: '×', label: 'Overall scale' },
  { tab: 'style', group: 'Size', path: 'style.opacity', type: 'range', min: 0.1, max: 1, step: 0.05, label: 'Opacity' },

  { tab: 'animation', group: 'Animation', path: 'animation.type', type: 'select', options: () => reg.animations.map(a => [a.id, a.name]), label: 'Type' },
  { tab: 'animation', group: 'Animation', path: 'animation.speed', type: 'range', min: 0, max: 600, step: 10, unit: 'ms', label: 'Speed (duration)' },
  { tab: 'animation', group: 'Animation', path: 'animation.easing', type: 'select', options: () => [['default', 'Animation default'], ...reg.easings.map(e => [e.id, e.name])], label: 'Easing' },
  { tab: 'animation', group: 'Animation', path: 'animation.intensity', type: 'range', min: 0.2, max: 2.5, step: 0.1, unit: '×', label: 'Intensity' },
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
      el('p', { className: 'note', textContent: 'Layouts are JSON files. Drop your own into the layouts folder (see General → Open data folder) and restart the app.' }));
    const cards = el('div', { className: 'cards' });
    for (const l of layouts) {
      cards.append(el('div', { className: 'card' + (S.layout.id === l.id ? ' sel' : ''), onclick: () => { S.layout.id = l.id; selKey = null; changed(true); } },
        el('b', { textContent: l.name }), el('span', { textContent: l.keys.length + ' keys' + (isCustom(l.id) ? ' · customized' : '') })));
    }
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
      try { showResult(lastUpdate = await invoke('check_update')); } catch (e) { status.textContent = String(e); }
      checkBtn.disabled = false;
    };
    installBtn.onclick = async () => {
      if (manualUrl) { try { await invoke('open_release_page', { url: manualUrl }); } catch (e) { status.textContent = String(e); } return; }
      try { if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; } await invoke('save_settings', { settings: S }); } catch {}   // make sure nothing is pending before the app restarts
      installBtn.disabled = checkBtn.disabled = true; status.textContent = 'Downloading…';
      upProg = { pct: 0, text: 'Starting download…' }; paintProgress();
      try { await invoke('install_update'); } catch (e) { upProg = null; status.textContent = String(e); installBtn.disabled = checkBtn.disabled = false; paintProgress(); }
    };
    if (lastUpdate) showResult(lastUpdate);
    const bar = el('div', { className: 'bar', id: 'upBar', hidden: true }, el('div', { className: 'fill', id: 'upFill' }));
    p.append(row('Software update', checkBtn, installBtn), el('div', { className: 'row' }, el('label'), el('div', { className: 'ctl', style: 'flex-direction:column;align-items:stretch;gap:6px' }, status, bar, el('span', { className: 'hint', id: 'upText' }))), note);
    p.append(toggle('general.autoCheckUpdates', 'Check when this window opens'));
    p.append(el('p', { className: 'note', textContent: 'The app only contacts GitHub when it checks for updates or shows release notes, and sends nothing except its version. Your keystrokes never leave this PC.' }));
    setTimeout(paintProgress, 0);
    p.append(el('h2', { textContent: 'App' }));
    p.append(toggle('general.autostart', 'Start with Windows', async on => { try { await invoke('set_autostart', { enabled: on }); } catch (e) { toast(String(e), true); S.general.autostart = !on; render(); } }));
    p.append(toggle('general.minimizeToTray', 'Minimize to tray'));
    p.append(toggle('general.openOnLaunch', 'Open this window on launch'));
    p.append(el('div', { className: 'btns' },
      el('button', { textContent: 'Open data folder', onclick: () => call('open_folder', { kind: 'root' }) }),
      el('button', { className: 'danger', textContent: 'Quit app', onclick: () => call('quit_app') })));
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
async function showNotes(version, heading) {
  $('#mTitle').textContent = heading || `Release notes — v${version}`;
  const body = $('#mBody'); body.replaceChildren(el('p', { className: 'hint', textContent: 'Loading release notes from GitHub…' }));
  $('#modal').hidden = false; document.addEventListener('keydown', escClose); $('#mOk').focus();
  try {
    const n = await invoke('get_release_notes', { version });
    body.replaceChildren(n.body.trim() ? md(n.body) : el('p', { className: 'hint', textContent: 'This release has no written notes.' }));
  } catch (e) { body.replaceChildren(el('p', { className: 'hint', textContent: String(e) })); }
}
$('#mOk').onclick = closeModal;

// ------------------------------------------------------------------ pause bar + changes made elsewhere (tray)
function paintPause() { $('#pausebar').hidden = !paused; }
$('#resumeBtn').onclick = async () => { await call('toggle_pause'); };
async function resync() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; try { await invoke('save_settings', { settings: S }); } catch {} }   // never lose a pending edit
  const st = await invoke('get_state');
  S = st.settings; paused = st.paused; paintPause();
  const b = $('#banner');
  if (st.serverError) { b.hidden = false; b.textContent = st.serverError + ' — pick another port in General → Port.'; } else b.hidden = true;
  push(); render();
}
ev.listen('settings-changed', resync);

// ------------------------------------------------------------------ OBS bits
const sizeText = () => size ? `Recommended Browser Source size: ${size.w} × ${size.h}` : '';
function updateObs() {
  $('#obsUrl').value = obsUrl;
  $('#obsSize').textContent = size ? `Size: ${size.w}×${size.h}` : '';
  const n = $('#sizeNote'); if (n) n.textContent = sizeText();
}
async function copyUrl() { await call('copy_text', { text: obsUrl }); toast('OBS URL copied'); }
$('#copyUrl').onclick = copyUrl;

const previewSrc = () => obsUrl.replace(/\/$/, '') + '/?preview=1';
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
  else if (m.type === 'registry') { reg = m; if (!booted) { booted = true; render(); } else render(); }
  else if (m.type === 'size') { size = m; fit(); updateObs(); }
});
let booted = false;

(async () => {
  const st = await call('get_state');
  S = st.settings; obsUrl = st.url; appVersion = st.version; paused = st.paused; paintPause();
  layouts = await call('list_layouts');
  await reloadFonts();
  updateObs();
  if (st.serverError) {
    const b = $('#banner'); b.hidden = false;
    b.textContent = st.serverError + ' — pick another port in General → Port.';
    tab = 'general'; booted = true; render();   // overlay can't load; still allow fixing the port
  } else {
    frame.src = previewSrc();
    setTimeout(() => { if (!booted) { booted = true; render(); } }, 4000); // safety net
  }
  if (st.whatsNew) {   // shown once after an update
    await invoke('ack_whats_new');
    showNotes(appVersion, `What's new in v${appVersion}`);
  }
})();

// Optional: check for updates when the window opens (off by default).
setTimeout(async () => {
  if (!S?.general.autoCheckUpdates) return;
  try {
    lastUpdate = await invoke('check_update');
    if (lastUpdate.available) toast(`Update ${lastUpdate.version} available — see General → Program updates`);
  } catch { /* offline: stay quiet */ }
}, 1500);
