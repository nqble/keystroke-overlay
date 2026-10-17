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
//    tabs/index.js  the ONE list of tabs (id, name, page); tabs/*.js one file per tab (the Keys tab has several, keys-*.js)
//    debug.js       the optional Debug tab (see docs/DEBUGGING.md)
//
//  HOW TO ADD A SETTING: add a line to CONTROLS in controls.js; it is drawn automatically. Also add its default value
//  in src-tauri/src/settings.rs and, if the overlay uses it, read it in ui/overlay/overlay.js.
// =====================================================================================================================
import { $, button, call, invoke } from './helpers.js';
import { paintPause, showServerError, resync } from './messages.js';
import { hideMenu, showNotes, showUpdateResult } from './popups.js';
import { fitPreview, frame, previewSrc, updateObs } from './preview.js';
import {
  settings,
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
import { TABS, isTab } from './tabs/index.js';

// ---------------------------------------------------------------------------------------------------------------------
// 8. Drawing the window
// ---------------------------------------------------------------------------------------------------------------------
/** One button in the tab bar. data-tab holds the tab's id so the tests can pick it without reading its text. */
function tabButton(id, name) {
  const onclick = () => switchTo(id);
  const tabItem = button(name, onclick, id === tab ? 'active' : '', 'tab');
  tabItem.dataset.tab = id;
  if (id === tab) tabItem.setAttribute('aria-current', 'page'); // tells screen readers which tab is open
  return tabItem;
}

// The Debug tab (ui/settings/debug.js) only exists in Debug mode, so its code is only loaded then (the first time it is needed).
let debugTab = null;

// Pages built earlier, by tab id, for the tabs marked `keep` in tabs/index.js. They are reused when you come back to a tab and
// nothing has changed in between. Anything that changes the settings throws them away (render() and changed() do it).
const keptPages = new Map();
const scrollOf = new Map(); // where each tab was scrolled to when you left it
let generation = 0; // goes up every time the kept pages are thrown away, so a page built meanwhile is not kept

/** Throw away the kept pages, except the one named (the tab being used: it already shows the change). */
export function forgetPages(except = null) {
  generation += 1;
  for (const id of [...keptPages.keys()]) if (id !== except) keptPages.delete(id);
}

/**
 * Draw the tab bar and the active tab.
 *   reuse  show the kept page if there is one, instead of building the tab again (used when only switching tabs)
 * Without `reuse` this is a redraw after a change: the kept pages are dropped and the scroll position stays where it was.
 */
async function draw(reuse) {
  const debugOn = !!settings?.general?.debugMode;
  if (debugOn && !debugTab) debugTab = (await import('./debug.js')).debugTab;
  if (tab === 'debug' && !debugOn) setTab('general');
  const tabs = debugOn ? [...TABS, { id: 'debug', ...debugTab }] : TABS;
  $('#tabs').replaceChildren(...tabs.map(({ id, name }) => tabButton(id, name)));
  const pane = $('#pane');
  const scroll = reuse ? (scrollOf.get(tab) ?? 0) : pane.scrollTop;
  if (!reuse) forgetPages();
  const entry = tabs.find((t) => t.id === tab);
  let content = keptPages.get(tab);
  if (!content) {
    const builtAt = generation;
    content = await entry.render();
    if (entry.keep && builtAt === generation) keptPages.set(tab, content);
  }
  pane.replaceChildren(content);
  pane.scrollTop = scroll;
}

/**
 * Build the other tabs' pages while the window is idle, one at a time, so the first visit to each is instant too. A page
 * built before a change is dropped (see `generation`), and nothing is built while a popup is open.
 */
function preloadTabs() {
  const idle = window.requestIdleCallback ?? ((run) => setTimeout(run, 200));
  const next = (queue) => {
    const entry = queue.shift();
    if (!entry) return;
    idle(async () => {
      const builtAt = generation;
      if (!keptPages.has(entry.id) && entry.id !== tab && builtAt === generation) {
        try {
          const page = await entry.render();
          if (builtAt === generation) keptPages.set(entry.id, page);
        } catch {
          /* it is built again when the tab is opened */
        }
      }
      next(queue);
    });
  };
  next(TABS.filter((entry) => entry.keep));
}

/** Redraw the active tab after something changed. */
export const render = () => draw(false);

/** Open another tab (reusing its page when nothing has changed since it was built). */
function switchTo(id) {
  scrollOf.set(tab, $('#pane').scrollTop);
  setTab(id);
  return draw(true);
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
  if (state.gotoTab && isTab(state.gotoTab)) setTab(state.gotoTab);
  paintPause();
  updateObs();
  // the overlay can't load, but the port can still be fixed
  if (state.serverError) {
    showServerError(state.serverError);
    setTab('general');
  }
  setBooted(true);
  await render();
  preloadTabs();
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
