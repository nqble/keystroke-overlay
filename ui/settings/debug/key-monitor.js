// =====================================================================================================================
//  "Key monitor": shows key presses here only, after Start, for at most 60 seconds.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere: the
//  lines live only in this component, and leaving the tab stops the monitor and forgets them.
// =====================================================================================================================
import { invoke, tauriEvent } from '../helpers.js';
import { html, useEffect, useLayoutEffect, useRef, useState } from '../html.js';
import { Button, Hint, LogLine, TEXT } from './shared.js';

// How many lines stay on screen; older ones scroll away.
const MAX_LINES = 40;

/** What the status line says. */
function statusText(running, count) {
  if (running) return `Listening… ${count} events (stops after 60 s)`;
  return count ? `Stopped. ${count} events.` : 'Not running.';
}

/** The line for one key event, with the time since the one before. */
function keyLine(payload, previousMs) {
  return {
    gap: previousMs ? `+${payload.ms - previousMs} ms` : 'first',
    text: `${payload.down ? '↓' : '↑'} ${payload.k}`,
  };
}

async function switchMonitor(on) {
  try {
    await invoke('debug_key_monitor', { on });
  } catch {
    /* already stopped */
  }
}

function KeyMonitor() {
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState([]);
  const [count, setCount] = useState(0);
  const previous = useRef(0);
  const list = useRef(null);

  // Listen only while running; stopping, or leaving the tab, removes the listeners and switches the monitor off.
  useEffect(() => {
    if (!running) return undefined;
    const unlisten = [
      tauriEvent.listen('debug-key', ({ payload }) => {
        const line = keyLine(payload, previous.current);
        previous.current = payload.ms;
        setCount((n) => n + 1);
        setLines((old) => [...old, line].slice(-MAX_LINES));
      }),
      tauriEvent.listen('debug-key-stopped', () => setRunning(false)),
    ];
    // Start only once both listeners are in place, so the first key is not missed.
    Promise.all(unlisten).then(() => switchMonitor(true));
    return () => {
      unlisten.forEach((pending) => pending.then((stop) => stop()));
      switchMonitor(false);
    };
  }, [running]);
  useLayoutEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [lines]);

  const toggle = () => {
    if (running) return setRunning(false);
    setLines([]);
    setCount(0);
    previous.current = 0;
    return setRunning(true);
  };
  return html`<div>
    <${Hint} text=${TEXT.keyMonitorHelp} />
    <div class="btns">
      <${Button} text=${running ? 'Stop' : 'Start'} kind="primary" test="debug-monitor-toggle" onClick=${toggle} />
      <span class="hint" data-test="debug-monitor-status">${statusText(running, count)}</span>
    </div>
    <div class="dbg-log short" data-test="debug-monitor-log" ref=${list}>
      ${lines.map((line) => html`<${LogLine} time=${line.gap} text=${line.text} />`)}
    </div>
  </div>`;
}

export const keyMonitor = { id: 'key-monitor', title: 'Key monitor', Body: KeyMonitor };
