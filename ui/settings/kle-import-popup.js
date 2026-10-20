// =====================================================================================================================
//  Import from KLE: the "From a KLE file…" button in the New layout popup (dialogs.js), and the popup that follows it:
//  the layout's picture, a Name box and what the import found, then Create layout. The file is picked and the layout
//  saved by the Rust side (src-tauri/src/commands/layout_import.rs); reading the file and linking its keys is plain
//  logic in kle.js and kle-layout.js. Built on dialog() from popup.js. Plan: docs/for-claude/proposals/kle-import.md.
// =====================================================================================================================
import { call, el, invoke, plural, toast } from './helpers.js';
import { html, render as drawPreact } from './html.js';
import { MAX_LAYOUT_KEYS, MAX_NAME_LENGTH, PLACEHOLDER_PREFIX, layoutFromKle } from './kle-layout.js';
import { dialog } from './popup.js';
import { render } from './settings.js';
import { settings, setLayouts, setSelectedKey, setTab } from './state.js';
import { LayoutPicture } from './tabs/layout-card.js';

const TEXT = {
  fromFile: 'From a KLE file…',
  fromFileHelp:
    'Drew a keyboard on keyboard-layout-editor.com? Save it there with Download → Download JSON, then pick the file.',
  title: 'Import from KLE',
  name: 'Name',
  keys: (count) => `${plural(count, 'key')}.`,
  linked: (count) => `${count} linked to your keyboard.`,
  notLinked: (count) => `${count} not linked yet. You'll link them on the Keys tab.`,
  straightened: (count) => `${plural(count, 'turned key')} shown straight.`,
  leftOut: (count) => `${plural(count, 'key')} left out: decorations and extra layout choices.`,
  cancel: 'Cancel',
  create: 'Create layout',
  created: 'Layout created.',
  // errors, each a toast
  notKle: "This file isn't a KLE layout. In KLE, use Download → Download JSON.",
  noKeys: 'This KLE file has no keys.',
  tooManyKeys: (count, max) => `This layout has ${count} keys. A layout can have at most ${max}.`,
  brokenFile: "This file couldn't be read. Is it the JSON file from KLE?",
};

const HELP_ID = 'kle-from-file-help';
const NAME_ID = 'kle-import-name';

/** The button (and its one-line help) in the New layout popup. */
export function FromKleFile() {
  return html`<div class="from-kle">
    <button type="button" data-test="dialog-from-kle" aria-describedby=${HELP_ID} onClick=${pickKleFile}>
      ${TEXT.fromFile}
    </button>
    <p class="hint" id=${HELP_ID}>${TEXT.fromFileHelp}</p>
  </div>`;
}

/** Why a file can't be used, in words (the problems layoutFromKle reports, with `count` for too many keys). */
function problemText(result) {
  if (result.problem === 'tooManyKeys') return TEXT.tooManyKeys(result.count, MAX_LAYOUT_KEYS);
  return TEXT[result.problem];
}

/** The file picker; canceling it does nothing, and a file that can't be used keeps the New layout popup open. */
async function pickKleFile() {
  let source;
  try {
    source = await invoke('pick_layout_source');
  } catch (error) {
    toast(String(error), true);
    return;
  }
  if (!source) return;
  let result;
  try {
    result = layoutFromKle(source.text, source.fileName);
  } catch {
    // a file the reader didn't foresee must not leave the popup stuck; say it can't be used, like broken JSON
    result = { problem: 'brokenFile' };
  }
  if (result.problem) {
    toast(problemText(result), true);
    return;
  }
  showImportPopup(result);
}

/** The Import from KLE popup, in place of the New layout popup. */
function showImportPopup(layout) {
  const nameField = { current: null };
  const body = el('div');
  drawPreact(html`<${ImportSummary} layout=${layout} nameField=${nameField} />`, body);
  dialog({
    title: TEXT.title,
    body: [body],
    buttons: [
      { label: TEXT.cancel, test: 'dialog-cancel' },
      {
        label: TEXT.create,
        test: 'kle-import-create',
        primary: true,
        run: () => createLayout(layout, nameField.current.value),
      },
    ],
  });
  // the popup was already open (it showed New layout), so it doesn't move the focus in by itself
  nameField.current.focus();
  nameField.current.select();
}

/** The lines under the Name box: always the keys and how many are linked, the rest only when it happened. */
function reportLines(report) {
  const lines = [TEXT.keys(report.keys), TEXT.linked(report.linked)];
  if (report.notLinked) lines.push(TEXT.notLinked(report.notLinked));
  if (report.straightened) lines.push(TEXT.straightened(report.straightened));
  if (report.leftOut) lines.push(TEXT.leftOut(report.leftOut));
  return lines;
}

function ImportSummary({ layout, nameField }) {
  return html`<div class="kle-import">
    <span class="kle-import-picture"><${LayoutPicture} keys=${layout.keys} /></span>
    <label for=${NAME_ID}>${TEXT.name}</label>
    <input
      id=${NAME_ID}
      type="text"
      maxlength=${MAX_NAME_LENGTH}
      value=${layout.name}
      ref=${nameField}
      data-test="kle-import-name"
    />
    ${reportLines(layout.report).map((line) => html`<p>${line}</p>`)}
  </div>`;
}

/** Save the layout, select it and open the Keys tab, like Create does; the first key that isn't linked is selected. */
async function createLayout(layout, name) {
  try {
    const id = await invoke('add_layout', { name, keys: layout.keys });
    setLayouts(await call('list_layouts'));
    settings.layout.id = id;
    const firstUnlinked = layout.keys.find((key) => key.code.startsWith(PLACEHOLDER_PREFIX));
    setSelectedKey(firstUnlinked?.code ?? null);
    setTab('keys');
    toast(TEXT.created);
    render();
    return true;
  } catch (error) {
    toast(String(error), true);
    return false;
  }
}
