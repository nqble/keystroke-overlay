// =====================================================================================================================
//  Words that differ per system ("windows", "macos" or "linux", from platform.rs through `platform` in state.js), so the
//  settings window talks about the person's own computer. Plain logic, no page code, so tests/ui can run it with Node.
//  The words themselves are in the language files (`systemWords` in ui/settings/locales/en.js): a new system, or a
//  thing named differently there, is one more entry there.
// =====================================================================================================================
import { words } from './words.js';

// The words only Debug mode shows (the Debug tab and its lines stay English, docs/proposals/interface-languages.md).
const DEBUG_WORDS = {
  // what starting the app with the computer is called
  startup: { windows: 'start-with-Windows', macos: 'open-at-login', linux: 'start-at-login' },
  // how the Standard keyboard method reads keys, for the technical line shown in Debug mode
  standardDetail: {
    windows: 'Standard = WH_KEYBOARD_LL hook',
    macos: 'Standard = listen-only event tap (CGEventTap)',
    linux: 'Standard = XInput2 raw events',
  },
};

/** Every word by thing and system: the language file's (`systemWords` in locales/en.js), and Debug's. */
const WORDS = { ...words('systemWords'), ...DEBUG_WORDS };

/** Which browser's inspector shows this window: Safari's on a Mac (the window is a WKWebView), Edge's elsewhere. */
export function inspectorTool(platform) {
  return platform === 'macos' ? 'safari' : 'edge';
}

/**
 * The keyboard input methods this system has, as the ids the app uses. Only Windows has the Compatibility method (Raw
 * Input); on a Mac or Linux choosing it only gives an error, so it is not offered there.
 */
export function inputMethods(platform) {
  return platform === 'windows' || platform === undefined ? ['hook', 'rawinput'] : ['hook'];
}

/**
 * Is there a "Minimize to tray" switch on this system? Not on a Mac: the yellow button minimizes into the Dock, as on
 * every Mac app, and Command+W and the red button close the window to the menu bar (src-tauri/src/platform.rs,
 * minimize_closes_window).
 */
export function hasMinimizeSetting(platform) {
  return platform !== 'macos';
}

const DEFAULT_SYSTEM = 'windows'; // the layout files' and the original words

/** The word for `thing` on this system, or the Windows one when the system is not known. */
export function systemWord(thing, platform) {
  const byName = WORDS[thing];
  return byName[platform] ?? byName[DEFAULT_SYSTEM];
}
