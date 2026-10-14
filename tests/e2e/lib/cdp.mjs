// Shared helpers for the end-to-end suites: drive the REAL settings window over the WebView2 debug port,
// inject real key presses, read process stats, and report results.
import { spawn, execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = dirname(fileURLToPath(import.meta.url));
export const EXE_NAME = 'kotest-e2e';           // the test app is renamed so we can never hit a user's real keyoverlay.exe
export const PORT = 7879;                        // test overlay port (the real app defaults to 7878)
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Connect to the test app's settings window. */
export async function connect() {
  let target;
  for (let i = 0; i < 80 && !target; i++) {
    try { target = (await (await fetch('http://127.0.0.1:9222/json')).json()).find(x => x.type === 'page' && x.url.includes('tauri.localhost')); } catch { /* not up yet */ }
    if (!target) await sleep(250);
  }
  if (!target) throw new Error('settings window not found on the debug port (is the test app running?)');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  /** Run JavaScript in the settings page (async body, use `return`). */
  const ev = async body => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text));
    return r.result.result.value;
  };
  /** Call a Tauri command; resolves to {ok} or {err}. */
  const invoke = (cmd, args) => ev(`try { return { ok: await window.__TAURI__.core.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args ?? {})}) } } catch (e) { return { err: String(e) } }`);
  return { ev, send, invoke, q: expr => ev(`return ${expr}`), close: () => ws.close() };
}

/** Inject real key presses (scenarios are defined in inject.ps1). */
export const inject = (scenario, n = 1) => new Promise(r =>
  spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(LIB, 'inject.ps1'), scenario, String(n)], { stdio: 'ignore' }).on('exit', r));

/** [threads, handles, workingSetMB, cpuMs] of the test app. */
export const procStats = () => execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${join(LIB, 'proc.ps1')}"`).toString().trim().split(' ').map(Number);
export const appAlive = () => execSync(`tasklist /FI "IMAGENAME eq ${EXE_NAME}.exe" /NH`).toString().includes(EXE_NAME);

/** Collect key events from the overlay WebSocket as '+KeyW' / '-KeyW'. */
export async function listenKeys(port = PORT) {
  const events = [];
  const w = new WebSocket(`ws://localhost:${port}/ws`);
  w.onmessage = e => { const m = JSON.parse(e.data); if (m.t === 'd' || m.t === 'u') events.push((m.t === 'd' ? '+' : '-') + m.k); };
  await new Promise(r => w.onopen = r);
  return events;
}

let passed = 0, failed = 0;
export const check = (name, ok, extra = '') => { ok ? passed++ : failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
/** Prints the totals and sets the exit code (non-zero if anything failed). */
export const finish = () => { console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); };
