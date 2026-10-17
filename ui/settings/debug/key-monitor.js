// =====================================================================================================================
//  "Key monitor": shows key presses here only, after Start, for at most 60 seconds.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { button, el, invoke, note, tauriEvent } from '../helpers.js';
import { TEXT, every } from './shared.js';

// -------------------------------------------------------------------------------------------------------------------
// The key monitor sends events through Tauri; one listener is shared by whichever monitor is on screen
// -------------------------------------------------------------------------------------------------------------------
let monitor = null,
  listening = false;
function listenForKeys() {
  if (listening) return;
  listening = true;
  tauriEvent.listen('debug-key', (e) => monitor?.onKey(e.payload));
  tauriEvent.listen('debug-key-stopped', () => monitor?.onStopped());
}

export const keyMonitor = {
  id: 'key-monitor',
  title: 'Key monitor',
  build() {
    listenForKeys();
    const list = el('div', { className: 'dbg-log short', test: 'debug-monitor-log' }),
      status = el('span', { className: 'hint', test: 'debug-monitor-status' });
    let running = false,
      count = 0,
      previous = 0,
      lines = [];
    const paint = () => {
      status.textContent = running
        ? `Listening… ${count} events so far (stops by itself after 60 s)`
        : count
          ? `Stopped. ${count} events.`
          : 'Not running.';
      list.replaceChildren(
        ...lines.map((l) =>
          el('div', {}, el('span', { className: 'ts', textContent: l.gap }), el('span', { textContent: l.text })),
        ),
      );
      list.scrollTop = list.scrollHeight;
    };
    const stop = async () => {
      running = false;
      monitor = null;
      paint();
      try {
        await invoke('debug_key_monitor', { on: false });
      } catch {
        /* already stopped */
      }
    };
    const toggleBtn = button(
      'Start',
      async () => {
        if (running) {
          await stop();
          toggleBtn.textContent = 'Start';
          return;
        }
        lines = [];
        count = 0;
        previous = 0;
        running = true;
        toggleBtn.textContent = 'Stop';
        monitor = {
          onKey: (payload) => {
            count++;
            lines.push({
              gap: previous ? `+${payload.ms - previous} ms` : 'first',
              text: `${payload.down ? '↓' : '↑'} ${payload.k}`,
            });
            previous = payload.ms;
            lines = lines.slice(-40);
            paint();
          },
          onStopped: () => {
            running = false;
            toggleBtn.textContent = 'Start';
            paint();
          },
        };
        await invoke('debug_key_monitor', { on: true });
        paint();
      },
      'primary',
      'debug-monitor-toggle',
    );
    const root = el('div', {}, note(TEXT.keyMonitorHelp), el('div', { className: 'btns' }, toggleBtn, status), list);
    every(root, 1000, () => {
      if (running && !root.isConnected) stop();
    });
    paint();
    return root;
  },
};
