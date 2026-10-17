// =====================================================================================================================
//  The small dialogs built on popup.js: New layout (with the 20-layout limit and Other layouts) and Reset all settings.
// =====================================================================================================================
import { $, call, el, invoke, toast } from './helpers.js';
import { html, render as drawPreact } from './html.js';
import { otherLayouts, shownLayouts } from './layout-order.js';
import { OtherLayouts } from './other-layouts.js';
import { dialog } from './popup.js';
import { changed, frame, previewSrc, updateObs } from './preview.js';
import { render } from './settings.js';
import { MAX_LAYOUTS, settings, layouts, setLayouts, setObsUrl, setSelectedKey, setTab } from './state.js';
import { TEXT } from './text.js';

/**
 * New layout: a name for a layout of your own (unless you have MAX_LAYOUTS already), and below it "Other layouts", the
 * built-in ones not on the Layout tab, each with an Add button that puts it back at the end (layout-order.js).
 */
export function addLayoutDialog() {
  const full = layouts.filter((l) => l.user).length >= MAX_LAYOUTS;
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
  const library = el('div');
  const close = dialog({
    title: 'New layout',
    body: [
      el('p', { textContent: full ? TEXT.layoutLimitReached(MAX_LAYOUTS) : TEXT.newLayoutHelp }),
      ...(full ? [] : [nameInput]),
      library,
    ],
    buttons: full
      ? [{ label: 'OK', test: 'dialog-ok', primary: true }]
      : [
          { label: 'Cancel', test: 'dialog-cancel' },
          { label: 'Create', test: 'dialog-create', primary: true, run: create },
        ],
  });
  const addBuiltIn = (id) => {
    settings.layout.order = [...shownLayouts(layouts, settings.layout.order).map((l) => l.id), id];
    close();
    changed(true);
  };
  drawPreact(
    html`<${OtherLayouts} choices=${otherLayouts(layouts, settings.layout.order)} onAdd=${addBuiltIn} />`,
    library,
  );
  if (!full) nameInput.focus();
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
