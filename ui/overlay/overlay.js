// Overlay core: builds the keyboard from a layout, listens on a WebSocket and
// toggles a `down` class per key. No timers or polling while connected - CSS
// transitions do all the animation work on the compositor.
import { animations, themes, easings } from '/overlay/registry.js';

const PAD = 16; // room around the keys so glows aren't clipped
const params = new URLSearchParams(location.search);
const PREVIEW = params.has('preview') && window.parent !== window;

// Optional secure link: the address carries ?key=... and every data request / the WebSocket must repeat it.
const KEY = params.get('key');
const withKey = (u) => (KEY ? u + (u.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(KEY) : u);
function showLocked() {
  if (PREVIEW) parent.postMessage({ type: 'locked' }, '*');
  if (document.getElementById('locked')) return;
  const lockedNotice = document.createElement('div');
  lockedNotice.id = 'locked';
  lockedNotice.style.cssText =
    'position:fixed;left:8px;top:8px;max-width:420px;padding:8px 12px;border-radius:8px;' +
    'background:rgba(0,0,0,.78);color:#fff;font:14px/1.4 "Segoe UI",sans-serif';
  lockedNotice.textContent =
    '🔒 This overlay link is secured. Copy the current link from Keystroke Overlay ' +
    '(General → Secure link) into this OBS source.';
  document.body.append(lockedNotice);
}
const getJson = async (url) => {
  const response = await fetch(withKey(url));
  if (response.status === 401) {
    showLocked();
    throw new Error('locked');
  }
  return response.json();
};
if (PREVIEW) document.body.classList.add('preview');
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('selectstart', (e) => e.preventDefault());

const stage = document.getElementById('stage');
const root = document.documentElement;
let settings = null,
  layouts = [],
  fontFiles = [],
  structKey = '';
const keyEls = new Map(); // code -> element
const held = new Set(); // codes currently down (kept across rebuilds)

// ------------------------------------------------------------ module loading
async function loadModules() {
  const modulesJson = await getJson('/api/modules');
  // Themes are only listed in the settings window's Style tab, so OBS (which never asks for them) skips loading them.
  const urls = PREVIEW ? [...modulesJson.animations, ...modulesJson.themes] : modulesJson.animations;
  await Promise.all(
    urls.map((u) => import(u.startsWith('/user/') ? withKey(u) : u).catch((e) => console.warn('module failed', u, e))),
  );
}

// ------------------------------------------------------------ rendering
function fontFaceCss(files) {
  return files
    .map((fileName) => {
      const fam = fileName.replace(/\.[^.]+$/, '');
      const fmt = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' }[
        fileName.split('.').pop().toLowerCase()
      ];
      const url = withKey('/fonts/' + encodeURIComponent(fileName));
      return `@font-face{font-family:"${fam}";src:url("${url}")${fmt ? ` format("${fmt}")` : ''};font-display:block}`;
    })
    .join('\n');
}

function applyVars(nextSettings) {
  const st = nextSettings.style,
    an = nextSettings.animation;
  const set = (k, v) => root.style.setProperty(k, v);
  set('--fill', st.keyFill);
  set('--fill-on', st.keyFillPressed);
  set('--bc', st.borderColor);
  set('--bc-on', st.borderColorPressed);
  set('--bw', st.borderWidth + 'px');
  set('--radius', st.radius + 'px');
  set('--font', `"${st.fontFamily}", "Segoe UI", sans-serif`);
  set('--fs', st.fontSize + 'px');
  set('--fw', st.fontWeight);
  set('--tc', st.textColor);
  set('--tc-on', st.textColorPressed);
  set('--glow-color', st.glowColor);
  set('--glow-size', st.glowSize + 'px');
  set('--opacity', st.opacity);

  const anim = animations.get(an.type) || animations.get('none');
  const spec = anim?.apply({ ms: an.speed, intensity: an.intensity, style: st }) ?? {};
  const user = an.easing !== 'default' ? easings.get(an.easing)?.css : null;
  const pressSpec = spec.press ?? {},
    releaseSpec = spec.release ?? {};
  set('--t-idle', spec.idle ?? 'none');
  set('--t-down', spec.down ?? 'none');
  set('--glow-down', spec.glow ?? 0);
  set('--ms-down', (pressSpec.ms ?? an.speed * 0.6) + 'ms');
  set('--ease-down', user ?? pressSpec.ease ?? 'ease-out');
  set('--ms-up', (releaseSpec.ms ?? an.speed) + 'ms');
  set('--ease-up', user ?? releaseSpec.ease ?? 'ease-out');
}

