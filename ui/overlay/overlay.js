// Overlay core: builds the keyboard from a layout, listens on a WebSocket and
// toggles a `down` class per key. No timers or polling while connected - CSS
// transitions do all the animation work on the compositor.
import { animations, themes, easings } from '/overlay/registry.js';

const PAD = 16; // room around the keys so glows aren't clipped
const params = new URLSearchParams(location.search);
const PREVIEW = params.has('preview') && window.parent !== window;
if (PREVIEW) document.body.classList.add('preview');

const stage = document.getElementById('stage');
const root = document.documentElement;
let settings = null, layouts = [], fontFiles = [], structKey = '';
const keyEls = new Map();   // code -> element
const held = new Set();     // codes currently down (kept across rebuilds)

// ------------------------------------------------------------ module loading
async function loadModules() {
  const m = await (await fetch('/api/modules')).json();
  await Promise.all([...m.animations, ...m.themes].map(u => import(u).catch(e => console.warn('module failed', u, e))));
}

// ------------------------------------------------------------ rendering
function fontFaceCss(files) {
  return files.map(f => {
    const fam = f.replace(/\.[^.]+$/, '');
    const fmt = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' }[f.split('.').pop().toLowerCase()];
    return `@font-face{font-family:"${fam}";src:url("/fonts/${encodeURIComponent(f)}")${fmt ? ` format("${fmt}")` : ''};font-display:block}`;
  }).join('\n');
}

function applyVars(s) {
  const st = s.style, an = s.animation;
  const set = (k, v) => root.style.setProperty(k, v);
  set('--fill', st.keyFill); set('--fill-on', st.keyFillPressed);
  set('--bc', st.borderColor); set('--bc-on', st.borderColorPressed); set('--bw', st.borderWidth + 'px');
  set('--radius', st.radius + 'px');
  set('--font', `"${st.fontFamily}", "Segoe UI", sans-serif`); set('--fs', st.fontSize + 'px'); set('--fw', st.fontWeight);
  set('--tc', st.textColor); set('--tc-on', st.textColorPressed);
  set('--glow-color', st.glowColor); set('--glow-size', st.glowSize + 'px');
  set('--opacity', st.opacity);

  const anim = animations.get(an.type) || animations.get('none');
  const spec = anim?.apply({ ms: an.speed, intensity: an.intensity, style: st }) ?? {};
  const user = an.easing !== 'default' ? easings.get(an.easing)?.css : null;
  const p = spec.press ?? {}, r = spec.release ?? {};
  set('--t-idle', spec.idle ?? 'none'); set('--t-down', spec.down ?? 'none');
  set('--glow-down', spec.glow ?? 0);
  set('--ms-down', (p.ms ?? an.speed * 0.6) + 'ms'); set('--ease-down', user ?? p.ease ?? 'ease-out');
  set('--ms-up', (r.ms ?? an.speed) + 'ms'); set('--ease-up', user ?? r.ease ?? 'ease-out');
}

function build(s) {
  const layout = layouts.find(l => l.id === s.layout.id) ?? layouts[0];
  stage.textContent = '';
  keyEls.clear();
  if (!layout) return;
  const off = new Set(s.layout.disabledKeys);
  const keys = layout.keys.filter(k => !off.has(k.code));
  if (!keys.length) { reportSize(0, 0); return; }
  const { keySize, gap } = s.style, pitch = keySize + gap;
  const minX = Math.min(...keys.map(k => k.x)), minY = Math.min(...keys.map(k => k.y));
  let maxX = 0, maxY = 0;
  const frag = document.createDocumentFragment();
  for (const k of keys) {
    const w = (k.w ?? 1) * pitch - gap, h = (k.h ?? 1) * pitch - gap;
    maxX = Math.max(maxX, (k.x - minX) * pitch + w); maxY = Math.max(maxY, (k.y - minY) * pitch + h);
    const label = s.layout.labels[k.code] ?? k.label ?? '';
    const el = document.createElement('div');
    el.className = 'key';
    el.dataset.code = k.code;
    el.style.cssText = `left:${(k.x - minX) * pitch}px;top:${(k.y - minY) * pitch}px;width:${w}px;height:${h}px`;
    // Shrink long labels to fit narrow keys.
    const fit = Math.min(1, (w - 10) / Math.max(1, [...label].length * s.style.fontSize * 0.62));
    const mk = cls => {
      const f = document.createElement('div'); f.className = 'face ' + cls;
      const sp = document.createElement('span'); sp.textContent = label; if (fit < 1) sp.style.setProperty('--f', fit.toFixed(3));
      f.appendChild(sp); return f;
    };
    const glow = document.createElement('div'); glow.className = 'glow';
    el.append(glow, mk('idle'), mk('on'));
    if (held.has(k.code)) el.classList.add('down');
    frag.appendChild(el); keyEls.set(k.code, el);
  }
  stage.appendChild(frag);
  stage.style.width = maxX + 'px'; stage.style.height = maxY + 'px';
  reportSize(maxX, maxY);
}

