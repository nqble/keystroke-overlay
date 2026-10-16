// =====================================================================================================================
//  The window's shared state: what it remembers while it is open. Other modules read these names and change them through the set... functions.
// =====================================================================================================================

// Other modules READ these names directly (they are live: they always show the current value) and CHANGE them only
// through the set... functions, because a module cannot assign to something it imported.

export let settings = null; // the current settings (a copy of what the app keeps on disk)
export let layouts = []; // every layout: [{ id, name, keys, user }]
export let customFonts = []; // font files the user added
export let presets = null; // the names of the saved style presets; null means "not fetched yet, or changed: fetch again"
export let registry = { animations: [], themes: [], easings: [], layouts: [] }; // lists the live preview sends us
export let tab = 'layout'; // which tab is showing
export let selectedKeys = new Set(); // the keys selected in the Keys tab (by key code)
export let selectedKey = null; // the one selected key, or null when none or several are selected (the editor shows it)
export let booted = false; // true once the first screen is drawn
export let obsUrl = ''; // the OBS Browser Source address (it carries ?key=... when the secure link is on)
export let size = null; // the overlay's recommended size, reported by the live preview: { w, h }
export let appVersion = ''; // the version of the running app
export let paused = false; // true while the overlay is paused from the tray
export let lastUpdate = null; // the latest "is there an update?" answer
export let updateProgress = null; // download progress while an update installs
export let inputActive = 'hook'; // the keyboard input method in use: "hook" or "rawinput"
export let inputError = null; // why the chosen input method could not start, if it could not

export function setSettings(value) {
  settings = value;
}
export function setLayouts(value) {
  layouts = value;
}
export function setPresets(value) {
  presets = value;
}
export function setCustomFonts(value) {
  customFonts = value;
}
export function setRegistry(value) {
  registry = value;
}
export function setTab(value) {
  tab = value;
}
/** Select exactly these keys (an array or Set of key codes). An empty list clears the selection. */
export function setSelectedKeys(codes) {
  selectedKeys = new Set(codes);
  selectedKey = selectedKeys.size === 1 ? [...selectedKeys][0] : null;
}
/** Select one key, or pass null to clear the selection. */
export function setSelectedKey(code) {
  setSelectedKeys(code ? [code] : []);
}
export function setBooted(value) {
  booted = value;
}
export function setObsUrl(value) {
  obsUrl = value;
}
export function setSize(value) {
  size = value;
}
export function setAppVersion(value) {
  appVersion = value;
}
export function setPaused(value) {
  paused = value;
}
export function setLastUpdate(value) {
  lastUpdate = value;
}
export function setUpdateProgress(value) {
  updateProgress = value;
}
export function setInputActive(value) {
  inputActive = value;
}
export function setInputError(value) {
  inputError = value;
}

export const MAX_LAYOUTS = 20; // how many layouts of their own a user may have (must match the Rust side)
export const TAB_NAMES = {
  layout: 'Layout',
  keys: 'Keys',
  style: 'Style',
  animation: 'Animation',
  fonts: 'Fonts',
  general: 'General',
};
