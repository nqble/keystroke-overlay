// Suite: keyboard input methods (Standard hook vs Compatibility Raw Input).
// Injects real key presses and checks both methods deliver the same events, switching is clean, and cost is low.
import { connect, inject, procStats, listenKeys, check, finish, sleep } from '../lib/cdp.mjs';

const p = await connect();
await sleep(1500);
const events = await listenKeys();
await sleep(300);
const run = async (scenario, n = 1, settle = 800) => {
  events.length = 0;
  await inject(scenario, n);
  await sleep(settle);
  return [...events];
};
const EXPECT = [
  '+KeyW',
  '-KeyW',
  '+ControlRight',
  '-ControlRight',
  '+Space',
  '+KeyA',
  '-Space',
  '-KeyA',
  '+NumpadEnter',
  '-NumpadEnter',
  '+Enter',
  '-Enter',
  '+PrintScreen',
  '-PrintScreen',
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const select = `[...document.querySelectorAll('#pane select')].find(s => [...s.options].some(o => o.value === 'rawinput'))`;

// ------------------------------------------------------------ the General tab section
await p.ev(`[...document.querySelectorAll('nav button')].find(b => b.textContent === 'General').click()`);
await sleep(500);
const ui = await p.q(
  `(() => { const s = ${select}; return { has: !!s, value: s?.value, labels: s && [...s.options].map(o => o.textContent), sections: [...document.querySelectorAll('#pane h2')].map(h => h.textContent) }; })()`,
);
const pageText = () => p.q(`document.getElementById('pane').innerText`);
check('General has a "Keyboard input" section', ui.sections.includes('Keyboard input'));
check(
  'default is Standard (hook), listed as recommended',
  ui.has && ui.value === 'hook' && /recommended/.test(ui.labels[0]) && /Compatibility/.test(ui.labels[1]),
);
check('help text explains Standard', /Standard is what the app has always used/.test(await pageText()));
check(
  'help text covers administrator games and says to leave it on Standard if unsure',
  /runs as administrator/.test(await pageText()) && /Leave it on Standard/.test(await pageText()),
);
check('backend reports "hook" as the active method', (await p.invoke('get_state')).ok.inputActive === 'hook');

// ------------------------------------------------------------ Standard (hook)
const hookSeq = await run('seq');
check(
  'hook: correct sequence (OS repeats dropped, extended keys, overlapping keys, PrintScreen)',
  same(hookSeq, EXPECT),
  hookSeq.join(' '),
);

// ------------------------------------------------------------ switch through the real UI control
await p.ev(`const s = ${select}; s.value = 'rawinput'; s.dispatchEvent(new Event('change', { bubbles: true }))`);
await sleep(700);
const st = (await p.invoke('get_state')).ok;
check(
  'choosing Compatibility switches live and is saved',
  st.inputActive === 'rawinput' && st.settings.general.inputMethod === 'rawinput' && !st.inputError,
);
check(
  'help text changes to explain Compatibility',
  /Compatibility reads your keys straight from the keyboard/.test(await pageText()),
);
const rawSeq = await run('seq');
check('Raw Input delivers the same sequence as the hook', same(rawSeq, EXPECT), rawSeq.join(' '));

// ------------------------------------------------------------ switching is clean
const before = procStats();
let doubled = 0,
  lost = 0;
for (let i = 0; i < 20; i++) {
  await p.invoke('set_input_method', { method: i % 2 ? 'hook' : 'rawinput' });
  await sleep(120);
  const ev = await run('flood', 1, 500);
  if (ev.length > 2) doubled++;
  if (ev.length < 2) lost++;
}
const after = procStats();
check(
  '20 live switches: exactly one down + one up per key (never doubled)',
  doubled === 0,
  `doubled ${doubled}, lost ${lost}`,
);
check(
  '20 live switches: no thread or handle leak',
  after[0] <= before[0] + 1 && after[1] <= before[1] + 12,
  `threads ${before[0]}->${after[0]}, handles ${before[1]}->${after[1]}`,
);

await p.invoke('set_input_method', { method: 'hook' });
await sleep(200);
events.length = 0;
await inject('hold');
await sleep(300);
const held = events.includes('+ControlRight');
await p.invoke('set_input_method', { method: 'rawinput' });
await sleep(400);
check(
  'a key held during a switch is released (never stuck)',
  held && events.includes('-ControlRight'),
  events.join(' '),
);
await inject('release');
await sleep(300);

// ------------------------------------------------------------ cost
for (const m of ['hook', 'rawinput']) {
  await p.invoke('set_input_method', { method: m });
  await sleep(300);
  const a = procStats();
  events.length = 0;
  const t0 = Date.now();
  await inject('flood', 4000);
  await sleep(1200);
  const secs = (Date.now() - t0) / 1000,
    b = procStats(),
    cpu = (((b[3] - a[3]) / 1000 / secs) * 100).toFixed(2);
  check(
    `${m}: an 8000-event flood is fully delivered (${events.length}/8000, ${cpu}% of one core)`,
    events.length >= 7900,
  );
}
for (const m of ['hook', 'rawinput']) {
  await p.invoke('set_input_method', { method: m });
  await sleep(2500);
  const a = procStats();
  await sleep(15000);
  const b = procStats();
  const idle = (((b[3] - a[3]) / 15000) * 100).toFixed(3);
  check(`${m}: idle CPU is ~0`, +idle < 0.3, `${idle}% of one core`);
}
await p.invoke('set_input_method', { method: 'hook' });
finish();
