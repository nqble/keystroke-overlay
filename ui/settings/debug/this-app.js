// =====================================================================================================================
//  "This app": version, system, uptime, memory and the server.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { accessRows, engineName, scrub } from '../debug-report.js';
import { call, invoke } from '../helpers.js';
import { html, useRef, useState } from '../html.js';
import { Button, Facts, seconds, useEvery } from './shared.js';

const NOT_MEASURED = 'not measured on this system';
const REFRESH_MS = 2000;

/** "20.5 MB  (highest seen here: 21 MB)", or that the system does not measure memory. */
const memoryLine = (memoryMb, peakMb) =>
  memoryMb > 0 ? `${memoryMb} MB  (highest seen here: ${peakMb} MB)` : NOT_MEASURED;

/** The rows of the table, from the app's answer and the highest memory seen so far. */
function factRows(info, peakMb) {
  return [
    ['Version', `v${info.version}  (${info.build})`],
    ['Running for', seconds(info.uptimeSecs)],
    ['Memory (this program)', memoryLine(info.memoryMb, peakMb)],
    ['Open handles', info.handles ?? NOT_MEASURED],
    ...accessRows(info.keyboardAccess),
    [
      'Overlay server',
      info.serverError ? `problem: ${info.serverError}` : `running on port ${info.port}`,
      info.serverError ? 'bad' : 'good',
    ],
    [
      'Key capture',
      `${info.inputLabel ?? info.inputActive}` + `${info.inputError ? ' — ' + info.inputError : ''}`,
      info.inputError ? 'bad' : 'good',
    ],
    [
      'Settings valid',
      info.settingsValid ? 'yes' : 'no: the sanitizer would change something',
      info.settingsValid ? 'good' : 'bad',
    ],
    [
      'Data folder',
      scrub(info.dataDir) + (info.dataWritable ? '' : '   (cannot write here!)'),
      info.dataWritable ? '' : 'bad',
    ],
    ['Browser engine', engineName(navigator.userAgent)],
    [
      'Window / screen',
      `${innerWidth}×${innerHeight} window, ${screen.width}×${screen.height} screen at ${devicePixelRatio}×`,
    ],
  ];
}

function ThisApp() {
  const [rows, setRows] = useState([]);
  const peak = useRef(0);
  useEvery(REFRESH_MS, async () => {
    const info = await invoke('debug_info');
    peak.current = Math.max(peak.current, info.memoryMb);
    setRows(factRows(info, peak.current));
  });
  return html`<div>
    <${Facts} rows=${rows} />
    <div class="btns">
      <${Button}
        text="Open data folder"
        test="debug-open-folder"
        onClick=${() => call('open_folder', { kind: 'root' })}
      />
    </div>
  </div>`;
}

export const thisApp = { id: 'this-app', title: 'This app', Body: ThisApp };
