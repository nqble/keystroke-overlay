// Suite: the live keyboard preview inside the settings window must light up keys whether or not the settings window
// itself has keyboard focus (regression test for "keys only show up when I click outside the app").
// Each state is tried several times after a warm-up press, so one-off injector hiccups can't fake a result.
import { connect, inject, listenKeys, focus, check, finish, sleep, PORT } from '../lib/cdp.mjs';

const TRIES = 5;
const p = await connect(); await sleep(3500);          // let the preview frame finish loading
const S0 = (await p.invoke('get_state')).ok.settings;
// so minimizing doesn't close the window
await p.invoke('save_settings', { settings: { ...S0, general: { ...S0.general, minimizeToTray: false } } });
const events = await listenKeys(); await sleep(300);
const downInPreview = code => p.evIn(`localhost:${PORT}`, `return document.querySelector('[data-code="${code}"]')?.classList.contains('down') ?? null`);

async function press() {
  events.length = 0;
  await inject('hold'); await sleep(500);              // Right Ctrl goes DOWN and stays down
  const wsSaw = events.includes('+ControlRight');
  const shown = await downInPreview('ControlRight').catch(() => null);
  await inject('release'); await sleep(400);
  return { wsSaw, shown };
}
async function state(label, to) {
  const front = await focus(to);
  const pageFocus = await p.q(`document.hasFocus()`);
  await press();                                       // warm-up press, ignored
  const r = []; for (let i = 0; i < TRIES; i++) r.push(await press());
  const reached = r.filter(x => x.wsSaw).length, lit = r.filter(x => x.shown === true).length;
  console.log(`   [${label}] foreground ok: ${front} | page focus: ${pageFocus} | key reached the overlay stream ${reached}/${TRIES} | preview key lit ${lit}/${TRIES}`);
  return { front, pageFocus, reached, lit };
}

const app = await state('settings window in front and focused', 'app');
check('test setup: the settings window really is in front with focus', app.front && app.pageFocus === true);
check(`window focused: key presses reach the overlay stream (${app.reached}/${TRIES})`, app.reached === TRIES);
check(`window focused: the preview key lights up (${app.lit}/${TRIES})`, app.lit === TRIES);

const away = await state('settings window NOT in focus (minimized)', 'away');
check('test setup: the settings window really lost focus', away.front);
check(`window not in focus: key presses reach the overlay stream (${away.reached}/${TRIES})`, away.reached === TRIES);
check(`window not in focus: the preview key lights up (${away.lit}/${TRIES})`, away.lit === TRIES);
finish();
