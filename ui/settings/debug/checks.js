// =====================================================================================================================
//  The self-test's checks and the facts for "Copy bug report" (debug-report.js formats them).
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { REPORT_LOG_LINES, bugReport, redactSettings, scrub, settingsDiff } from '../debug-report.js';
import { invoke } from '../helpers.js';
import { lastUpdate, layouts, paused, settings, size } from '../state.js';
import { facts } from './shared.js';

// -------------------------------------------------------------------------------------------------------------------
// Self-test: quick yes/no checks of everything that has to work for the overlay to work
// -------------------------------------------------------------------------------------------------------------------
export async function runSelfTest() {
  const info = await invoke('debug_info');
  const brokenLayouts = layouts.filter(
    (l) => !l.keys?.length || new Set(l.keys.map((k) => k.code)).size !== l.keys.length,
  );
  return [
    ['The overlay server is running', !info.serverError, info.serverError || `port ${info.port}`],
    [
      'The live preview loaded (the overlay page works)',
      !!size,
      size ? `${size.w} × ${size.h}` : 'the preview has not reported in',
    ],
    [
      'Key capture is working',
      !info.inputError,
      (info.inputActive === 'hook' ? 'Standard method' : 'Compatibility method') +
        (info.inputError ? ': ' + info.inputError : ''),
    ],
    ['Settings are valid (nothing needed correcting)', info.settingsValid, ''],
    ['The data folder can be written to', info.dataWritable, scrub(info.dataDir)],
    [
      `All ${layouts.length} layouts have keys, and no key appears twice`,
      layouts.length > 0 && !brokenLayouts.length,
      brokenLayouts.map((l) => l.id).join(', '),
    ],
    ['The selected layout exists', layouts.some((l) => l.id === settings.layout.id), settings.layout.id],
  ].map(([name, ok, detail]) => ({ name, ok: !!ok, detail }));
}

/** The facts for "Copy bug report" (debug-report.js formats them). No key presses, no personal paths. */
export async function buildReport() {
  const [info, selfTest, log, defaults] = await Promise.all([
    invoke('debug_info'),
    runSelfTest(),
    invoke('debug_log'),
    invoke('debug_defaults'),
  ]);
  const engine = (navigator.userAgent.match(/Edg\/[\d.]+/) || [navigator.userAgent])[0];
  const state = {
    paused,
    port: info.port,
    serverError: info.serverError,
    inputMethod: info.inputActive,
    inputError: info.inputError,
    secureLink: !!settings.general?.secureLink,
    layout: settings.layout?.id,
    settingsValid: info.settingsValid,
    dataDir: info.dataDir,
    dataWritable: info.dataWritable,
    uptimeSecs: info.uptimeSecs,
    memoryMb: info.memoryMb,
    handles: info.handles,
    window: `${innerWidth}x${innerHeight} at ${devicePixelRatio}x`,
    overlaySize: size ? `${size.w}x${size.h}` : null,
  };
  return bugReport({
    version: info.version,
    build: info.build,
    os: info.os,
    engine,
    state,
    selfTest,
    settingsDiff: settingsDiff(redactSettings(settings), defaults),
    lastUpdate: lastUpdate && {
      available: !!lastUpdate.available,
      version: lastUpdate.version,
      channel: lastUpdate.channel,
    },
    detailSinceMs: info.detailSinceMs,
    lastCrash: info.lastCrash,
    log: log.slice(-REPORT_LOG_LINES),
  });
}
