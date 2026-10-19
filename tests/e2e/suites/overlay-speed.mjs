// How long does the overlay take to apply a settings change? (optional suite: npm run test:e2e -- --suite overlay-speed)
// It runs inside the overlay page that the settings window shows as its live preview. For each kind of change it hands the
// overlay new settings, exactly as the settings window does while you drag a slider, and times how long the overlay's own work
// takes (in milliseconds, the median of many changes, on a full keyboard layout):
//   color    a color changes: only CSS variables change (the cheapest case)
//   size      key size, gap, font size or scale changes: today the overlay builds every key again
//   hide      one key is hidden or shown
// The numbers are printed so a change to the overlay can be compared before and after; they are not pass/fail limits, except
// that a color change must stay cheap.
import { connect, check, finish, sleep, PORT } from '../lib/cdp.mjs';

const p = await connect();
await sleep(3500); // the first screen and the preview have loaded
await p.invoke('save_settings', {
  settings: { ...(await p.invoke('get_state')).ok.settings, layout: { id: 'full', profiles: {} } },
});
await p.ev(`await window.__ko.resync()`);
await sleep(1500);

const result = JSON.parse(
  await p.evIn(
    `localhost:${PORT}`,
    `
    const base = (await (await fetch('/api/config')).json()).settings;
    const send = (change) => {
      const next = JSON.parse(JSON.stringify(base));
      change(next);
      const start = performance.now();
      // the same message the settings window posts to this page (the handler works on the settings straight away)
      dispatchEvent(new MessageEvent('message', { data: { type: 'cfg', settings: next }, source: parent }));
      return performance.now() - start;
    };
    const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
    const time = (change, rounds = 60) => {
      const list = [];
      for (let i = 0; i < rounds; i++) list.push(send((s) => change(s, i)));
      return median(list);
    };
    const out = {
      colour: time((s, i) => { s.style.keyFill = '#' + (0x202020 + (i % 16) * 0x010101).toString(16) + 'ff'; }),
      size: time((s, i) => { s.style.keySize = 40 + (i % 12); }),
      hide: time((s, i) => { s.layout.profiles.full = { disabledKeys: i % 2 ? ['KeyA'] : [] }; }),
      keys: document.querySelectorAll('.key').length,
    };
    return JSON.stringify(out);
  `,
  ),
);
console.log(`\n  keys on screen: ${result.keys}`);
console.log(`  color change   ${result.colour.toFixed(2)} ms`);
console.log(`  size change     ${result.size.toFixed(2)} ms`);
console.log(`  hide a key      ${result.hide.toFixed(2)} ms`);
check('the overlay shows a full keyboard', result.keys > 80, String(result.keys));
check('a color change stays cheap (under 2 ms)', result.colour < 2, `${result.colour.toFixed(2)} ms`);
p.close();
finish();
