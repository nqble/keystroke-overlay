// How fast does switching tabs feel? (optional suite: run with  npm run test:e2e -- --suite tab-speed)
// For every tab it measures two times from the click, in milliseconds (the median of several rounds):
//   swap   until the new page replaced the old one (the work the window does itself, to a fraction of a millisecond)
//   paint  until the page is also painted on screen (two animation frames later, so it never reads less than one frame)
// and for two cases:
//   built    the page has to be built (what every switch cost before pages were reused: kept pages are thrown away first)
//   reused   the page was built before and nothing changed since (what switching costs now)
// The plan's target for a reused tab is under 50 ms.
import { connect, check, finish, sleep } from '../lib/cdp.mjs';

const TABS = ['layout', 'keys', 'style', 'animation', 'fonts', 'general'];
const ROUNDS = 9;
const p = await connect();
await sleep(3500); // let the first screen, the preview and the idle preloading finish

const result = JSON.parse(
  await p.ev(`
    const pane = document.querySelector('#pane');
    const nextFrames = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    // click a tab and wait until its page replaced the old one and was painted; returns [swap ms, painted ms]
    const open = async (id) => {
      const before = pane.firstChild;
      const t0 = performance.now();
      document.querySelector('[data-test="tab"][data-tab="' + id + '"]').click();
      while (pane.firstChild === before) await new Promise((r) => setTimeout(r, 0));
      const swap = performance.now() - t0;
      await nextFrames();
      return [swap, performance.now() - t0];
    };
    const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
    const out = {};
    for (const id of ${JSON.stringify(TABS)}) {
      const built = [], reused = [], builtPaint = [], reusedPaint = [];
      const elsewhere = id === 'general' ? 'layout' : 'general';
      for (let round = 0; round < ${ROUNDS}; round++) {
        await open(elsewhere);
        await window.__ko.render(); // a redraw throws the kept pages away (and rebuilds the tab we are on)
        const first = await open(id);
        built.push(first[0]); builtPaint.push(first[1]);
        await open(elsewhere);
        const again = await open(id); // the page of "id" was kept when we left it
        reused.push(again[0]); reusedPaint.push(again[1]);
      }
      out[id] = { built: median(built), reused: median(reused), builtPaint: median(builtPaint), reusedPaint: median(reusedPaint) };
    }
    return JSON.stringify(out);
  `),
);

const cell = (n, width) => n.toFixed(2).padStart(width);
console.log('\n  tab         swap: built  reused     painted: built  reused   (ms)');
for (const [id, t] of Object.entries(result)) {
  console.log(
    `  ${id.padEnd(10)}  ${cell(t.built, 11)} ${cell(t.reused, 7)}      ${cell(t.builtPaint, 13)} ${cell(t.reusedPaint, 7)}`,
  );
}
for (const [id, t] of Object.entries(result)) {
  // the tabs that are kept must be fast when reused; keys and general are always built, so they are only reported
  if (['layout', 'style', 'animation', 'fonts'].includes(id)) {
    check(`${id}: a reused page is on screen in under 50 ms`, t.reusedPaint < 50, `${t.reusedPaint.toFixed(1)} ms`);
    check(
      `${id}: reusing is no slower than building`,
      t.reused <= t.built,
      `${t.reused.toFixed(2)} vs ${t.built.toFixed(2)} ms`,
    );
  }
}
p.close();
finish();
