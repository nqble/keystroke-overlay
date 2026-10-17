// =====================================================================================================================
//  Saving a change, the live preview, and the OBS link / address bar.
// =====================================================================================================================
import { $, call, invoke, toast } from './helpers.js';
import { paintHeader } from './header.js';
import { render } from './settings.js';
import { settings, booted, obsUrl, setLinkChanged, setRegistry, setSize, size, tab } from './state.js';

// ---------------------------------------------------------------------------------------------------------------------
// 3. Saving and the live preview
// ---------------------------------------------------------------------------------------------------------------------
export const frame = $('#preview'); // the live preview: the real overlay page, shown in a frame

export let saveTimer = 0;

/** Send the current settings to the live preview. */
export function push() {
  frame.contentWindow?.postMessage({ type: 'cfg', settings: settings }, '*');
}

/**
 * Call this after changing settings. It updates the preview straight away and saves to disk.
 *   rebuildUi  redraw the current tab (needed when the change affects what the tab shows)
 *   immediate  save now instead of waiting 150 ms (switches and toggles); sliders and typing wait so they batch up
 */
export function changed(rebuildUi = false, immediate = false) {
  push();
  clearTimeout(saveTimer);
  const save = () => {
    saveTimer = 0;
    call('save_settings', { settings: settings });
  };
  if (immediate) save();
  else saveTimer = setTimeout(save, 150);
  if (rebuildUi) render();
}

/** Save a pending change right now (used when the window closes or an update starts), so nothing is lost. */
/** Save the settings right now (and forget any save that was waiting), whether or not one was pending. */
export async function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  try {
    await invoke('save_settings', { settings: settings });
  } catch {
    /* nothing more we can do */
  }
}

/** Save a pending change right now (used when the window closes), so nothing is lost. */
export async function flushPendingSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = 0;
  try {
    await invoke('save_settings', { settings: settings });
  } catch {
    /* nothing more we can do */
  }
}

addEventListener('pagehide', flushPendingSave);

addEventListener('beforeunload', flushPendingSave);

// ---------------------------------------------------------------------------------------------------------------------
// 10. OBS link and preview
// ---------------------------------------------------------------------------------------------------------------------
export const sizeText = () => (size ? `Size in OBS: ${size.w} × ${size.h}` : '');

/** Refresh the OBS link box and size in General, if it is showing (a secured link is hidden, but Copy copies it). */
export function updateObs() {
  const linkBox = /** @type {HTMLInputElement | null} */ ($('#obsUrl'));
  if (linkBox) {
    linkBox.value = obsUrl;
    linkBox.type = settings?.general?.secureLink ? 'password' : 'text';
  }
  const sizeNote = $('#sizeNote');
  if (sizeNote) sizeNote.textContent = sizeText();
}

export async function copyUrl() {
  await call('copy_text', { text: obsUrl });
  setLinkChanged(false);
  paintHeader();
  toast('OBS link copied');
}

/** The address of the live preview: the OBS link plus ?preview=1 (a secured link keeps its ?key=). */
export const previewSrc = () => {
  const url = new URL(obsUrl);
  url.searchParams.set('preview', '1');
  return url.toString();
};

/** Scale the preview frame so the whole overlay fits its box. */
export function fitPreview() {
  if (!size) return;
  const box = $('#previewBox');
  const scale = Math.min(1, (box.clientWidth - 24) / size.w, (box.clientHeight - 24) / size.h);
  frame.style.width = size.w + 'px';
  frame.style.height = size.h + 'px';
  frame.style.transform = `scale(${scale})`;
  frame.style.left = Math.max(12, (box.clientWidth - size.w * scale) / 2) + 'px';
  frame.style.top = Math.max(12, (box.clientHeight - size.h * scale) / 2) + 'px';
}

// Messages from the live preview page (it tells us when it is ready, how big it is, and which themes/animations exist).
addEventListener('message', (messageEvent) => {
  if (messageEvent.source !== frame.contentWindow) return;
  const message = messageEvent.data || {};
  if (message.type === 'ready') {
    push();
    frame.contentWindow.postMessage({ type: 'getRegistry' }, '*');
  }
  // only these tabs use the lists
  else if (message.type === 'registry') {
    setRegistry(message);
    if (booted && (tab === 'style' || tab === 'animation')) render();
  } else if (message.type === 'size') {
    setSize(message);
    fitPreview();
    updateObs();
  }
});