// Each layout keeps its own disabled keys, custom labels, and moved and resized keys
// (settings.layout.profiles[layoutId]). Positions and sizes belong to a layout style: "shape" (the layout file's own
// shape) or "grid" (every key one key wide in even columns).
function profileOf(nextSettings, layout) {
  const savedProfile = nextSettings.layout.profiles?.[layout?.id] ?? {};
  const layoutStyle = savedProfile.layoutStyle === 'grid' ? 'grid' : 'shape';
  const edits = savedProfile.styles?.[layoutStyle] ?? {};
  return {
    disabledKeys: savedProfile.disabledKeys ?? [],
    labels: savedProfile.labels ?? {},
    layoutStyle,
    positions: edits.positions ?? {},
    sizes: edits.sizes ?? {},
  };
}

// The widest a resized key may be, in key widths. Keep in step with MAX_KEY_WIDTH in settings.rs and profiles.js.
const MAX_KEY_WIDTH = 100;

/** A key as it is drawn: the layout style's place and width, unless the user moved or resized it. */
function placedKey(layoutKey, layout, prof) {
  const inGrid = prof.layoutStyle === 'grid';
  const base = (inGrid && layout.grid?.[layoutKey.code]) || layoutKey;
  const moved = prof.positions[layoutKey.code];
  const baseWidth = inGrid ? 1 : (layoutKey.w ?? 1);
  const resized = prof.sizes[layoutKey.code]?.w;
  const width = resized === undefined ? baseWidth : Math.min(MAX_KEY_WIDTH, Math.max(Math.min(1, baseWidth), resized));
  return { ...layoutKey, x: moved?.x ?? base.x, y: moved?.y ?? base.y, w: width };
}

function build(nextSettings) {
  const layout = layouts.find((l) => l.id === nextSettings.layout.id) ?? layouts[0];
  stage.textContent = '';
  keyEls.clear();
  if (!layout) return;
  const prof = profileOf(nextSettings, layout);
  const off = new Set(prof.disabledKeys);
  // A key the user moved is drawn at its saved position; every other key stays where the layout file puts it. The
  // overlay's size below comes from the keys actually drawn (their positions and widths), so a compact layout is a
  // compact overlay in OBS.
  const keys = layout.keys.filter((k) => !off.has(k.code)).map((layoutKey) => placedKey(layoutKey, layout, prof));
  if (!keys.length) {
    reportSize(0, 0);
    return;
  }
  const { keySize, gap } = nextSettings.style,
    pitch = keySize + gap;
  const minX = Math.min(...keys.map((k) => k.x)),
    minY = Math.min(...keys.map((k) => k.y));
  let maxX = 0,
    maxY = 0;
  const frag = document.createDocumentFragment();
  for (const layoutKey of keys) {
    const keyWidth = (layoutKey.w ?? 1) * pitch - gap,
      keyHeight = (layoutKey.h ?? 1) * pitch - gap;
    maxX = Math.max(maxX, (layoutKey.x - minX) * pitch + keyWidth);
    maxY = Math.max(maxY, (layoutKey.y - minY) * pitch + keyHeight);
    const label = prof.labels[layoutKey.code] ?? layoutKey.label ?? '';
    const el = document.createElement('div');
    el.className = 'key';
    el.dataset.code = layoutKey.code;
    el.style.cssText = `left:${(layoutKey.x - minX) * pitch}px;top:${(layoutKey.y - minY) * pitch}px;width:${keyWidth}px;height:${keyHeight}px`;
    // Shrink long labels to fit narrow keys.
    const fit = Math.min(1, (keyWidth - 10) / Math.max(1, [...label].length * nextSettings.style.fontSize * 0.62));
    const mk = (cls) => {
      const face = document.createElement('div');
      face.className = 'face ' + cls;
      const sp = document.createElement('span');
      sp.textContent = label;
      if (fit < 1) sp.style.setProperty('--f', fit.toFixed(3));
      face.appendChild(sp);
      return face;
    };
    const glow = document.createElement('div');
    glow.className = 'glow';
    el.append(glow, mk('idle'), mk('on'));
    if (held.has(layoutKey.code)) el.classList.add('down');
    frag.appendChild(el);
    keyEls.set(layoutKey.code, el);
  }
  stage.appendChild(frag);
  stage.style.width = maxX + 'px';
  stage.style.height = maxY + 'px';
  reportSize(maxX, maxY);
}

function reportSize(width, height) {
  const sc = settings.style.scale;
  stage.style.left = stage.style.top = PAD + 'px';
  stage.style.transform = `scale(${sc})`;
  const size = { w: Math.ceil(width * sc + PAD * 2), h: Math.ceil(height * sc + PAD * 2) };
  window.__size = size;
  if (PREVIEW) parent.postMessage({ type: 'size', ...size }, '*');
}

