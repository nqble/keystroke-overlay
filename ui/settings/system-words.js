// =====================================================================================================================
//  Words that differ per system ("windows", "macos" or "linux", from platform.rs through `platform` in state.js), so the
//  settings window talks about the person's own computer. Plain logic, no page code, so tests/ui can run it with Node.
//  A new system, or a thing that is named differently there, is one more entry here.
// =====================================================================================================================

const WORDS = {
  // what starting the app with the computer is called
  startup: { windows: 'start-with-Windows', macos: 'open-at-login', linux: 'start-at-login' },
};

/** Which browser's inspector shows this window: Safari's on a Mac (the window is a WKWebView), Edge's elsewhere. */
export function inspectorTool(platform) {
  return platform === 'macos' ? 'safari' : 'edge';
}

const DEFAULT_SYSTEM = 'windows'; // the layout files' and the original words

/** The word for `thing` on this system, or the Windows one when the system is not known. */
export function systemWord(thing, platform) {
  const byName = WORDS[thing];
  return byName[platform] ?? byName[DEFAULT_SYSTEM];
}
