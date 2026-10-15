// =====================================================================================================================
//  Keystroke Overlay: the settings window.
//  Plain JavaScript in small ES modules, no bundler, no build step. This file is the entry point (index.html loads it):
//  it picks the tab, draws the window and starts everything. Every other file does one job:
//
//    state.js       what the window remembers while it is open (the settings, layouts, current tab, ...)
//    text.js        the longer explanations the user reads
//    helpers.js     small tools: talk to the app, build page elements, toasts
//    preview.js     saving a change, the live preview, the OBS address bar
//    profiles.js    per-layout key edits: hidden keys, labels, moved keys, "Tidy up"
//    controls.js    the table that draws every slider, colour picker and dropdown
//    popups.js      dialogs, the right-click menu, release notes, the update dialog
//    messages.js    messages from the app (tray, updates, progress) and re-reading its state
//    windowbar.js   the window's own minimize / maximize / close buttons
//    tabs/*.js      one file per tab: layout, keys, style, animation, fonts, general (the Keys tab has several, keys-*.js)
//    debug.js       the optional Debug tab (see docs/DEBUGGING.md)
//
//  HOW TO ADD A SETTING: add a line to CONTROLS in controls.js; it is drawn automatically. Also add its default value
//  in src-tauri/src/settings.rs and, if the overlay uses it, read it in ui/overlay/overlay.js.
// =====================================================================================================================
import { $, button, call, invoke } from './helpers.js';
import { paintPause, showServerError, resync } from './messages.js';
import { debugTab } from './debug.js';
import { hideMenu, showNotes, showUpdateResult } from './popups.js';
import { fitPreview, frame, previewSrc, updateObs } from './preview.js';
import {
  settings,
  TAB_NAMES,
  appVersion,
  setAppVersion,
  setBooted,
  setCustomFonts,
  setInputActive,
  setInputError,
  setLayouts,
  setObsUrl,
  setPaused,
  setSettings,
  setTab,
  tab,
  registry,
} from './state.js';
// Loaded only for what it does when it starts: it wires up the minimize / maximize / close buttons.
import './windowbar.js';
import { animationTab } from './tabs/animation.js';
import { fontsTab } from './tabs/fonts.js';
import { generalTab } from './tabs/general.js';
import { keysTab } from './tabs/keys.js';
import { layoutTab } from './tabs/layout.js';
import { styleTab } from './tabs/style.js';

const TABS = {
  layout: layoutTab,
  keys: keysTab,
  style: styleTab,
  animation: animationTab,
  fonts: fontsTab,
  general: generalTab,
};

// ---------------------------------------------------------------------------------------------------------------------
// 8. Drawing the window
// ---------------------------------------------------------------------------------------------------------------------
/** One button in the tab bar. data-tab holds the tab's id so the tests can pick it without reading its text. */
function tabButton(id, name) {
  const onclick = () => {
    setTab(id);
    render();
  };
  const tabItem = button(name, onclick, id === tab ? 'active' : '', 'tab');
  tabItem.dataset.tab = id;
  return tabItem;
}

/** Redraw the tab bar and the active tab, keeping the scroll position. */
export async function render() {
  // the Debug tab (ui/settings/debug.js) only exists in Debug mode
  const debugOn = !!settings?.general?.debugMode;
  if (tab === 'debug' && !debugOn) setTab('general');
  const names = debugOn ? { ...TAB_NAMES, debug: debugTab.name } : TAB_NAMES;
  $('#tabs').replaceChildren(...Object.entries(names).map(([id, name]) => tabButton(id, name)));
  const pane = $('#pane'),
    scroll = pane.scrollTop;
  const content = await (tab === 'debug' ? debugTab.render() : TABS[tab]());
  pane.replaceChildren(content);
  pane.scrollTop = scroll;
}

// When the window is resized: refit the preview, close any open menu, and redraw the Keys tab (its keyboard is sized to
// the window).
let resizeTimer = 0;

addEventListener('resize', () => {
  fitPreview();
  hideMenu();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (tab === 'keys') render();
  }, 150);
});

// ---------------------------------------------------------------------------------------------------------------------
// 11. Start-up
// ---------------------------------------------------------------------------------------------------------------------
(async () => {
  // Three independent questions at once, then draw immediately. The live preview loads afterwards in the background,
  // so it never delays the first screen.
  const [state, layoutList, fonts] = await Promise.all([call('get_state'), call('list_layouts'), call('list_fonts')]);
  setSettings(state.settings);
  setObsUrl(state.url);
  setAppVersion(state.version);
  setPaused(state.paused);
  setLayouts(layoutList);
  setCustomFonts(fonts);
  setInputActive(state.inputActive);
  setInputError(state.inputError);
  // e.g. the tray's "Update available" opens General
  if (state.gotoTab && TAB_NAMES[state.gotoTab]) setTab(state.gotoTab);
  paintPause();
  updateObs();
  // the overlay can't load, but the port can still be fixed
  if (state.serverError) {
    showServerError(state.serverError);
    setTab('general');
  }
  setBooted(true);
  await render();
  window.__uiReady = performance.timeOrigin + performance.now(); // read by the performance tests
  if (!state.serverError)
    requestAnimationFrame(() => {
      frame.src = previewSrc();
    });
  if (state.whatsNew) {
    // shown once after an update
    // mark as seen right away so it can never repeat
    await invoke('ack_whats_new');
    showNotes(appVersion, `What's new in v${appVersion}`);
  }
})();

// A quiet update check shortly after the window opens (setting "Check for updates automatically").
// The Rust side skips it when switched off and reuses an answer from the last hour.
setTimeout(async () => {
  try {
    const result = await invoke('auto_check_update');
    if (result) showUpdateResult(result);
  } catch {
    /* offline: stay quiet */
  }
}, 700);

// A small hook for the end-to-end tests and the browser inspector: the modules keep their names private, so this is the one
// place that lets outside code reach a few of them.
window.__ko = { resync, render, previewSrc, frame, registry: () => registry };