// the layout id we already re-read the layout list for (so an id that truly does not exist cannot loop)
let reloadedFor = '';
function apply(nextSettings) {
  settings = nextSettings;
  // The selected layout is not in our list: it was created or imported after we loaded. Re-read the list (once per id).
  if (
    nextSettings.layout.id &&
    !layouts.some((l) => l.id === nextSettings.layout.id) &&
    reloadedFor !== nextSettings.layout.id
  ) {
    reloadedFor = nextSettings.layout.id;
    refresh();
  }
  const layout = layouts.find((l) => l.id === nextSettings.layout.id) ?? layouts[0];
  const key = JSON.stringify([
    layout?.id,
    profileOf(nextSettings, layout),
    nextSettings.style.keySize,
    nextSettings.style.gap,
    nextSettings.style.fontSize,
    nextSettings.style.scale,
  ]);
  applyVars(nextSettings);
  if (key !== structKey) {
    structKey = key;
    build(nextSettings);
  }
}

// ------------------------------------------------------------ key state
let paused = false; // tray "Pause overlay": show nothing, ignore keys
function setPaused(shouldPause) {
  paused = shouldPause;
  stage.style.visibility = shouldPause ? 'hidden' : '';
  if (shouldPause) releaseAll();
}
function setKey(code, down) {
  if (paused && down) return;
  down ? held.add(code) : held.delete(code);
  keyEls.get(code)?.classList.toggle('down', down);
}
function snapshot(list) {
  const want = new Set(list);
  for (const code of [...held]) if (!want.has(code)) setKey(code, false);
  for (const code of want) setKey(code, true);
}
function releaseAll() {
  for (const code of [...held]) setKey(code, false);
}

// ------------------------------------------------------------ data + socket
async function loadFonts() {
  fontFiles = await getJson('/api/fonts');
  document.getElementById('fonts').textContent = fontFaceCss(fontFiles);
  // Ensure custom fonts are ready before measuring/painting.
  await Promise.all(fontFiles.map((f) => document.fonts.load(`16px "${f.replace(/\.[^.]+$/, '')}"`).catch(() => {})));
}
async function refresh() {
  const [cfg, ly] = await Promise.all([getJson('/api/config'), getJson('/api/layouts')]);
  layouts = ly;
  await loadFonts();
  apply(cfg.settings);
  setPaused(!!cfg.paused);
}

let ws,
  retry = 0;
function connect() {
  ws = new WebSocket(withKey(`ws://${location.host}/ws`));
  ws.onopen = () => {
    retry = 0;
  };
  ws.onmessage = (socketEvent) => {
    const message = JSON.parse(socketEvent.data);
    if (message.t === 'd') setKey(message.k, true);
    else if (message.t === 'u') setKey(message.k, false);
    else if (message.t === 'snap') snapshot(message.down);
    // settings arrive inline: no HTTP round trips
    else if (message.t === 'cfg') {
      if (message.s) {
        apply(message.s);
        setPaused(!!message.paused);
      } else refresh();
    }
    // fonts/layouts changed: re-fetch those
    else if (message.t === 'assets') refresh();
  };
  ws.onclose = () => {
    releaseAll(); // never leave keys stuck if the app goes away
    setTimeout(connect, Math.min(5000, 500 * ++retry)); // only runs while disconnected
  };
}

// ------------------------------------------------------------ settings-window preview bridge
if (PREVIEW) {
  addEventListener('message', async (messageEvent) => {
    if (messageEvent.source !== parent) return;
    const message = messageEvent.data || {};
    if (message.type === 'cfg') apply(message.settings);
    else if (message.type === 'refresh') await refresh();
    else if (message.type === 'getRegistry') {
      parent.postMessage(
        {
          type: 'registry',
          animations: [...animations.values()].map((a) => ({ id: a.id, name: a.name })),
          themes: [...themes.values()].map((t) => ({ id: t.id, name: t.name, style: t.style, animation: t.animation })),
          easings: [...easings.values()].map((x) => ({ id: x.id, name: x.name })),
          layouts: layouts.map((l) => ({ id: l.id, name: l.name })),
        },
        '*',
      );
    }
  });
  // Click keys in the preview to test the look without typing.
  stage.addEventListener('pointerdown', (e) => {
    const target = /** @type {Element} */ (e.target);
    const keyElement = /** @type {HTMLElement | null} */ (target.closest('.key'));
    if (keyElement) setKey(keyElement.dataset.code, true);
  });
  addEventListener('pointerup', () => releaseAll());
}

await loadModules();
await refresh();
connect();
if (PREVIEW) parent.postMessage({ type: 'ready' }, '*');
