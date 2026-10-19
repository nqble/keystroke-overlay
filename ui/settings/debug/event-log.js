// =====================================================================================================================
//  "Event log": what the app did (never key presses), from its memory.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { scrub } from '../debug-report.js';
import { call, invoke, toast } from '../helpers.js';
import { html, useLayoutEffect, useRef, useState } from '../html.js';
import { platform } from '../state.js';
import { systemWord } from '../system-words.js';
import { Button, Hint, LogLine, TEXT, clock, useEvery } from './shared.js';

const REFRESH_MS = 1500;
// Within this many pixels of the bottom counts as "at the end": the list then follows new lines.
const FOLLOW_PX = 30;
const EMPTY = [[0, '(nothing yet: use the app and lines appear here)']];

async function copyLog() {
  const lines = await invoke('debug_log');
  await call('copy_text', { text: scrub(lines.map(([ms, text]) => `${clock(ms)}  ${text}`).join('\n')) });
  toast('Log copied');
}

function EventLog() {
  const [lines, setLines] = useState([]);
  const box = useRef(null);
  const follow = useRef(true);
  const refresh = async () => {
    const list = box.current;
    if (list) follow.current = list.scrollHeight - list.scrollTop - list.clientHeight < FOLLOW_PX;
    setLines(await invoke('debug_log'));
  };
  useEvery(REFRESH_MS, refresh);
  useLayoutEffect(() => {
    if (follow.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines]);
  const clear = async () => {
    await invoke('debug_log_clear');
    refresh();
  };
  const shown = lines.length ? lines : EMPTY;
  return html`<div>
    <${Hint} text=${TEXT.eventLogHelp(systemWord('trayName', platform))} />
    <div class="dbg-log" data-test="debug-log" ref=${box}>
      ${shown.map(([ms, text]) => html`<${LogLine} time=${clock(ms)} text=${text} />`)}
    </div>
    <div class="btns">
      <${Button} text="Copy log" test="debug-log-copy" onClick=${copyLog} />
      <${Button} text="Clear" test="debug-log-clear" onClick=${clear} />
    </div>
  </div>`;
}

export const eventLog = { id: 'event-log', title: 'Event log', Body: EventLog };
