// =====================================================================================================================
//  Words that differ per system ("windows", "macos" or "linux", from platform.rs through `platform` in state.js), so the
//  settings window talks about the person's own computer. Plain logic, no page code, so tests/ui can run it with Node.
//  A new system, or a thing that is named differently there, is one more entry here.
// =====================================================================================================================

const WORDS = {
  // what starting the app with the computer is called
  startup: { windows: 'start-with-Windows', macos: 'open-at-login', linux: 'start-at-login' },
  // the General -> Startup switches: starting with the computer, and what minimizing does
  autostart: { windows: 'Start with Windows', macos: 'Open at login', linux: 'Start at login' },
  minimize: { windows: 'Minimize to tray', linux: 'Minimize to tray' }, // not shown on a Mac: see hasMinimizeSetting
  // where the app's icon lives while its window is closed
  trayName: { windows: 'tray', macos: 'menu bar', linux: 'tray' },
  // the modifiers a shortcut needs, in words, for the pause shortcut's hint
  modifiers: { windows: 'Ctrl, Alt or Win', macos: '⌘, ⌥ or ⌃', linux: 'Ctrl, Alt or Super' },
  // the Keys tab's hint line: how to add a key to the selection, and the key that hides keys (a Mac calls it "delete")
  dragHint: {
    windows: 'Drag a key to move it. Ctrl-click to add.',
    macos: 'Drag a key to move it. ⌘-click to add.',
    linux: 'Drag a key to move it. Ctrl-click to add.',
  },
  deleteKey: { windows: 'Del', macos: 'delete', linux: 'Del' },
  deleteKeyTip: {
    windows: 'Delete or Backspace hides the selected keys',
    macos: 'The delete key hides the selected keys',
    linux: 'Delete or Backspace hides the selected keys',
  },
  // the Keys tab's hint chips for the view: what zooms and what pans (a Mac trackpad pans with two fingers and pinches)
  zoomChip: { windows: 'Scroll', macos: 'Pinch', linux: 'Scroll' },
  zoomTip: {
    windows: 'Scroll the mouse wheel over the keyboard to zoom',
    macos: 'Pinch on the trackpad, or hold ⌘ and scroll, to zoom',
    linux: 'Scroll the mouse wheel over the keyboard to zoom',
  },
  panChip: { windows: 'Space-drag', macos: 'Scroll', linux: 'Space-drag' },
  panTip: {
    windows: 'Hold Space and drag, or drag with the middle mouse button, to move the view',
    macos: 'Scroll with two fingers, or hold Space and drag, to move the view',
    linux: 'Hold Space and drag, or drag with the middle mouse button, to move the view',
  },
  // how the Standard keyboard method reads keys, for the technical line shown in Debug mode
  standardDetail: {
    windows: 'Standard = WH_KEYBOARD_LL hook',
    macos: 'Standard = listen-only event tap (CGEventTap)',
    linux: 'Standard = XInput2 raw events',
  },
};

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
 * Is there a "Minimize to tray" switch on this system? Not on a Mac: the yellow button, Command+W and the red button all
 * close the window to the menu bar, so there is nothing to choose (src-tauri/src/platform.rs, minimize_closes_window).
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
