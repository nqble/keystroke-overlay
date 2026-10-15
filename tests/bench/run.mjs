// Performance comparison: builds old releases and the current code as isolated test copies, then measures them side by
// side.
//   node tests/bench/run.mjs [--runs 5]        (uses the same throwaway test identity/ports as the e2e tests; never
//   touches the real app)
// Measures: program size, time until the settings window is usable, tray-only idle (threads, handles, memory, CPU),
// the settings window's total memory (app + WebView2 helpers) and process count, and CPU while 8000 key events flood
// in.
import { spawnSync, spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, copyFileSync, statSync, symlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { acquire } from '../lib/lock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..'), E2E = join(ROOT, 'tests/e2e/lib');
const args = process.argv.slice(2);
const RUNS = +(args[args.indexOf('--runs') + 1] || 5);
const WORK = process.env.BENCH_WORK ?? join(tmpdir(), 'keyoverlay-bench');
const DATA = join(process.env.APPDATA, 'com.keyoverlay.test');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VERSIONS = [{ name: 'v1.1.0', ref: 'b053bc3' }, { name: 'v1.1.1', ref: 'b596d73' }, { name: 'v1.1.2', ref: '45456a9' }, { name: 'v1.2.0', ref: null }];
const sh = (cmd, a, o = {}) => spawnSync(cmd, a, { shell: true, stdio: 'inherit', ...o });
const kill = () => spawnSync('taskkill', ['/F', '/IM', 'kotest-e2e.exe'], { stdio: 'ignore' });
const ps = (file, ...a) => execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${file}" ${a.join(' ')}`).toString().trim();
// [processes, privateMB, workingSetMB]
const tree = () => ps(join(HERE, 'tree.ps1')).split(' ').map(Number);
// [threads, handles, workingSetMB, cpuMs]
const proc = () => ps(join(E2E, 'proc.ps1')).split(' ').map(s => +s.replace(/,/g, ''));
const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const lock = await acquire('performance comparison', { expectedMinutes: 25 });
mkdirSync(WORK, { recursive: true });
const cfg = join(WORK, 'cfg.json'); writeFileSync(cfg, JSON.stringify({ identifier: 'com.keyoverlay.test' }));

// ---------------------------------------------------------------- build every version once
for (const v of VERSIONS) {
  v.exe = join(WORK, v.name, 'kotest-e2e.exe'); mkdirSync(join(WORK, v.name), { recursive: true });
  if (existsSync(v.exe)) continue;
  console.log(`\n> Building ${v.name}`);
  let dir = ROOT;
  if (v.ref) {
    dir = join(WORK, 'src-' + v.name); sh('git', ['worktree', 'add', '--detach', `"${dir}"`, v.ref], { cwd: ROOT, stdio: 'ignore' });
    try { symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'junction'); } catch { /* exists */ }
  }
  const b = sh('npx', ['tauri', 'build', '--no-bundle', '--config', `"${cfg}"`], { cwd: dir, env: { ...process.env, CARGO_TARGET_DIR: join(WORK, 'target') } });
  if (b.status !== 0) throw new Error('build failed for ' + v.name);
  copyFileSync(join(WORK, 'target/release/keyoverlay.exe'), v.exe);
  if (v.ref) { rmSync(join(dir, 'node_modules'), { force: true }); sh('git', ['worktree', 'remove', '--force', `"${dir}"`], { cwd: ROOT, stdio: 'ignore' }); }
}
sh('git', ['worktree', 'prune'], { cwd: ROOT, stdio: 'ignore' });

// ---------------------------------------------------------------- measuring
async function launch(v, openWindow) {
  kill(); await sleep(1200);
  rmSync(DATA, { recursive: true, force: true }); mkdirSync(DATA, { recursive: true });
  writeFileSync(join(DATA, 'settings.json'), JSON.stringify({ version: 2, general: { port: 7879, openOnLaunch: openWindow, autoCheckUpdates: false, lastSeenVersion: v.name.slice(1) }, layout: { id: 'tkl', profiles: {} } }));
  const t0 = Date.now();
  const c = spawn(v.exe, [], { detached: true, stdio: 'ignore', env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222' } }); c.unref();
  return t0;
}
async function usableMs(t0) {
  for (let i = 0; i < 600; i++) {
    try {
      const t = (await (await fetch('http://127.0.0.1:9222/json')).json()).find(x => x.type === 'page' && x.url.includes('tauri.localhost'));
      if (t) {
        const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
        const ask = () => new Promise(res => { ws.onmessage = e => res(JSON.parse(e.data)); ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `!!document.getElementById('pane') && document.getElementById('pane').children.length > 0 && document.querySelectorAll('nav button').length > 0`, returnByValue: true } })); });
        for (let j = 0; j < 300; j++) { if ((await ask()).result?.result?.value) { ws.close(); return Date.now() - t0; } await sleep(20); }
        ws.close(); return null;
      }
    } catch { /* not up yet */ }
    await sleep(20);
  }
  return null;
}
const inject = n => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(E2E, 'inject.ps1'), '-scenario', 'flood', '-n', String(n)], { stdio: 'ignore' });

const R = Object.fromEntries(VERSIONS.map(v => [v.name, { usable: [], tray: [], win: [], flood: [], idle: [] }]));
for (let run = 1; run <= RUNS; run++) {
  for (const v of VERSIONS) {
    lock.stage(`measuring ${v.name}, round ${run} of ${RUNS}`);
    process.stdout.write(`run ${run}/${RUNS} ${v.name} ... `);
    // settings window opening on launch
    const t0 = await launch(v, true); const ms = await usableMs(t0); await sleep(6000);
    R[v.name].usable.push(ms); R[v.name].win.push(tree());
    await launch(v, false); await sleep(9000);                                                   // tray only
    const a = proc(); const tr = tree(); await sleep(15000); const b = proc();
    R[v.name].tray.push({ threads: b[0], handles: b[1], priv: tr[1], procs: tr[0] }); R[v.name].idle.push((b[3] - a[3]) / 15000 * 100);
    // 8000 key events
    const f0 = proc(), tt = Date.now(); inject(4000); const f1 = proc(), secs = (Date.now() - tt) / 1000;
    R[v.name].flood.push((f1[3] - f0[3]) / 1000 / secs * 100);
    console.log(`usable ${ms} ms`);
  }
}
kill(); rmSync(DATA, { recursive: true, force: true });

// ---------------------------------------------------------------- report
const out = {};
for (const v of VERSIONS) {
  const r = R[v.name], m = k => median(r.tray.map(t => t[k])), w = i => median(r.win.map(t => t[i]));
  out[v.name] = {
    exeMB: +(statSync(v.exe).size / 1e6).toFixed(2), usableMs: median(r.usable.filter(Boolean)),
    trayThreads: m('threads'), trayHandles: m('handles'), trayPrivMB: m('priv'), trayProcs: m('procs'), idleCpuPct: +median(r.idle).toFixed(3),
    winProcs: w(0), winPrivMB: w(1), winWsMB: w(2), floodCpuPct: +median(r.flood).toFixed(2),
  };
}
console.log('\n' + JSON.stringify(out, null, 1));
writeFileSync(join(WORK, 'results.json'), JSON.stringify(out, null, 1));
console.log('\nResults saved to', join(WORK, 'results.json'), '(delete that folder when you are done: it holds the test builds)');
