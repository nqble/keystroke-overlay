// =====================================================================================================================
//  The Debug tab's reports, as plain logic: removing personal details, finding which settings differ from the
//  defaults, and the "Copy bug report" text. No page code, so tests/ui can run it with Node.
//  debug.js gathers the facts and copies the result. Privacy rules: docs/DEBUGGING.md and PRIVACY.md.
// =====================================================================================================================

/** The report's format version. Raise it when a field is renamed or removed, so readers can tell the formats apart. */
export const BUG_REPORT_FORMAT = 1;

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

/**
 * "Copy bug report": one Markdown block with a short summary a person can read, and a fenced JSON part a
 * script or another Claude session can read exactly. `facts` comes from debug.js (see buildDevReport there).
 */
export function bugReport(facts) {
  const failed = facts.selfTest.filter((check) => !check.ok);
  const data = {
    format: BUG_REPORT_FORMAT,
    app: { version: facts.version, build: facts.build, os: facts.os, engine: facts.engine },
    state: facts.state,
    selfTest: facts.selfTest,
    settingsDiff: facts.settingsDiff,
    log: facts.log,
  };
  const summary = [
    `## Keystroke Overlay v${facts.version} (${facts.build}) on ${facts.os}`,
    '',
    failed.length
      ? `Self-test: ${failed.length} failed (${failed.map((c) => c.name).join('; ')})`
      : 'Self-test: all passed',
    `Settings changed from defaults: ${Object.keys(facts.settingsDiff).length}`,
    `Event log lines: ${facts.log.length}`,
    '',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
  ];
  return scrub(summary.join('\n'));
}
