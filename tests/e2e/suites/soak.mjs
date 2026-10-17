// Suite: a short endurance run. Two minutes of steady typing plus settings changes, layout creation/deletion and
// window tab switching, then checks that threads, handles and memory did not keep growing and every key still arrives.
import { connect, byTest, inject, procStats, listenKeys, check, finish, sleep } from '../lib/cdp.mjs';

const p = await connect();
await sleep(3000);
const events = await listenKeys();
await sleep(300);
const start = procStats(); // [threads, handles, workingSetMB, cpuMs]
let sent = 0,
  errs = 0;
await p.ev(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message)));`);
const tabs = ['layout', 'keys', 'style', 'animation', 'general'];
const t0 = Date.now();
for (let i = 0; Date.now() - t0 < 120000; i++) {
  await inject('flood', 25);
  sent += 25;
  await p.ev(`document.querySelector('${byTest('tab', `[data-tab="${tabs[i % tabs.length]}"]`)}').click()`);
  if (i % 10 === 0) {
    // churn: make and delete a layout, nudge a setting
    const r = await p.invoke('create_layout', { name: 'Soak ' + i });
    if (r.ok) await p.invoke('delete_layout', { id: r.ok });
    else errs++;
    const S = (await p.invoke('get_state')).ok.settings;
    await p.invoke('save_settings', { settings: { ...S, style: { ...S.style, radius: 8 + (i % 5) } } });
  }
  await sleep(900);
}
await sleep(1500);
const end = procStats();
const got = events.filter((e) => e.startsWith('+')).length;
console.log(
  `   ${sent} presses sent, ${got} received; threads ${start[0]}->${end[0]}, handles ${start[1]}->${end[1]}, memory ${start[2]}->${end[2]} MB`,
);
check('every key press arrived over the two minutes', got >= sent - 2, `${got}/${sent}`);
check('no thread growth', end[0] <= start[0] + 2);
check('no handle leak', end[1] <= start[1] + 30);
check('memory stays flat (under +25 MB)', end[2] <= start[2] + 25);
check('layout create/delete churn never failed', errs === 0);
check('no JavaScript errors in the window', (await p.q(`window.__errs.length`)) === 0);
finish();
