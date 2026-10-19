// Suite: smoke test of every command group, the tray actions, the WebSocket, the privacy guarantees and a
// real signed update (download with progress -> verify -> hand-off). Uses the local mock update server.
import { execSync } from 'node:child_process';
import net from 'node:net';
import { connect, byTest, listenKeys, appAlive, check, finish, sleep, EXE_NAME, PORT } from '../lib/cdp.mjs';

const SETTINGS_VERSION = 4; // the settings file format version (CURRENT_VERSION in src-tauri/src/settings.rs)
const VERSION = process.env.E2E_VERSION; // the app's real version, provided by run.mjs
const p = await connect();
await sleep(2500);
const { invoke: inv, q } = p;

// ---- window + UI
check(
  'settings UI rendered (6 tabs, content)',
  (await q(`document.querySelectorAll('${byTest('tab')}').length`)) === 6 &&
    (await q(`document.querySelector('${byTest('pane')}').children.length`)) > 0,
);
check(
  'header shows the logo and title on the left and the three window buttons on the right',
  await q(
    `document.querySelector('${byTest('brand-title')}').textContent.trim() === 'Keystroke Overlay' && !!document.querySelector('${byTest('window-minimize')}') && !!document.querySelector('${byTest('window-maximize')}') && !!document.querySelector('${byTest('window-close')}')`,
  ),
);
const st = (await inv('get_state')).ok;
check('get_state', st.version === VERSION && st.settings.version === SETTINGS_VERSION && st.paused === false);
check(
  'background update check found the mock update (update button visible)',
  await q(`!document.querySelector('${byTest('update-button')}').hidden`),
);

check(
  'the tray got its update indicator (orange dot + "Update available" entry)',
  (await inv('get_state')).ok.updateBadge === true,
);
// the tray entry opens General: simulate the event the app sends to an already-open window
await p.ev(`window.__TAURI__.event.emit('goto-tab', 'keys')`);
await sleep(500);
check(
  'a "goto-tab" request switches the open window to that tab',
  (await q(`document.querySelector('${byTest('tab', '.active')}').dataset.tab`)) === 'keys',
);
await p.ev(`window.__TAURI__.event.emit('goto-tab', 'general')`);
await sleep(500);
check(
  '...and the General tab shows the pending update with its Install button',
  (await q(`document.querySelector('${byTest('tab', '.active')}').dataset.tab`)) === 'general' &&
    (await q(
      `(() => { const b = document.querySelector('${byTest('update-install')}'); return !!b && b.textContent === 'Install update' && !b.hidden; })()`,
    )),
);

// ---- settings commands
const sv = await inv('save_settings', { settings: { ...st.settings, style: { ...st.settings.style, radius: 21 } } });
check('save_settings', sv.ok === null && (await inv('get_state')).ok.settings.style.radius === 21);
await inv('save_settings', { settings: st.settings });
check('list_layouts', (await inv('list_layouts')).ok.length >= 4);
// a port nobody is using (7881 is the devbuild's own port, so a devbuild running on this PC would get in the way)
const freePort = await new Promise((resolve) => {
  const probe = net.createServer().listen(0, '127.0.0.1', () => {
    const port = probe.address().port;
    probe.close(() => resolve(port));
  });
});
const sp = await inv('set_port', { port: freePort });
check(
  'set_port moves the server',
  sp.ok === `http://localhost:${freePort}/` &&
    (await fetch(`http://localhost:${freePort}/api/config`)
      .then((r) => r.ok)
      .catch(() => false)),
);
check('set_port back', (await inv('set_port', { port: PORT })).ok === `http://localhost:${PORT}/`);
check('set_port rejects <1024', /1024/.test((await inv('set_port', { port: 80 })).err || ''));
check(
  'set_input_method rejects unknown methods',
  /Unknown/.test((await inv('set_input_method', { method: 'nope' })).err || ''),
);

// ---- assets commands
check(
  'presets: save, list, load, delete',
  await (async () => {
    const s = await inv('save_preset', { name: 'e2e/test', data: { style: { radius: 3 } } });
    const listed = (await inv('list_presets')).ok,
      loaded = (await inv('load_preset', { name: 'e2etest' })).ok,
      d = await inv('delete_preset', { name: 'e2etest' });
    return (
      s.ok === null &&
      listed.includes('e2etest') &&
      loaded.style.radius === 3 &&
      d.ok === null &&
      !(await inv('list_presets')).ok.includes('e2etest')
    );
  })(),
);
check('list_fonts', Array.isArray((await inv('list_fonts')).ok));
check('remove_font rejects path traversal', /bad name/.test((await inv('remove_font', { name: '../x' })).err || ''));

