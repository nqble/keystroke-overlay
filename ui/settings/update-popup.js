// =====================================================================================================================
//  The update button, its popup and the download progress. Nothing is downloaded or installed until the user clicks
//  the button AND confirms in the popup.
// =====================================================================================================================
import { $, el, invoke, toast } from './helpers.js';
import { md } from './notes.js';
import { saveNow } from './preview.js';
import { render } from './settings.js';
import { lastUpdate, setLastUpdate, setUpdateProgress, tab, updateProgress } from './state.js';
import { TEXT } from './text.js';

let updateBusy = false;

/** Remember the latest update answer and show or hide the corner button. */
export function setUpdate(result) {
  setLastUpdate(result);
  $('#updateBtn').hidden = !(result && result.available);
  return result;
}

/** A new answer arrived (from a background check); redraw General only if it actually changed. */
export function showUpdateResult(result) {
  const isNew = JSON.stringify(result) !== JSON.stringify(lastUpdate);
  setUpdate(result);
  if (isNew && tab === 'general') render();
}

export function openUpdateDialog() {
  const update = lastUpdate;
  if (!update?.available) return;
  $('#uTitle').textContent = `Update available — v${update.version}`;
  $('#uBody').replaceChildren(
    ...[
      el('p', {
        className: 'hint',
        textContent: `You have v${update.current} · ${update.channel === 'latest' ? 'Latest' : 'Stable'} channel`,
      }),
      update.manual ? el('p', { textContent: TEXT.manualInstallDialog }) : null,
      update.notes ? md(update.notes) : null,
      // replaceChildren would print "null" for empty slots
    ].filter(Boolean),
  );
  $('#uGo').textContent = update.manual ? 'Open GitHub installer' : 'Update now';
  $('#uGo').disabled = $('#uLater').disabled = false;
  updateBusy = false;
  setUpdateProgress(null);
  paintProgress();
  $('#uText').textContent = '';
  $('#updModal').hidden = false;
  $('#uGo').focus();
}

$('#updateBtn').onclick = openUpdateDialog;

$('#uLater').onclick = () => {
  if (!updateBusy) $('#updModal').hidden = true;
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !updateBusy && !$('#updModal').hidden) $('#updModal').hidden = true;
});

$('#uGo').onclick = async () => {
  const update = lastUpdate;
  if (!update?.available) return;
  if (update.manual) {
    // cannot be installed from inside the app
    try {
      await invoke('open_release_page', { url: update.url });
    } catch (error) {
      toast(String(error), true);
    }
    return;
  }
  updateBusy = true;
  $('#uGo').disabled = $('#uLater').disabled = true;
  // nothing pending when the app restarts
  await saveNow();
  setUpdateProgress({ pct: 0, text: 'Starting download…' });
  paintProgress();
  try {
    // downloads, verifies the signature, installs, restarts
    await invoke('install_update');
  } catch (error) {
    updateBusy = false;
    setUpdateProgress(null);
    paintProgress();
    $('#uText').textContent = String(error);
    $('#uGo').disabled = $('#uLater').disabled = false;
  }
};

/** Draw the download progress bar in the update dialog and, if General is showing, in General too. */
export function paintProgress() {
  const dialogBar = $('#uBar');
  if (dialogBar) {
    dialogBar.hidden = !updateProgress;
    $('#uFill').style.width = (updateProgress ? Math.max(0, updateProgress.pct) : 0) + '%';
    // negative = size unknown, show a moving bar
    $('#uFill').classList.toggle('indet', !!updateProgress && updateProgress.pct < 0);
    if (updateProgress) $('#uText').textContent = updateProgress.text;
  }
  const bar = $('#upBar'),
    fill = $('#upFill'),
    text = $('#upText');
  if (!bar) return; // General is not showing
  bar.hidden = !updateProgress;
  if (updateProgress) {
    fill.style.width = updateProgress.pct + '%';
    fill.classList.toggle('indet', updateProgress.pct < 0);
    text.textContent = updateProgress.text;
  } else text.textContent = '';
}
