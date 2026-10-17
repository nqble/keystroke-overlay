// =====================================================================================================================
//  Messages from the app (tray actions, update results, download progress) and re-reading the app's state.
// =====================================================================================================================
import { $, call, tauriEvent, invoke } from './helpers.js';
import { paintProgress, showUpdateResult } from './update-popup.js';
import { flushPendingSave, push } from './preview.js';
import { noticeObs } from './first-run.js';
import { paintHeader } from './header.js';
import { findTab } from './tabs/index.js';
import { paintPauseButton } from './pause-button.js';
import { render } from './settings.js';
import {
  overlays,
  serverError,
  paused,
  settings,
  setInputActive,
  setInputError,
  setLayouts,
  setObsUrl,
  setOverlays,
  setPaused,
  setPresets,
  setServerError,
  setSettings,
  setTab,
  setUpdateProgress,
} from './state.js';

// ---------------------------------------------------------------------------------------------------------------------
// 9. Messages from the app (tray actions, update results, download progress)
// ---------------------------------------------------------------------------------------------------------------------
const BYTES_PER_MEGABYTE = 1024 * 1024;
const megabytes = (bytes) => (bytes / BYTES_PER_MEGABYTE).toFixed(1) + ' MB';

const TEXT = {
  downloading: (done) => `Downloading… ${done}`,
  downloadingOf: (done, total, percent) => `Downloading… ${done} of ${total} (${percent}%)`,
  installing: 'Installing… the app will restart in a moment.',
};

tauriEvent.listen('update-progress', (e) => {
  const { done, total } = e.payload;
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : -1; // -1 = size unknown
  setUpdateProgress({
    pct: percent,
    text: total ? TEXT.downloadingOf(megabytes(done), megabytes(total), percent) : TEXT.downloading(megabytes(done)),
  });
  paintProgress();
});

tauriEvent.listen('update-installing', () => {
  setUpdateProgress({ pct: 100, text: TEXT.installing });
  paintProgress();
});

// the hourly background check found something
tauriEvent.listen('update-result', (e) => showUpdateResult(e.payload));

// e.g. the tray's "Update available"
tauriEvent.listen('goto-tab', (e) => {
  if (findTab(e.payload, !!settings?.general?.debugMode)) {
    setTab(e.payload);
    render();
  }
});

export function paintPause() {
  paintPauseButton($('#pauseBtn'), paused);
  paintHeader();
}

// an OBS overlay connected or disconnected (sent only on a change, never polled)
tauriEvent.listen('overlays-changed', (e) => {
  setOverlays(e.payload);
  paintHeader();
  noticeObs();
});

// The same switch as the tray's "Pause overlay". The app answers with the new state; the tray hears it too.
$('#pauseBtn').onclick = async () => {
  setPaused(await call('toggle_pause'));
  paintPause();
};

export function showServerError(message) {
  setServerError(message || null);
  paintHeader();
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
  setOverlays(state.overlays);
  setInputActive(state.inputActive);
  setInputError(state.inputError);
  paintPause();
  showServerError(state.serverError);
  push();
  render();
}

tauriEvent.listen('settings-changed', resync);
