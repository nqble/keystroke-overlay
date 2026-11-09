// =====================================================================================================================
//  The small dialogs built on popup.js: Rename layout, New layout (Blank, Built-in, From a KLE file or, on Windows, From a NohBoard file; the 20-layout limit), Reset
//  all settings, and a plain "are you sure" for things that are hard to undo by hand.
// =====================================================================================================================
import { call, el, invoke, toast } from './helpers.js';
import { html, render as drawPreact } from './html.js';
import { Segmented } from './blocks.js';
import { FromKleFile, FromNohBoardFile, KLE_WORDS, pickLayoutFile } from './kle-import-popup.js';
import { otherLayouts, shownLayouts } from './layout-order.js';
import { OtherLayouts } from './other-layouts.js';
import { dialog } from './popup.js';
import { changed, frame, previewSrc, updateObs } from './preview.js';
import { render } from './settings.js';
import { MAX_LAYOUTS, platform, settings, layouts, setLayouts, setObsUrl, setSelectedKey, setTab } from './state.js';
import { TEXT } from './text.js';
import { words } from './words.js';

// The ways to start a layout, in the order the popup shows them (docs/design/ui-design-v2.md, Layouts). NohBoard is a
// Windows program, so From a NohBoard file is only offered on Windows.
const START = { blank: 'blank', builtIn: 'builtIn', kle: 'kle', nohboard: 'nohboard' };
const WORDS = words('dialogs');

/** The longest layout name the name boxes take (a longer one wouldn't fit on its Layout tab card). */
const LAYOUT_NAME_MAX = 30;

/**
 * New layout: start Blank (a name, then Create), from a Built-in layout that isn't on the Layout tab (Add puts it back
 * at the end), or From a KLE or NohBoard file (kle-import-popup.js). Each choice shows only what it needs, and the buttons at the
 * bottom follow the choice. At MAX_LAYOUTS layouts of your own only Built-in is left. `start` picks the first choice
 * (the import review's Back button comes back to the file choice it came from).
 */
export function addLayoutDialog(start = START.blank) {
  const full = layouts.filter((l) => l.user).length >= MAX_LAYOUTS;
  const builtIns = otherLayouts(layouts, settings.layout.order);
  const nameField = { current: null };
  const body = el('div');
  let close = () => {};
  const addBuiltIn = (id) => {
    settings.layout.order = [...shownLayouts(layouts, settings.layout.order).map((l) => l.id), id];
    close();
    changed(true);
  };
  const showChoice = (choice, opening = false) => {
    drawPreact(html`<${NewLayout} ...${{ choice, full, builtIns, nameField, addBuiltIn, showChoice }} />`, body);
    close = dialog({ title: WORDS.newLayout, body: [body], buttons: buttonsFor(choice, full, nameField) });
    // popup.js focuses the first control when the popup opens (the Start from choice); a new Blank layout wants the name
    // box, so it takes the focus after that has run. Switching choices later leaves the focus on the choice.
    if (opening && choice === START.blank) queueMicrotask(() => nameField.current?.focus());
  };
  showChoice(full ? START.builtIn : start, true);
}

/** The buttons at the bottom for each choice: Create for Blank, Choose file… for a file, only Close for Built-in. */
function buttonsFor(choice, full, nameField) {
  if (full || choice === START.builtIn) return [{ label: WORDS.start.close, test: 'dialog-cancel' }];
  const cancel = { label: WORDS.cancel, test: 'dialog-cancel' };
  if (choice === START.kle || choice === START.nohboard) {
    const pick = () => pickLayoutFile(choice);
    return [cancel, { label: KLE_WORDS.chooseFile, test: `dialog-from-${choice}`, primary: true, run: pick }];
  }
  return [
    cancel,
    { label: WORDS.create, test: 'dialog-create', primary: true, run: () => createBlank(nameField.current.value) },
  ];
}

