// =====================================================================================================================
//  Shortcut text for the pause shortcut (General → Pause shortcut, tabs/general-hotkey.js). Turns a key press in the
//  settings window into the text the app registers ("Ctrl+Shift+KeyP", src-tauri/src/hotkeys.rs) and back into a
//  friendly name ("Ctrl + Shift + P"). No imports, so the tests can load it on its own.
// =====================================================================================================================

/**
 * What each modifier is called on each system, in the friendly name. The saved text always says Ctrl, Alt, Shift and
 * Super (what src-tauri/src/hotkeys.rs registers; Super is Command on a Mac). Windows is the default.
 */
const MODIFIER_NAMES = {
  windows: { Super: 'Win' },
  linux: { Super: 'Super' },
  macos: { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Super: '⌘' },
};
const DEFAULT_SYSTEM = 'windows';

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

/** Keys that may be a shortcut on their own; any other key needs Ctrl, Alt or Win (⌘, ⌥ or ⌃ on a Mac), so it never steals typing. */
const ALONE_OK = /^(F([1-9]|1\d|2[0-4])|Pause|ScrollLock)$/;

/**
 * The shortcut text for one key press, or '' while only modifiers are held, or null when the press can't be a
 * shortcut (a letter with no Ctrl, Alt or Win).
 */
export function shortcutFromKey(event) {
  if (MODIFIER_CODES.has(event.code)) return '';
  const parts = [];
  if (event.ctrlKey) parts.push('Ctrl'); // per-system: the saved shortcut text (hotkeys.rs), not shown as it is
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Super');
  const hasStrongModifier = event.ctrlKey || event.altKey || event.metaKey;
  if (!hasStrongModifier && !ALONE_OK.test(event.code)) return null;
  parts.push(event.code);
  const text = parts.join('+');
  return text.length <= MAX_SHORTCUT_LENGTH ? text : null;
}

/**
 * A click on the "Choose shortcut" button: start listening for the keys, or stop if it already is. The button is asked to
 * take keyboard focus itself, because the key presses are read on it and Safari's engine (the Mac window) does not focus
 * a button when it is clicked, so without this Esc and every other key went to the page and did nothing.
 */
export function toggleListening(event, listening, setListening) {
  event.currentTarget.focus();
  setListening(!listening);
}

/** "Ctrl+Shift+KeyP" → "Ctrl + Shift + P" ("⌃ + ⇧ + P" on a Mac), for showing to the user. */
export function shortcutName(text, platform = DEFAULT_SYSTEM) {
  const names = MODIFIER_NAMES[platform] ?? MODIFIER_NAMES[DEFAULT_SYSTEM];
  const friendly = text.split('+').map((part) => names[part] ?? part.replace(/^(Key|Digit)/, ''));
  return friendly.join(' + ');
}
