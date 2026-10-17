// =====================================================================================================================
//  Shortcut text for the pause shortcut (General → Pause shortcut, tabs/general-hotkey.js). Turns a key press in the
//  settings window into the text the app registers ("Ctrl+Shift+KeyP", src-tauri/src/hotkeys.rs) and back into a
//  friendly name ("Ctrl + Shift + P"). No imports, so the tests can load it on its own.
// =====================================================================================================================

/** The longest shortcut text the app accepts. Must match MAX_SHORTCUT_LENGTH in src-tauri/src/hotkeys.rs. */
export const MAX_SHORTCUT_LENGTH = 48;

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

/** Keys that may be a shortcut on their own; any other key needs Ctrl, Alt or Win, so it never steals typing. */
const ALONE_OK = /^(F([1-9]|1\d|2[0-4])|Pause|ScrollLock)$/;

/**
 * The shortcut text for one key press, or '' while only modifiers are held, or null when the press can't be a
 * shortcut (a letter with no Ctrl, Alt or Win).
 */
export function shortcutFromKey(event) {
  if (MODIFIER_CODES.has(event.code)) return '';
  const parts = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Super');
  const hasStrongModifier = event.ctrlKey || event.altKey || event.metaKey;
  if (!hasStrongModifier && !ALONE_OK.test(event.code)) return null;
  parts.push(event.code);
  const text = parts.join('+');
  return text.length <= MAX_SHORTCUT_LENGTH ? text : null;
}

/** "Ctrl+Shift+KeyP" → "Ctrl + Shift + P", for showing to the user. */
export function shortcutName(text) {
  const parts = text.split('+');
  const friendly = parts.map((part) => part.replace(/^(Key|Digit)/, '').replace('Super', 'Win'));
  return friendly.join(' + ');
}
