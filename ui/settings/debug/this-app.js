// =====================================================================================================================
//  "This app": version, system, uptime, memory and the server.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { scrub } from '../debug-report.js';
import { button, call, el, invoke } from '../helpers.js';
import { every, facts, seconds } from './shared.js';

export const thisApp = {
  id: 'this-app',
  title: 'This app',
  build() {
    const table = facts(),
      peak = { memory: 0 };
    const root = el('div', {}, table);
    every(root, 2000, async () => {
      const info = await invoke('debug_info');
      peak.memory = Math.max(peak.memory, info.memoryMb);
      table.set([
        ['Version', `v${info.version}  (${info.build})`],
        ['Running for', seconds(info.uptimeSecs)],
        ['Memory (this program)', `${info.memoryMb} MB  (highest seen here: ${peak.memory} MB)`],
        ['Open handles', info.handles],
        [
          'Overlay server',
          info.serverError ? `problem: ${info.serverError}` : `running on port ${info.port}`,
          info.serverError ? 'bad' : 'good',
        ],
        [
          'Key capture',
          `${info.inputActive === 'hook' ? 'Standard (hook)' : 'Compatibility (Raw Input)'}` +
            `${info.inputError ? ' — ' + info.inputError : ''}`,
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
        ['Browser engine', (navigator.userAgent.match(/Edg\/[\d.]+/) || [navigator.userAgent])[0]],
        [
          'Window / screen',
          `${innerWidth}×${innerHeight} window, ${screen.width}×${screen.height} screen at ${devicePixelRatio}×`,
        ],
      ]);
    });
    root.append(
      el(
        'div',
        { className: 'btns' },
        button('Open data folder', () => call('open_folder', { kind: 'root' }), '', 'debug-open-folder'),
      ),
    );
    return root;
  },
};
