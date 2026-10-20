// Shared helpers for the end-to-end suites: drive the REAL settings window over the WebView2 debug port,
// inject real key presses, read process stats, and report results.
import { spawn, execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP } from '../../../tools/app-config.mjs';

const LIB = dirname(fileURLToPath(import.meta.url));
// the test app is renamed so we can never hit a user's real keyoverlay.exe
export const EXE_NAME = APP.testApps.e2eExe;
export const PORT = 7879; // test overlay port (the real app defaults to 7878)
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A CSS selector for an element with a test hook:  byTest('tab', '[data-tab="keys"]')  ->  [data-test="tab"][data-tab="keys"]
 * Every suite finds settings-window elements ONLY this way (the hooks are listed in tests/README.md), so a redesign
 * can move or rename things without breaking the tests.
 */
export const byTest = (name, extra = '') => `[data-test="${name}"]${extra}`;

/** Like byTest, but matches every hook whose name starts with `prefix`, e.g. all generated controls ('control-'). */
export const byTestStart = (prefix, extra = '') => `[data-test^="${prefix}"]${extra}`;

/** Waits (up to 20 seconds) for the test app's settings window to show up on the debug port; returns its target. */
async function findSettingsWindow() {
  let target;
  for (let attempt = 0; attempt < 80 && !target; attempt++) {
    try {
      target = (await (await fetch('http://127.0.0.1:9222/json')).json()).find(
        (x) => x.type === 'page' && x.url.includes('tauri.localhost'),
      );
    } catch {
      /* not up yet */
    }
    if (!target) await sleep(250);
  }
  if (!target) throw new Error('settings window not found on the debug port (is the test app running?)');
  return target;
}

/** The value an evaluation returned, or an error carrying the page's exception text. */
function valueOrThrow(answer) {
  if (answer.result.exceptionDetails)
    throw new Error(
      JSON.stringify(answer.result.exceptionDetails.exception?.description ?? answer.result.exceptionDetails.text),
    );
  return answer.result.result.value;
}

/**
 * Run JavaScript in a page that runs in its own browser process (site isolation), so it is a separate debug target:
 * attach to it directly, ask once, and close.
 */
async function evalInSeparateTarget(originPart, body) {
  const target = (await (await fetch('http://127.0.0.1:9222/json')).json()).find(
    (x) => x.type !== 'page' && (x.url || '').includes(originPart),
  );
  if (!target) throw new Error('no page found for ' + originPart);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (socket.onopen = r));
  const answer = await new Promise((res) => {
    socket.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id === 1) res(m);
    };
    socket.send(
      JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true },
      }),
    );
  });
  socket.close();
  return valueOrThrow(answer);
}

/** Connect to the test app's settings window. */
export async function connect() {
  const target = await findSettingsWindow();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const contexts = []; // JavaScript worlds (the settings page, the preview frame, ...) reported by the browser
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    } else if (m.method === 'Runtime.executionContextCreated') contexts.push(m.params.context);
    // a removed iframe must not be picked later
    else if (m.method === 'Runtime.executionContextDestroyed') {
      const i = contexts.findIndex((c) => c.id === m.params.executionContextId);
      if (i >= 0) contexts.splice(i, 1);
    } else if (m.method === 'Runtime.executionContextsCleared') contexts.length = 0;
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  /** Run JavaScript in the settings page (async body, use `return`). */
  const ev = async (body) => {
    return valueOrThrow(
      await send('Runtime.evaluate', {
        expression: `(async()=>{${body}})()`,
        awaitPromise: true,
        returnByValue: true,
      }),
    );
  };
  /** Call a Tauri command; resolves to {ok} or {err}. */
  const invoke = (cmd, args) =>
    ev(
      `try { return { ok: await window.__TAURI__.core.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args ?? {})}) } } catch (e) { return { err: String(e) } }`,
    );
  await send('Runtime.enable');
  /** Run JavaScript inside the page whose address contains `originPart` (e.g. the live preview frame). */
  const evIn = async (originPart, body) => {
    const c = [...contexts]
      .reverse()
      .find((c) => (c.origin || '').includes(originPart) && c.auxData?.isDefault !== false);
    if (c)
      return valueOrThrow(
        await send('Runtime.evaluate', {
          expression: `(async()=>{${body}})()`,
          awaitPromise: true,
          returnByValue: true,
          contextId: c.id,
        }),
      );
    return evalInSeparateTarget(originPart, body);
  };
  return { ev, evIn, send, invoke, q: (expr) => ev(`return ${expr}`), close: () => ws.close() };
}

/**
 * Move keyboard focus: 'app' (the settings window) or 'away' (Notepad). Resolves to true if that window really is in
 * front.
 */
export const focus = (to) =>
  new Promise((r) => {
    let out = '';
    const c = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(LIB, 'focus.ps1'),
      to,
    ]);
    c.stdout.on('data', (d) => (out += d));
    c.on('exit', () => r(/True/.test(out)));
  });
export const closeNotepad = () =>
  spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(LIB, 'unfocus-cleanup.ps1')], {
    stdio: 'ignore',
  });

/** Inject real key presses (scenarios are defined in inject.ps1). */
export const inject = (scenario, n = 1) =>
  new Promise((r) =>
    spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(LIB, 'inject.ps1'), scenario, String(n)],
      { stdio: 'ignore' },
    ).on('exit', r),
  );

/** [threads, handles, workingSetMB, cpuMs] of the test app. */
export const procStats = () =>
  execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${join(LIB, 'proc.ps1')}"`)
    .toString()
    .trim()
    .split(' ')
    .map(Number);
export const appAlive = () => execSync(`tasklist /FI "IMAGENAME eq ${EXE_NAME}.exe" /NH`).toString().includes(EXE_NAME);

/** Collect key events from the overlay WebSocket as '+KeyW' / '-KeyW'. */
/**
 * The only keys the test injector ever presses. Key events for any other key (someone typing while a test runs) are
 * ignored.
 */
export const INJECTED_KEYS = new Set(['KeyW', 'ControlRight', 'Space', 'KeyA', 'NumpadEnter', 'Enter', 'PrintScreen']);

export async function listenKeys(port = PORT) {
  const events = [];
  const w = new WebSocket(`ws://localhost:${port}/ws`);
  w.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if ((m.t === 'd' || m.t === 'u') && INJECTED_KEYS.has(m.k)) events.push((m.t === 'd' ? '+' : '-') + m.k);
  };
  await new Promise((r) => (w.onopen = r));
  return events;
}

let passed = 0,
  failed = 0;
export const check = (name, ok, extra = '') => {
  ok ? passed++ : failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
/** Prints the totals and sets the exit code (non-zero if anything failed). */
export const finish = () => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
};
