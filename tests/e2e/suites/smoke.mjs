// Suite: smoke test of every command group, the tray actions, the WebSocket, the privacy guarantees and a
// real signed update (download with progress -> verify -> hand-off). Uses the local mock update server.
import { execSync } from 'node:child_process';
import { connect, listenKeys, appAlive, check, finish, sleep, EXE_NAME, PORT } from '../lib/cdp.mjs';

const VERSION = process.env.E2E_VERSION;           // the app's real version, provided by run.mjs
const p = await connect(); await sleep(2500);
const { invoke: inv, q } = p;

// ---- window + UI
check('settings UI rendered (6 tabs, content)', (await q(`document.querySelectorAll('nav button').length`)) === 6 && (await q(`document.getElementById('pane').children.length`)) > 0);
check('header is just the title', (await q(`document.querySelector('.brand').textContent.trim()`)) === '⌨ Keystroke Overlay');
const st = (await inv('get_state')).ok;
check('get_state', st.version === VERSION && st.settings.version === 2 && st.paused === false);
check('background update check found the mock update (green button visible)', await q(`!document.getElementById('updateBtn').hidden`));

// ---- settings commands
const sv = await inv('save_settings', { settings: { ...st.settings, style: { ...st.settings.style, radius: 21 } } });
check('save_settings', sv.ok === null && (await inv('get_state')).ok.settings.style.radius === 21);
await inv('save_settings', { settings: st.settings });
check('list_layouts', (await inv('list_layouts')).ok.length >= 5);
const sp = await inv('set_port', { port: 7881 });
check('set_port moves the server', sp.ok === 'http://localhost:7881/' && await fetch('http://localhost:7881/api/config').then(r => r.ok).catch(() => false));
check('set_port back', (await inv('set_port', { port: PORT })).ok === `http://localhost:${PORT}/`);
check('set_port rejects <1024', /1024/.test((await inv('set_port', { port: 80 })).err || ''));
check('set_input_method rejects unknown methods', /Unknown/.test((await inv('set_input_method', { method: 'nope' })).err || ''));

// ---- assets commands
check('presets: save, list, load, delete', await (async () => {
  const s = await inv('save_preset', { name: 'e2e/test', data: { style: { radius: 3 } } });
  const listed = (await inv('list_presets')).ok, loaded = (await inv('load_preset', { name: 'e2etest' })).ok, d = await inv('delete_preset', { name: 'e2etest' });
  return s.ok === null && listed.includes('e2etest') && loaded.style.radius === 3 && d.ok === null && !(await inv('list_presets')).ok.includes('e2etest');
})());
check('list_fonts', Array.isArray((await inv('list_fonts')).ok));
check('remove_font rejects path traversal', /bad name/.test((await inv('remove_font', { name: '../x' })).err || ''));

// ---- tray quick actions + WebSocket carrying the settings
const msgs = []; const w = new WebSocket(`ws://localhost:${PORT}/ws`); w.onmessage = e => msgs.push(JSON.parse(e.data)); await new Promise(r => w.onopen = r); await sleep(300);
await inv('set_layout', { id: 'wasd' }); await sleep(400);
check('set_layout broadcasts the settings inside the WebSocket message', msgs.some(m => m.t === 'cfg' && m.s.layout.id === 'wasd'));
check('set_layout rejects unknown ids', /Unknown layout/.test((await inv('set_layout', { id: 'nope' })).err || ''));
await inv('set_layout', { id: 'tkl' });
check('toggle_pause (on, then off)', (await inv('toggle_pause')).ok === true && (await inv('toggle_pause')).ok === false);
check('restart_server', (await inv('restart_server')).ok === null && await (async () => { await sleep(300); return fetch(`http://localhost:${PORT}/api/config`).then(r => r.ok).catch(() => false); })());

// ---- updates module
const cu = (await inv('check_update')).ok;
check('check_update reads the Stable manifest', cu.available === true && cu.version === '1.1.4' && cu.channel === 'stable', JSON.stringify(cu).slice(0, 100));
check('open_release_page blocks links outside this project', /Blocked/.test((await inv('open_release_page', { url: 'https://evil.example' })).err || ''));
check('get_release_notes rejects bad versions', /Bad version/.test((await inv('get_release_notes', { version: '../x' })).err || ''));

// ---- privacy: the app's own sockets
const pid = execSync(`tasklist /FI "IMAGENAME eq ${EXE_NAME}.exe" /FO CSV /NH`).toString().split(',')[1].replace(/"/g, '');
const socks = execSync('netstat -ano').toString().split('\n').filter(l => l.trim().endsWith(' ' + pid));
const external = socks.filter(l => { const c = l.split(/\s+/); return !/127\.0\.0\.1|\[::1\]|0\.0\.0\.0:0|\[::\]:0/.test(c[2] + ' ' + c[3]); });
check('every socket the app holds is loopback-only', external.length === 0, `${socks.length} sockets`);

// ---- the update itself (must be last: the app exits after handing off to the installer)
await p.ev(`window.__prog = []; window.__TAURI__.event.listen('update-progress', e => window.__prog.push(e.payload.done)); document.getElementById('updateBtn').click()`); await sleep(300);
check('update dialog opens from the button', await q(`!document.getElementById('updModal').hidden && document.getElementById('uTitle').textContent.includes('1.1.4')`));
await p.ev(`document.getElementById('uGo').click()`);
let progress = 0;
for (let i = 0; i < 300 && appAlive(); i++) {
  try { progress = await Promise.race([q(`window.__prog.length`), sleep(400).then(() => { throw new Error('gone'); })]); } catch { break; }
  await sleep(30);
}
await sleep(1500);
check('real download reported progress', progress >= 3, `${progress} progress events`);
check('verified installer launched and the app exited for the update', !appAlive());
finish();
