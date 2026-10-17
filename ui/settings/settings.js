// =====================================================================================================================
//  Keystroke Overlay: the settings window.
//  Plain JavaScript in small ES modules, no bundler, no build step; new screens are Preact components (html.js). This
//  file is the entry point (index.html loads it): it draws the tab bar and the open tab, and starts everything. Every
//  other file does one job; docs/ARCHITECTURE.md has the map. The tabs, in order, are listed in tabs/index.js.
//
//  HOW TO ADD A SETTING: add a line to CONTROLS in controls.js; it is drawn automatically. Also add its default value
//  in src-tauri/src/settings.rs and, if the overlay uses it, read it in ui/overlay/overlay.js.
// =====================================================================================================================
import { $, call, invoke } from './helpers.js';
import { openFirstRun } from './first-run.js';
import { paintHeader } from './header.js';
import { html, render as draw } from './html.js';
import { paintPause, showServerError, resync } from './messages.js';
import { hideMenu } from './menu.js';
import { refreshFades } from './scroll-fade.js';
import './popup.js'; // keyboard focus for every popup; loaded first so it watches them from the start
import { showNotes } from './notes.js';
import { showUpdateResult } from './update-popup.js';
import { fitPreview, frame, previewSrc, updateObs } from './preview.js';
import {
  appVersion,
  registry,
  setAppVersion,
  setBooted,
  setCustomFonts,
  setInputActive,
  setInputError,
  setLayouts,
  setObsUrl,
  setOverlays,
  setPaused,
  setSettings,
  setTab,
  settings,
  tab,
} from './state.js';
// Loaded only for what it does when it starts: it wires up the minimize / maximize / close buttons.
import './windowbar.js';
import { findTab, visibleTabs } from './tabs/index.js';

// ---------------------------------------------------------------------------------------------------------------------
// 8. Drawing the window
// ---------------------------------------------------------------------------------------------------------------------
/** The tab bar. data-tab holds the tab's id so the tests can pick it without reading its text. */
function TabBar({ tabs, current }) {
  const open = (id) => {
    setTab(id);
    render();
  };
  return tabs.map(
    ({ id, name }) =>
      html`<button
        type="button"
        class=${id === current ? 'active' : null}
        data-test="tab"
        data-tab=${id}
        aria-current=${id === current ? 'page' : null}
        onClick=${() => open(id)}
      >
        ${name}
      </button>`,
  );
}

/**
 * Show a tab's content in the pane. A converted tab gives a Preact element, one not converted yet gives page elements;
 * switching between the two first clears what the other kind left there.
 */
let paneHoldsPreact = false; // what the pane shows now: a Preact tab, or page elements from a tab not converted yet

function showInPane(pane, content) {
  if (content instanceof Node) {
    if (paneHoldsPreact) draw(null, pane);
    paneHoldsPreact = false;
    pane.replaceChildren(content);
    return;
  }
  if (!paneHoldsPreact) pane.replaceChildren();
  paneHoldsPreact = true;
  draw(content, pane);
}

/** Redraw the tab bar and the active tab, keeping the scroll position. */
export async function render() {
  const debugMode = !!settings?.general?.debugMode;
  if (!findTab(tab, debugMode)) setTab('general'); // e.g. Debug mode was just switched off while on the Debug tab
  draw(html`<${TabBar} tabs=${visibleTabs(debugMode)} current=${tab} />`, $('#tabs'));
  const pane = $('#pane');
  const scroll = pane.scrollTop;
  const content = await findTab(tab, debugMode).render();
  showInPane(pane, content);
  pane.scrollTop = scroll;
  refreshFades();
  paintHeader(); // a tab may have changed the link (new port or key), which the header status shows
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
  setOverlays(state.overlays);
  setLayouts(layoutList);
  setCustomFonts(fonts);
  setInputActive(state.inputActive);
  setInputError(state.inputError);
  // e.g. the tray's "Update available" opens General
  if (state.gotoTab && findTab(state.gotoTab, !!state.settings.general?.debugMode)) setTab(state.gotoTab);
  paintPause();
  updateObs();
  // the overlay can't load, but the port can still be fixed
  if (state.serverError) {
    showServerError(state.serverError);
    setTab('general');
  } else if (state.firstRun) openFirstRun(); // a brand-new install: the three steps to add it to OBS
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