// ---- tray quick actions + WebSocket carrying the settings
const msgs = [];
const w = new WebSocket(`ws://localhost:${PORT}/ws`);
w.onmessage = (e) => msgs.push(JSON.parse(e.data));
await new Promise((r) => (w.onopen = r));
await sleep(300);
await inv('set_layout', { id: 'wasd' });
await sleep(400);
check(
  'set_layout broadcasts the settings inside the WebSocket message',
  msgs.some((m) => m.t === 'cfg' && m.s.layout.id === 'wasd'),
);
check('set_layout rejects unknown ids', /Unknown layout/.test((await inv('set_layout', { id: 'nope' })).err || ''));
await inv('set_layout', { id: 'tkl' });
check(
  'toggle_pause (on, then off)',
  (await inv('toggle_pause')).ok === true && (await inv('toggle_pause')).ok === false,
);
check(
  'restart_server',
  (await inv('restart_server')).ok === null &&
    (await (async () => {
      await sleep(300);
      return fetch(`http://localhost:${PORT}/api/config`)
        .then((r) => r.ok)
        .catch(() => false);
    })()),
);

// ---- the website guard (server.rs from_this_server): a web page or a DNS-rebinding trick gets 403, for data and stream
/** Sends one raw HTTP request (so the Host and Origin headers are exactly ours) and returns the status code. */
const statusOf = (path, headers, extraLines = []) =>
  new Promise((resolve) => {
    const socket = net.connect(PORT, '127.0.0.1');
    const lines = [
      `GET ${path} HTTP/1.1`,
      ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
      ...extraLines,
    ];
    socket.on('connect', () => socket.write(lines.join('\r\n') + '\r\n\r\n'));
    socket.once('data', (data) => {
      resolve(Number(String(data).split(' ')[1]));
      socket.destroy();
    });
    socket.on('error', () => resolve(0));
  });
const WS_UPGRADE = {
  Upgrade: 'websocket',
  Connection: 'Upgrade',
  'Sec-WebSocket-Version': '13',
  'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
};
const THIS_HOST = `localhost:${PORT}`;
check('guard: OBS-style request (no Origin) is allowed', (await statusOf('/api/config', { Host: THIS_HOST })) === 200);
check(
  'guard: a website (foreign Origin) is refused, for data and for the key stream',
  (await statusOf('/api/config', { Host: THIS_HOST, Origin: 'http://evil.example' })) === 403 &&
    (await statusOf('/ws', { Host: THIS_HOST, Origin: 'http://evil.example', ...WS_UPGRADE })) === 403,
);
check(
  'guard: DNS rebinding (a foreign Host name for 127.0.0.1) is refused',
  (await statusOf('/ws', { Host: `evil.example:${PORT}`, ...WS_UPGRADE })) === 403,
);

check(
  'guard: two Host headers are refused (400), so the first cannot hide the second',
  (await statusOf('/api/config', { Host: THIS_HOST }, [`Host: evil.example:${PORT}`])) === 400,
);
check(
  'guard: a request line addressed to another site is refused, a correctly addressed one is allowed',
  (await statusOf(`http://evil.example:${PORT}/api/config`, { Host: THIS_HOST })) === 403 &&
    (await statusOf(`http://${THIS_HOST}/api/config`, { Host: THIS_HOST })) === 200,
);

// ---- updates module
const cu = (await inv('check_update')).ok;
check(
  'check_update reads the Stable manifest',
  cu.available === true && cu.version === '1.1.4' && cu.channel === 'stable',
  JSON.stringify(cu).slice(0, 100),
);
check(
  'open_release_page blocks links outside this project',
  /Blocked/.test((await inv('open_release_page', { url: 'https://evil.example' })).err || ''),
);
check(
  'get_release_notes rejects bad versions',
  /Bad version/.test((await inv('get_release_notes', { version: '../x' })).err || ''),
);

// ---- privacy: the app's own sockets
const pid = execSync(`tasklist /FI "IMAGENAME eq ${EXE_NAME}.exe" /FO CSV /NH`)
  .toString()
  .split(',')[1]
  .replace(/"/g, '');
const socks = execSync('netstat -ano')
  .toString()
  .split('\n')
  .filter((l) => l.trim().endsWith(' ' + pid));
const external = socks.filter((l) => {
  const c = l.split(/\s+/);
  return !/127\.0\.0\.1|\[::1\]|0\.0\.0\.0:0|\[::\]:0/.test(c[2] + ' ' + c[3]);
});
check('every socket the app holds is loopback-only', external.length === 0, `${socks.length} sockets`);

// ---- the update itself (must be last: the app exits after handing off to the installer)
await p.ev(
  `window.__prog = []; window.__TAURI__.event.listen('update-progress', e => window.__prog.push(e.payload.done)); document.querySelector('${byTest('update-button')}').click()`,
);
await sleep(300);
check(
  'update dialog opens from the button',
  await q(
    `!document.querySelector('${byTest('update-popup')}').hidden && document.querySelector('${byTest('update-title')}').textContent.includes('1.1.4')`,
  ),
);
await p.ev(`document.querySelector('${byTest('update-go')}').click()`);
let progress = 0;
for (let i = 0; i < 300 && appAlive(); i++) {
  try {
    progress = await Promise.race([
      q(`window.__prog.length`),
      sleep(400).then(() => {
        throw new Error('gone');
      }),
    ]);
  } catch {
    break;
  }
  await sleep(30);
}
await sleep(1500);
check('real download reported progress', progress >= 3, `${progress} progress events`);
check('verified installer launched and the app exited for the update', !appAlive());
finish();
