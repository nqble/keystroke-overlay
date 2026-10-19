// Suite: the optional "secure link" (General -> Secure link).
// Off by default; when on, the local server refuses data requests and the key-press stream without the private key,
// the key never reaches the overlay, "Make a new key" invalidates old links, and the live preview keeps working.
import { connect, byTest, inject, listenKeys, check, finish, sleep, PORT, INJECTED_KEYS } from '../lib/cdp.mjs';

const p = await connect();
await sleep(2000);
const base = `http://localhost:${PORT}`;
const status = async (path) => (await fetch(base + path).catch(() => ({ status: 0 }))).status;
const wsOpens = (key) =>
  new Promise((res) => {
    const w = new WebSocket(`ws://localhost:${PORT}/ws${key === null ? '' : '?key=' + key}`);
    const t = setTimeout(() => res(false), 2500);
    w.onopen = () => {
      clearTimeout(t);
      w.close();
      res(true);
    };
    w.onerror = () => {
      clearTimeout(t);
      res(false);
    };
  });
const keyOf = (url) => new URL(url).searchParams.get('key');
const state = async () => (await p.invoke('get_state')).ok;
const toggle = `document.querySelector('${byTest('secure-link-toggle')}')`;
const pageText = () => p.q(`document.querySelector('${byTest('pane')}').innerText`);

// ------------------------------------------------------------ default: off, nothing changes for anyone
await p.ev(`document.querySelector('${byTest('tab', '[data-tab="general"]')}').click()`);
await sleep(500);
let st = await state();
check(
  'secure link is OFF by default and the link is the plain address',
  st.secureLink === false && st.url === `${base}/`,
  st.url,
);
check(
  'General\'s Connection card has the secure-link switch, off, with the "Off (default)" explanation',
  (await p.q(`!!document.querySelector('${byTest('general-connection')}')?.contains(${toggle})`)) &&
    (await p.q(`${toggle}.getAttribute('role') === 'switch' && ${toggle}.getAttribute('aria-checked') === 'false'`)) &&
    /Off \(default\): your OBS URL is simple/.test(await pageText()),
);
check(
  'while off, the copy / new-key buttons are not on screen',
  await p.q(
    `document.querySelector('${byTest('secure-link-copy')}').offsetParent === null && document.querySelector('${byTest('secure-link-new-key')}').offsetParent === null`,
  ),
);
check(
  'while off, data endpoints and the stream work without a key',
  (await status('/api/config')) === 200 && (await wsOpens(null)),
);

// ------------------------------------------------------------ turn it on through the real toggle
await p.ev(`${toggle}.click()`);
await sleep(2000);
st = await state();
const key = keyOf(st.url);
check(
  'turning it on creates a private key and a secure link',
  st.secureLink === true && /^[0-9a-f]{32}$/.test(key || ''),
  st.url.replace(key || '-', '<key>'),
);
check(
  'the explanation changes to "On" and the copy / new-key buttons appear',
  /On: your OBS URL now contains a private key/.test(await pageText()) &&
    (await p.q(
      `!!document.querySelector('${byTest('secure-link-copy')}') && !!document.querySelector('${byTest('secure-link-new-key')}')`,
    )),
);
check(
  'the switch says on (aria-checked) for screen readers',
  (await p.q(`${toggle}.getAttribute('aria-checked')`)) === 'true',
);
check(
  'the OBS URL box is hidden on screen (password field)',
  (await p.q(`document.querySelector('${byTest('obs-url')}').type`)) === 'password',
);

for (const path of [
  '/api/config',
  '/api/layouts',
  '/api/fonts',
  '/api/modules',
  '/fonts/x.ttf',
  '/user/layouts/x.json',
]) {
  check(`no key -> refused: ${path}`, (await status(path)) === 401);
}
check('wrong key -> refused', (await status('/api/config?key=00000000000000000000000000000000')) === 401);
check(
  'right key -> allowed',
  (await status(`/api/config?key=${key}`)) === 200 && (await status(`/api/layouts?key=${key}`)) === 200,
);
check(
  'the overlay page and its public code stay open (nothing private in them)',
  (await status('/')) === 200 && (await status('/overlay/overlay.js')) === 200,
);
const cfgBody = await (await fetch(`${base}/api/config?key=${key}`)).text();
check(
  'the key is never included in what the overlay receives (/api/config)',
  !cfgBody.includes(key) && !/linkKey/.test(cfgBody),
);

