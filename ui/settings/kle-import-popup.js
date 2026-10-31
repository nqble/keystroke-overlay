// =====================================================================================================================
//  Import from a keyboard file: the From a KLE file and From a NohBoard file (Windows only) choices in the New layout
//  popup (dialogs.js), and the review popup that follows either: the layout's picture (keys that can't light up drawn
//  dashed), a Name box and what the import found, then Create layout, or Back to New layout. The file is picked and the
//  layout saved by the Rust side (src-tauri/src/commands/layout_import.rs); reading the file and linking its keys is
//  plain logic in kle.js and kle-layout.js (KLE) and nohboard-layout.js (NohBoard). Built on dialog() from popup.js.
//  How it works for users: docs/USER-GUIDE.md.
// =====================================================================================================================
import { addLayoutDialog } from './dialogs.js';
import { call, el, invoke, plural, toast } from './helpers.js';
import { html, render as drawPreact } from './html.js';
import { MAX_LAYOUT_KEYS, MAX_NAME_LENGTH, PLACEHOLDER_PREFIX, layoutFromKle } from './kle-layout.js';
import { isMouseCode, layoutFromNohBoard } from './nohboard-layout.js';
import { dialog } from './popup.js';
import { render } from './settings.js';
import { settings, setLayouts, setSelectedKey, setTab } from './state.js';
import { LayoutPicture } from './tabs/layout-card.js';

const TEXT = {
  chooseFile: 'Choose file…',
  fromFileBefore: 'In ',
  kleSite: 'keyboard-layout-editor.com', // a link: opens the site in the browser
  fromFileAfter: ', use Download → Download JSON, then choose that file.',
  fromNohBoard:
    "NohBoard keeps each keyboard in its own folder, under the keyboards folder next to NohBoard.exe. Choose the keyboard.json in your keyboard's folder.",
  title: { kle: 'Import from KLE', nohboard: 'Import from NohBoard' },
  name: 'Name',
  // One line: how many keys, how many light up, and by name the ones that can't (drawn dashed in the picture).
  summary: (keys, linked) => `${plural(keys, 'key')} · ${linked} light up`,
  unlit: (count, names) => ` · ${count} can't: ${names}`,
  // Keys the app can't name (Fn is handled inside the keyboard and never reaches the computer; a second Q can't be told
  // from the first) are kept, so the board looks like the real one, and said here before the layout is made.
  unlitWhy:
    "Dashed keys can't light up, because the app can't tell which key they are (Fn, for example). You can delete them on the Keys tab.",
  blankKey: 'a blank key',
  andMore: (count) => `and ${count} more`,
  leftOut: (count) => `${plural(count, 'key')} left out: decorations and extra layout choices.`,
  leftOutNohBoard: (count) =>
    `${plural(count, 'element')} left out: the mouse speed indicator and anything unreadable.`,
  // Mouse buttons and wheel keep the names mouse support will use, so they light up by themselves once it exists.
  mouse: (count) => `${plural(count, 'mouse button')} (drawn dashed) will light up once the app supports the mouse.`,
  back: 'Back',
  create: 'Create layout',
  created: 'Layout created',
  // errors, each a toast
  notKle: "This file isn't a KLE layout. In KLE, use Download → Download JSON.",
  noKeys: 'This KLE file has no keys.',
  tooManyKeys: (count, max) => `This layout has ${count} keys. A layout can have at most ${max}.`,
  brokenFile: "This file couldn't be read. Is it the JSON file from KLE?",
  notNohBoard: "This isn't a NohBoard keyboard file. Choose the keyboard.json in your keyboard's folder.",
  ourFile: 'This is a Keystroke Overlay file. Use Import… on the Layout tab.',
  noKeysNohBoard: 'This NohBoard keyboard has no keys.',
  brokenNohBoard: "This file couldn't be read. Is it a NohBoard keyboard.json?",
};

/** What each kind of file needs: its reader and the words that differ. */
const KINDS = {
  kle: {
    read: (source) => layoutFromKle(source.text, source.fileName),
    problems: { brokenFile: TEXT.brokenFile, noKeys: TEXT.noKeys },
    leftOut: TEXT.leftOut,
  },
  nohboard: {
    read: async (source) => layoutFromNohBoard(source.text, source.folderName, await invoke('typing_virtual_keys')),
    problems: { brokenFile: TEXT.brokenNohBoard, noKeys: TEXT.noKeysNohBoard },
    leftOut: TEXT.leftOutNohBoard,
  },
};

const NAME_ID = 'kle-import-name';
const WHY_ID = 'kle-import-why';

/** The words the New layout popup uses for these choices (their Choose file… button lives in the popup's footer). */
export const KLE_WORDS = { chooseFile: TEXT.chooseFile };