async function createBlank(name) {
  try {
    const id = await invoke('create_layout', { name });
    setLayouts(await call('list_layouts'));
    settings.layout.id = id;
    setSelectedKey(null);
    setTab('keys');
    toast(WORDS.created);
    render();
    return true;
  } catch (error) {
    toast(String(error), true);
    return false;
  }
}

/** The popup's body: the Start from choice (none at the limit), then what that choice needs. */
function NewLayout({ choice, full, builtIns, nameField, addBuiltIn, showChoice }) {
  const choices = [
    { value: START.blank, text: WORDS.start.blank, test: 'new-layout-blank' },
    ...(builtIns.length ? [{ value: START.builtIn, text: WORDS.start.builtIn, test: 'new-layout-built-in' }] : []),
    { value: START.kle, text: WORDS.start.kle, test: 'new-layout-kle' },
    ...(platform === 'windows'
      ? [{ value: START.nohboard, text: WORDS.start.nohboard, test: 'new-layout-nohboard' }]
      : []),
  ];
  return html`<div class="new-layout">
    ${
      full
        ? html`<p>${TEXT.layoutLimitReached(MAX_LAYOUTS)}</p>`
        : html`<${Segmented}
            label=${WORDS.start.label}
            choices=${choices}
            value=${choice}
            onChange=${showChoice}
            test="new-layout-start"
          />`
    }
    ${
      choice === START.blank && !full
        ? html`<input
            type="text"
            placeholder=${WORDS.layoutName}
            maxlength=${LAYOUT_NAME_MAX}
            data-test="dialog-layout-name"
            ref=${nameField}
          />`
        : null
    }
    ${choice === START.builtIn ? html`<${OtherLayouts} choices=${builtIns} onAdd=${addBuiltIn} />` : null}
    ${choice === START.kle && !full ? html`<${FromKleFile} />` : null}
    ${choice === START.nohboard && !full ? html`<${FromNohBoardFile} />` : null}
  </div>`;
}

/** Rename a layout the person made: a name box with the current name, then Rename. The layout keeps its key edits. */
export function renameLayoutDialog(layout) {
  const nameBox = el('input', {
    type: 'text',
    value: layout.name,
    maxLength: LAYOUT_NAME_MAX,
    placeholder: WORDS.layoutName,
  });
  nameBox.dataset.test = 'dialog-rename-name';
  const rename = async () => {
    try {
      await invoke('rename_layout', { id: layout.id, name: nameBox.value });
      setLayouts(await call('list_layouts'));
      toast(WORDS.renamed);
      render();
      return true;
    } catch (error) {
      toast(String(error), true);
      return false;
    }
  };
  dialog({
    title: WORDS.renameTitle,
    body: [nameBox],
    buttons: [
      { label: WORDS.cancel, test: 'dialog-cancel' },
      { label: WORDS.rename, test: 'dialog-rename', primary: true, run: rename },
    ],
  });
  queueMicrotask(() => {
    nameBox.focus();
    nameBox.select();
  });
}

/** Ask before something that is hard to undo by hand. `onConfirm` runs when the danger button is pressed. */
export function confirmDialog({ title, body, confirmLabel, test, onConfirm }) {
  dialog({
    title,
    body: [el('p', { textContent: body })],
    buttons: [
      { label: WORDS.cancel, test: 'dialog-cancel' },
      { label: confirmLabel, test, danger: true, run: onConfirm },
    ],
  });
}

export function resetDialog() {
  const reset = async () => {
    try {
      setObsUrl(await invoke('reset_settings'));
      frame.src = previewSrc();
      updateObs();
      toast(WORDS.resetDone);
      return true;
    } catch (error) {
      toast(String(error), true);
      return false;
    }
  };
  dialog({
    title: WORDS.resetTitle,
    body: [el('p', { textContent: TEXT.resetBodyWhatChanges }), el('p', { textContent: TEXT.resetBodyLinkNote })],
    buttons: [
      { label: WORDS.cancel, test: 'dialog-cancel' },
      { label: WORDS.resetConfirm, test: 'dialog-reset-confirm', danger: true, run: reset },
    ],
  });
}
