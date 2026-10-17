// =====================================================================================================================
//  "Event log": what the app did (never key presses), from its memory.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { scrub } from '../debug-report.js';
import { button, call, el, invoke, note, toast } from '../helpers.js';
import { TEXT, clock, every } from './shared.js';

export const eventLog = {
  id: 'event-log',
  title: 'Event log',
  build() {
    const box = el('div', { className: 'dbg-log', test: 'debug-log' });
    const refresh = async () => {
      const lines = await invoke('debug_log');
      const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
      box.replaceChildren(
        ...(lines.length ? lines : [[0, '(nothing yet: use the app and lines appear here)']]).map(([ms, text]) =>
          el('div', {}, el('span', { className: 'ts', textContent: clock(ms) }), el('span', { textContent: text })),
        ),
      );
      if (atEnd) box.scrollTop = box.scrollHeight;
    };
    const root = el('div', {}, note(TEXT.eventLogHelp), box);
    root.append(
      el(
        'div',
        { className: 'btns' },
        button(
          'Copy log',
          async () => {
            await call('copy_text', {
              text: scrub((await invoke('debug_log')).map(([ms, t]) => `${clock(ms)}  ${t}`).join('\n')),
            });
            toast('Log copied');
          },
          '',
          'debug-log-copy',
        ),
        button(
          'Clear',
          async () => {
            await invoke('debug_log_clear');
            refresh();
          },
          '',
          'debug-log-clear',
        ),
      ),
    );
    every(root, 1500, refresh);
    return root;
  },
};
