// =====================================================================================================================
//  The Debug tab's reports, as plain logic: removing personal details, finding which settings differ from the
//  defaults, and the "Copy bug report" text. No page code, so tests/ui can run it with Node.
//  debug.js gathers the facts and copies the result. Privacy rules: docs/DEBUGGING.md and PRIVACY.md.
// =====================================================================================================================

/** The report's format version. Raise it when a field is renamed or removed, so readers can tell the formats apart. */
export const BUG_REPORT_FORMAT = 2;
/** How many of the newest event-log lines go into a report. */
export const REPORT_LOG_LINES = 60;

// A user's home folder on every system: C:\Users\name or C:/Users/name (Windows), /home/name (Linux),
// /Users/name (macOS). The name is everything up to the next slash, space or quote. Slashes may be doubled, because
// paths inside JSON text have their backslashes written twice.
const HOME_FOLDERS = [/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\s"']+/gi, /(\/home\/)[^/\s"']+/g, /(\/Users\/)[^/\s"']+/g];

/** Remove personal details (the user name inside home-folder paths) from text that is going to be pasted somewhere. */
export function scrub(text) {
  let clean = String(text);
  for (const pattern of HOME_FOLDERS) clean = clean.replace(pattern, '$1<you>');
  return clean;
}

/** The settings without the private link key (for showing on screen or copying into a report). */
export function redactSettings(settings) {
  const copy = JSON.parse(JSON.stringify(settings));
  if (copy.general?.linkKey) copy.general.linkKey = '(hidden)';
  return copy;
}

/** Flatten nested settings into { 'style.radius': '8', ... } so two copies can be compared value by value. */
export function flatten(value, path = '', out = {}) {
  const isBranch = value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length;
  if (!isBranch) {
    out[path] = JSON.stringify(value);
    return out;
  }
  for (const [childKey, childValue] of Object.entries(value)) {
    flatten(childValue, path ? `${path}.${childKey}` : childKey, out);
  }
  return out;
}

/**
 * Only the settings that differ from the defaults: { 'style.radius': { now: 12, default: 8 }, ... }.
 * A setting the defaults don't have shows `default: undefined`. Run it on redacted settings.
 */
export function settingsDiff(settings, defaults) {
  const now = flatten(settings);
  const before = flatten(defaults);
  const diff = {};
  for (const path of Object.keys(now).sort()) {
    if (now[path] === before[path]) continue;
    diff[path] = {
      now: JSON.parse(now[path]),
      default: before[path] === undefined ? undefined : JSON.parse(before[path]),
    };
  }
  return diff;
}

/** Seconds since start: "12.8s"; `since` lines them up for the log ("+   12.8s"). */
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;
const since = (ms) => `+${seconds(ms).padStart(8)}`;

/** "14 min", "2 h 5 min": how long the app has been running. */
function runningFor(secs) {
  const minutes = Math.floor(secs / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** The table of the app's state: only the rows a reader needs to understand most problems. */
function stateRows({ state, lastUpdate }) {
  const update = !lastUpdate
    ? 'not checked yet'
    : lastUpdate.available
      ? `v${lastUpdate.version} available (${lastUpdate.channel})`
      : `up to date (${lastUpdate.channel})`;
  return [
    ['Overlay server', state.serverError ? `not running: ${state.serverError}` : `running, port ${state.port}`],
    ['Keyboard input', `${state.inputMethod}${state.inputError ? `, error: ${state.inputError}` : ''}`],
    ['Paused', state.paused ? 'yes' : 'no'],
    ['Secure link', state.secureLink ? 'on' : 'off'],
    ['Layout', `${state.layout}${state.overlaySize ? ` · overlay ${state.overlaySize}` : ''}`],
    ['Window', state.window],
    ['Memory', `${state.memoryMb} MB · ${state.handles} handles`],
    ['Updates', update],
  ];
}

/** "style.radius: 12 (default 8)", one per line, or a single "none". */
function settingsLines(diff) {
  const lines = Object.entries(diff).map(
    ([path, { now, default: before }]) =>
      `${path}: ${JSON.stringify(now)} (default ${before === undefined ? 'none' : JSON.stringify(before)})`,
  );
  return lines.length ? lines : ['none'];
}

/** What the event log holds: only the important events, or everyday details too (Debug mode, since when). */
const logLevel = (detailSinceMs) =>
  detailSinceMs === null || detailSinceMs === undefined
    ? 'important events only'
    : `everything since Debug mode was turned on (+${seconds(detailSinceMs)})`;

/**
 * "Copy bug report": Markdown that reads top to bottom for a person (what happened, the problems, the state, the
 * recent events) and ends with the same facts as one compact JSON block for a script or another Claude session,
 * folded away on GitHub. `facts` comes from the Debug tab (buildReport). Never keys, never personal paths.
 */
export function bugReport(facts) {
  const failed = facts.selfTest.filter((check) => !check.ok);
  const lines = [
    '## Keystroke Overlay bug report',
    `v${facts.version} (${facts.build}) · ${facts.os} · ${facts.engine} · up ${runningFor(facts.state.uptimeSecs ?? 0)} · format ${BUG_REPORT_FORMAT}`,
    '',
    '### What happened',
    '<!-- what you did, what you expected, and what you saw instead -->',
    '',
    '### Problems found',
    ...(failed.length
      ? failed.map((check) => `- ✗ ${check.name}${check.detail ? `: ${check.detail}` : ''}`)
      : ['- none']),
    '',
    '### State',
    '| | |',
    '|---|---|',
    ...stateRows(facts).map(([name, value]) => `| ${name} | ${value} |`),
    '',
    `### Self-test: ${facts.selfTest.length - failed.length} passed, ${failed.length} failed`,
    '',
    `### Settings changed from defaults (${Object.keys(facts.settingsDiff).length})`,
    ...settingsLines(facts.settingsDiff),
    '',
    `### Recent events (last ${facts.log.length}; ${logLevel(facts.detailSinceMs)})`,
    '```text',
    ...facts.log.map(([ms, text]) => `${since(ms)}  ${text}`),
    '```',
    '',
    '<details><summary>Machine-readable (JSON)</summary>',
    '',
    '```json',
    JSON.stringify(reportData(facts)),
    '```',
    '</details>',
  ];
  return scrub(lines.join('\n'));
}

/** The report's JSON part: every fact, exactly, under stable names (raise BUG_REPORT_FORMAT when one changes). */
const reportData = (facts) => ({
  format: BUG_REPORT_FORMAT,
  app: { version: facts.version, build: facts.build, os: facts.os, engine: facts.engine },
  state: facts.state,
  lastUpdate: facts.lastUpdate ?? null,
  selfTest: facts.selfTest,
  settingsDiff: facts.settingsDiff,
  logDetailSinceMs: facts.detailSinceMs ?? null,
  log: facts.log,
});
