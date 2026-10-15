// Suite: the "What's new" popup appears exactly once after an update, and never again on later launches
// (whether or not the user clicked OK), and a normal launch with no update never shows it.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { connect, check, finish, sleep, PORT, EXE_NAME } from '../lib/cdp.mjs';

const VERSION = process.env.E2E_VERSION, EXE = process.env.E2E_EXE, DATA = process.env.E2E_DATA;
const SETTINGS = join(DATA, 'settings.json');
const popupShown = p => p.q(`!document.getElementById('modal').hidden`);
const seen = () => JSON.parse(readFileSync(SETTINGS, 'utf8')).general.lastSeenVersion;

/** Quit the app, pretend the last version the user saw was `lastSeen` (null = leave as is), start it again, connect. */
async function relaunch(p, lastSeen) {
  p?.close();
  spawnSync('taskkill', ['/F', '/IM', `${EXE_NAME}.exe`], { stdio: 'ignore' }); await sleep(1500);
  if (lastSeen !== null) { const s = JSON.parse(readFileSync(SETTINGS, 'utf8')); s.general.lastSeenVersion = lastSeen; writeFileSync(SETTINGS, JSON.stringify(s)); }
  spawnSync('powershell.exe', ['-NoProfile', '-Command', `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'; Start-Process '${EXE}'`], { stdio: 'ignore' });
  for (let i = 0; i < 80; i++) { if (await fetch(`http://localhost:${PORT}/api/config`).then(r => r.ok).catch(() => false)) break; await sleep(250); }
  const q = await connect(); await sleep(3000); return q;
}

let p = await connect(); await sleep(2500);
check('a normal launch (no update happened) does not show the popup', !(await popupShown(p)));

// ---- after an update: shown, user clicks OK
p = await relaunch(p, '1.0.0');
check('first launch after an update shows "What\'s new"', await popupShown(p) && /What's new/.test(await p.q(`document.getElementById('mTitle').textContent`)));
check('it is already marked as seen (so it can never repeat)', seen() === VERSION);
await p.ev(`document.getElementById('mOk').click()`); await sleep(400);
check('clicking OK closes it', !(await popupShown(p)));
p = await relaunch(p, null);
check('launching again does NOT show it', !(await popupShown(p)));
p = await relaunch(p, null);
check('...and a third time does not either', !(await popupShown(p)) && seen() === VERSION);

// ---- after another update: shown, the user closes the app WITHOUT clicking OK
p = await relaunch(p, '1.1.0');
check('the next update shows it again', await popupShown(p));
p = await relaunch(p, null);
check('quitting without clicking OK does not bring it back', !(await popupShown(p)));

finish();
