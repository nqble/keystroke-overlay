// =====================================================================================================================
//  The Debug tab's reports, as plain logic: removing personal details before anything is copied. No page code, so
//  tests/ui can run it with Node. debug.js gathers the facts and copies the result. Privacy rules: docs/DEBUGGING.md
//  and PRIVACY.md.
// =====================================================================================================================

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
