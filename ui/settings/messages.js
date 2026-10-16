// =====================================================================================================================
//  Messages from the app (tray actions, update results, download progress) and re-reading the app's state.
// =====================================================================================================================
import { $, call, tauriEvent, invoke } from './helpers.js';
import { paintProgress, showUpdateResult } from './popups.js';
import { flushPendingSave, push } from './preview.js';
import { render } from './settings.js';
import {
  TAB_NAMES,
  paused,
  setInputActive,
  setInputError,
  setLayouts,
  setObsUrl,
  setPaused,
  setPresets,
  setSettings,
  setTab,
  setUpdateProgress,
} from './state.js';

// ---------------------------------------------------------------------------------------------------------------------
// 9. Messages from the app (tray actions, update results, download progress)
// ---------------------------------------------------------------------------------------------------------------------
const megabytes = (bytes) => (bytes / 1048576).toFixed(1) + ' MB';

tauriEvent.listen('update-progress', (e) => {
  const { done, total } = e.payload;
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : -1; // -1 = size unknown
  setUpdateProgress({
    pct: percent,
    text: total
      ? `Downloading… ${megabytes(done)} of ${megabytes(total)} (${percent}%)`
      : `Downloading… ${megabytes(done)}`,
  });
  paintProgress();
});

tauriEvent.listen('update-installing', () => {
  setUpdateProgress({ pct: 100, text: 'Installing… the app will restart in a moment.' });
  paintProgress();
});

// the hourly background check found something
tauriEvent.listen('update-result', (e) => showUpdateResult(e.payload));

// e.g. the tray's "Update available"
tauriEvent.listen('goto-tab', (e) => {
  if (TAB_NAMES[e.payload]) {
    setTab(e.payload);
    render();
  }
});

export function paintPause() {
  $('#pausebar').hidden = !paused;
}

$('#resumeBtn').onclick = async () => {
  await call('toggle_pause');
};

export function showServerError(message) {
  const banner = $('#banner');
  banner.hidden = !message;
  if (message) banner.textContent = message + ' — pick another port in General → Port.';
}

/** Something changed outside this window (a tray action, a layout created): reload everything and redraw. */
export async function resync() {
  try {
    setObsUrl((await invoke('get_state')).url);
  } catch {
    /* keep the old address */
  }
  // never lose an edit that was waiting to save
  await flushPendingSave();
  const state = await invoke('get_state');
  try {
    setLayouts(await invoke('list_layouts'));
  } catch {
    /* keep the old list */
  }
  setPresets(null); // anything may have changed behind our back: fetch the preset names again next time
  setSettings(state.settings);
  setPaused(state.paused);
  setInputActive(state.inputActive);
  setInputError(state.inputError);
  paintPause();
  showServerError(state.serverError);
  push();
  render();
}

tauriEvent.listen('settings-changed', resync);