// ------------------------------------------------------------ the key-press stream
check(
  'stream without key -> refused; wrong key -> refused',
  !(await wsOpens(null)) && !(await wsOpens('0'.repeat(32))),
);
check('stream with the right key -> allowed', await wsOpens(key));
const raw = [];
const events = [];
const w = new WebSocket(`ws://localhost:${PORT}/ws?key=${key}`);
w.onmessage = (e) => {
  raw.push(e.data);
  const m = JSON.parse(e.data);
  if ((m.t === 'd' || m.t === 'u') && INJECTED_KEYS.has(m.k)) events.push((m.t === 'd' ? '+' : '-') + m.k);
};
await new Promise((r) => (w.onopen = r));
await sleep(300);
await inject('flood', 1);
await sleep(800);
check(
  'key presses flow through the secured stream',
  events.join(' ') === '+ControlRight -ControlRight',
  events.join(' '),
);
await p.invoke('set_layout', { id: 'wasd' });
await sleep(500);
await p.invoke('set_layout', { id: 'tkl' });
await sleep(400);
check(
  'settings pushed over the stream never contain the key',
  raw.some((m) => m.includes('"t":"cfg"')) && !raw.some((m) => m.includes(key)),
);

// ------------------------------------------------------------ the live preview keeps working while secured
await p.ev(
  `window.__m = []; addEventListener('message', e => window.__m.push(e.data && e.data.type)); __ko.frame.src = __ko.previewSrc();`,
);
await sleep(3500);
const msgs = await p.q(`window.__m`);
check(
  'the live preview inside settings still loads (it carries the key)',
  msgs.includes('ready') && msgs.includes('size') && !msgs.includes('locked'),
  JSON.stringify(msgs),
);
// an out-of-date link (what an old OBS source has) tells the user what to do
await p.ev(
  `window.__m = []; const f = document.createElement('iframe'); f.id = 'oldlink'; f.style.display = 'none'; f.src = '${base}/?preview=1'; document.body.append(f);`,
);
await sleep(3500);
check(
  'an old / keyless link shows a "link is secured" message instead of a blank overlay',
  (await p.q(`window.__m`)).includes('locked'),
);
await p.ev(`document.getElementById('oldlink').remove()`);

// ------------------------------------------------------------ the settings window cannot weaken it by accident
const S = (await state()).settings;
await p.invoke('save_settings', { settings: { ...S, general: { ...S.general, secureLink: false, linkKey: '' } } });
st = await state();
check(
  'saving settings from the window cannot switch it off or change the key',
  st.secureLink === true && keyOf(st.url) === key,
);

// ------------------------------------------------------------ "Make a new key" cuts off old links
await p.ev(
  `const b = () => document.querySelector('${byTest('secure-link-new-key')}'); b().click(); await new Promise(r => setTimeout(r, 250)); b().click();`,
);
await sleep(2200);
st = await state();
const key2 = keyOf(st.url);
check('"Make a new key" (two clicks) creates a different key', /^[0-9a-f]{32}$/.test(key2 || '') && key2 !== key);
check(
  'the header asks to copy the new link at once (it used to wait for some other redraw)',
  /copy it again/.test(await p.q(`document.querySelector('${byTest('obs-status')}').textContent`)),
);
check(
  'the OLD key stops working immediately; the new one works',
  (await status(`/api/config?key=${key}`)) === 401 &&
    (await status(`/api/config?key=${key2}`)) === 200 &&
    !(await wsOpens(key)) &&
    (await wsOpens(key2)),
);

// ------------------------------------------------------------ turn it off again: back to the simple link
await p.ev(`${toggle}.click()`);
await sleep(2000);
st = await state();
check(
  'turning it off returns the plain link and open endpoints',
  st.secureLink === false && st.url === `${base}/` && (await status('/api/config')) === 200 && (await wsOpens(null)),
);
check(
  'the OBS URL box is visible text again',
  (await p.q(`document.querySelector('${byTest('obs-url')}').type`)) === 'text',
);
finish();
