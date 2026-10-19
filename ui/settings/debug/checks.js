// =====================================================================================================================
//  The self-test's checks and the facts for "Copy bug report" (debug-report.js formats them).
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import {
  REPORT_LOG_LINES,
  accessRows,
  bugReport,
  engineName,
  redactSettings,
  scrub,
  settingsDiff,
} from '../debug-report.js';
import { invoke } from '../helpers.js';
import { lastUpdate, layouts, paused, settings, size } from '../state.js';

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
      (info.inputLabel ?? info.inputActive) + (info.inputError ? ': ' + info.inputError : ''),
    ],
    ...accessTests(info.keyboardAccess),
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

/** Self-test lines for keyboard access: Input Monitoring and Secure Input on macOS, the input group on Linux Wayland. */
function accessTests(access) {
  if (!access?.applies) return [];
  const rows = accessRows(access);
  if (access.system === 'linux') {
    return [
      [
        'The keyboards can be read (input group), or keys are arriving',
        access.allowed || access.captureSeen,
        rows[0][1],
      ],
    ];
  }
  return [
    ['Input Monitoring is on, or keys are arriving', access.allowed || access.captureSeen, rows[0][1]],
    ['Secure Input is off (macOS is not blocking capture)', !access.secureInput, rows[1][1]],
  ];
}

/** The facts for "Copy bug report" (debug-report.js formats them). No key presses, no personal paths. */
export async function buildReport() {
  const [info, selfTest, log, defaults] = await Promise.all([
    invoke('debug_info'),
    runSelfTest(),
    invoke('debug_log'),
    invoke('debug_defaults'),
  ]);
  const engine = engineName(navigator.userAgent);
  const state = {
    paused,
    port: info.port,
    serverError: info.serverError,
    inputMethod: info.inputLabel ?? info.inputActive,
    inputError: info.inputError,
    secureLink: !!settings.general?.secureLink,
    layout: settings.layout?.id,
    settingsValid: info.settingsValid,
    dataDir: info.dataDir,
    dataWritable: info.dataWritable,
    uptimeSecs: info.uptimeSecs,
    memoryMb: info.memoryMb,
    handles: info.handles,
    keyboardAccess: info.keyboardAccess,
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
