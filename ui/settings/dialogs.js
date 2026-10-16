// =====================================================================================================================
//  The small dialogs built on popup.js: New layout (with the 20-layout limit) and Reset all settings.
// =====================================================================================================================
import { $, call, el, invoke, toast } from './helpers.js';
import { dialog } from './popup.js';
import { frame, previewSrc, updateObs } from './preview.js';
import { render } from './settings.js';
import { MAX_LAYOUTS, settings, layouts, setLayouts, setObsUrl, setSelectedKey, setTab } from './state.js';
import { TEXT } from './text.js';

export function addLayoutDialog() {
  if (layouts.filter((l) => l.user).length >= MAX_LAYOUTS) {
    dialog({
      title: 'Max layouts reached',
      body: [el('p', { textContent: TEXT.layoutLimitReached(MAX_LAYOUTS) })],
      buttons: [{ label: 'OK', test: 'dialog-ok', primary: true }],
    });
    return;
  }
  const nameInput = el('input', {
    type: 'text',
    placeholder: 'Layout name',
    maxLength: 30,
    test: 'dialog-layout-name',
  });
  const create = async () => {
    try {
      const id = await invoke('create_layout', { name: nameInput.value });
      setLayouts(await call('list_layouts'));
      settings.layout.id = id;
      setSelectedKey(null);
      setTab('keys');
      toast('Layout created.');
      render();
      return true;
    } catch (error) {
      toast(String(error), true);
      return false;
    }
  };
  dialog({
    title: 'New layout',
    body: [el('p', { textContent: TEXT.newLayoutHelp }), nameInput],
    buttons: [
      { label: 'Cancel', test: 'dialog-cancel' },
      { label: 'Create', test: 'dialog-create', primary: true, run: create },
    ],
  });
  nameInput.focus();
}

export function resetDialog() {
  const reset = async () => {
    try {
      setObsUrl(await invoke('reset_settings'));
      frame.src = previewSrc();
      updateObs();
      toast('All settings reset');
      return true;
    } catch (error) {
      toast(String(error), true);
      return false;
    }
  };
  dialog({
    title: 'Reset all settings?',
    body: [el('p', { textContent: TEXT.resetBodyWhatChanges }), el('p', { textContent: TEXT.resetBodyLinkNote })],
    buttons: [
      { label: 'Cancel', test: 'dialog-cancel' },
      { label: 'Reset everything', test: 'dialog-reset-confirm', danger: true, run: reset },
    ],
  });
}
