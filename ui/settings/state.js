// =====================================================================================================================
//  The window's shared state: what it remembers while it is open. Other modules read these names and change them through the set... functions.
// =====================================================================================================================

// Other modules READ these names directly (they are live: they always show the current value) and CHANGE them only
// through the set... functions, because a module cannot assign to something it imported.

export let S = null; // the current settings (a copy of what the app keeps on disk)
export let layouts = []; // every layout: [{ id, name, keys, user }]
export let customFonts = []; // font files the user added
export let reg = { animations: [], themes: [], easings: [], layouts: [] }; // lists the live preview sends us
export let tab = 'layout'; // which tab is showing
export let selKey = null; // the key selected in the Keys tab
export let booted = false; // true once the first screen is drawn
export let obsUrl = ''; // the OBS Browser Source address (it carries ?key=... when the secure link is on)
export let size = null; // the overlay's recommended size, reported by the live preview: { w, h }
export let appVersion = ''; // the version of the running app
export let paused = false; // true while the overlay is paused from the tray
export let lastUpdate = null; // the latest "is there an update?" answer
export let upProg = null; // download progress while an update installs
export let inputActive = 'hook'; // the keyboard input method in use: "hook" or "rawinput"
export let inputError = null; // why the chosen input method could not start, if it could not

export function setS(value) {
  S = value;
}
export function setLayouts(value) {
  layouts = value;
}
export function setCustomFonts(value) {
  customFonts = value;
}
export function setReg(value) {
  reg = value;
}
export function setTab(value) {
  tab = value;
}
export function setSelKey(value) {
  selKey = value;
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
export function setUpProg(value) {
  upProg = value;
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