function reportSize(w, h) {
  const sc = settings.style.scale;
  stage.style.left = stage.style.top = PAD + 'px';
  stage.style.transform = `scale(${sc})`;
  const size = { w: Math.ceil(w * sc + PAD * 2), h: Math.ceil(h * sc + PAD * 2) };
  window.__size = size;
  if (PREVIEW) parent.postMessage({ type: 'size', ...size }, '*');
}

function apply(s) {
  settings = s;
  const key = JSON.stringify([s.layout, s.style.keySize, s.style.gap, s.style.fontSize, s.style.scale]);
  applyVars(s);
  if (key !== structKey) { structKey = key; build(s); }
}

// ------------------------------------------------------------ key state
function setKey(code, down) {
  down ? held.add(code) : held.delete(code);
  keyEls.get(code)?.classList.toggle('down', down);
}
function snapshot(list) {
  const want = new Set(list);
  for (const c of [...held]) if (!want.has(c)) setKey(c, false);
  for (const c of want) setKey(c, true);
}
function releaseAll() { for (const c of [...held]) setKey(c, false); }

// ------------------------------------------------------------ data + socket
async function loadFonts() {
  fontFiles = await (await fetch('/api/fonts')).json();
  document.getElementById('fonts').textContent = fontFaceCss(fontFiles);
  // Ensure custom fonts are ready before measuring/painting.
  await Promise.all(fontFiles.map(f => document.fonts.load(`16px "${f.replace(/\.[^.]+$/, '')}"`).catch(() => {})));
}
async function refresh() {
  const [cfg, ly] = await Promise.all([fetch('/api/config').then(r => r.json()), fetch('/api/layouts').then(r => r.json())]);
  layouts = ly;
  await loadFonts();
  apply(cfg.settings);
}

let ws, retry = 0;
function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => { retry = 0; };
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.t === 'd') setKey(m.k, true);
    else if (m.t === 'u') setKey(m.k, false);
    else if (m.t === 'snap') snapshot(m.down);
    else if (m.t === 'cfg') refresh();
  };
  ws.onclose = () => {
    releaseAll(); // never leave keys stuck if the app goes away
    setTimeout(connect, Math.min(5000, 500 * ++retry)); // only runs while disconnected
  };
}

// ------------------------------------------------------------ settings-window preview bridge
if (PREVIEW) {
  addEventListener('message', async e => {
    if (e.source !== parent) return;
    const m = e.data || {};
    if (m.type === 'cfg') apply(m.settings);
    else if (m.type === 'refresh') await refresh();
    else if (m.type === 'getRegistry') {
      parent.postMessage({
        type: 'registry',
        animations: [...animations.values()].map(a => ({ id: a.id, name: a.name })),
        themes: [...themes.values()].map(t => ({ id: t.id, name: t.name, style: t.style, animation: t.animation })),
        easings: [...easings.values()].map(x => ({ id: x.id, name: x.name })),
        layouts: layouts.map(l => ({ id: l.id, name: l.name })),
      }, '*');
    }
  });
  // Click keys in the preview to test the look without typing.
  stage.addEventListener('pointerdown', e => { const k = e.target.closest('.key'); if (k) setKey(k.dataset.code, true); });
  addEventListener('pointerup', () => releaseAll());
}

await loadModules();
await refresh();
connect();
if (PREVIEW) parent.postMessage({ type: 'ready' }, '*');