/** The From a NohBoard file choice in the New layout popup: where NohBoard keeps the file. */
export function FromNohBoardFile() {
  return html`<p class="from-kle">${TEXT.fromNohBoard}</p>`;
}

/** The From a KLE file choice in the New layout popup: what to do in KLE first. */
export function FromKleFile() {
  const openSite = () => invoke('open_kle_site').catch(() => {}); // the browser not opening needs no message
  return html`<p class="from-kle">
    ${TEXT.fromFileBefore}<button type="button" class="text-link" data-test="kle-site-link" onClick=${openSite}>
      ${TEXT.kleSite}</button
    >${TEXT.fromFileAfter}
  </p>`;
}

/** Why a file can't be used, in words (the problems the readers report, with `count` for too many keys). */
function problemText(result, kind) {
  if (result.problem === 'tooManyKeys') return TEXT.tooManyKeys(result.count, MAX_LAYOUT_KEYS);
  return KINDS[kind].problems[result.problem] ?? TEXT[result.problem];
}

/**
 * The file picker (Choose file… in New layout) for a `kind` of file ('kle' or 'nohboard'). Always returns false, so the
 * popup stays: canceling or a file that can't be used leaves New layout open, and a good file replaces it with the
 * review popup.
 */
export async function pickLayoutFile(kind) {
  let source;
  try {
    source = await invoke('pick_layout_source');
  } catch (error) {
    toast(String(error), true);
    return false;
  }
  if (!source) return false;
  let result;
  try {
    result = await KINDS[kind].read(source);
  } catch {
    // a file the reader didn't foresee must not leave the popup stuck; say it can't be used, like broken JSON
    result = { problem: 'brokenFile' };
  }
  if (result.problem) {
    toast(problemText(result, kind), true);
    return false;
  }
  showImportPopup(result, kind);
  return false;
}

/** The review popup, in place of the New layout popup. */
function showImportPopup(layout, kind) {
  const nameField = { current: null };
  const body = el('div');
  drawPreact(html`<${ImportSummary} layout=${layout} kind=${kind} nameField=${nameField} />`, body);
  dialog({
    title: TEXT.title[kind],
    body: [body],
    buttons: [
      {
        label: TEXT.back,
        test: 'kle-import-back',
        run: () => {
          addLayoutDialog(kind);
          return false; // New layout has replaced this popup; closing now would close it
        },
      },
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

// Enough names to recognize the keys without the line running on.
const MAX_UNLIT_NAMES = 4;

/** "Fn, Vol+ and a blank key"; past MAX_UNLIT_NAMES, "…, and 3 more". */
function unlitList(names) {
  const readable = names.map((name) => name || TEXT.blankKey);
  const shown = readable.slice(0, MAX_UNLIT_NAMES);
  const hidden = readable.length - shown.length;
  if (hidden) shown.push(TEXT.andMore(hidden));
  return shown.join(', ');
}

/** The line under the Name box, and the rarer things the import did, each only when it happened. */
function reportLines(report, kind) {
  const summary =
    TEXT.summary(report.keys, report.linked) +
    (report.notLinked ? TEXT.unlit(report.notLinked, unlitList(report.unlit)) : '');
  const lines = [summary];
  if (report.mouse) lines.push(TEXT.mouse(report.mouse));
  if (report.leftOut) lines.push(KINDS[kind].leftOut(report.leftOut));
  return lines;
}

/** The keys drawn dashed: placeholders, and mouse buttons until the app supports the mouse. */
const unlitCodes = (keys) =>
  new Set(
    keys.filter((key) => key.code.startsWith(PLACEHOLDER_PREFIX) || isMouseCode(key.code)).map((key) => key.code),
  );

function ImportSummary({ layout, kind, nameField }) {
  const unlit = unlitCodes(layout.keys);
  const placeholders = layout.report.notLinked > 0;
  return html`<div class="kle-import">
    <span class="kle-import-picture"><${LayoutPicture} keys=${layout.keys} labels=${true} marked=${unlit} /></span>
    <label for=${NAME_ID}>${TEXT.name}</label>
    <input
      id=${NAME_ID}
      type="text"
      maxlength=${MAX_NAME_LENGTH}
      value=${layout.name}
      ref=${nameField}
      aria-describedby=${placeholders ? WHY_ID : null}
      data-test="kle-import-name"
    />
    ${reportLines(layout.report, kind).map((line, index) => html`<p class=${index ? 'hint' : 'kle-import-summary'} data-test=${index ? null : 'kle-import-summary'}>${line}</p>`)}
    ${placeholders ? html`<p class="hint" id=${WHY_ID}>${TEXT.unlitWhy}</p>` : null}
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
