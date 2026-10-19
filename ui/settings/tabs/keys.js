// =====================================================================================================================
//  The Keys tab (Preact): the keyboard editor with its toolbar, and the inspector on its right (show or hide keys, label
//  them, set an exact width and place). The keyboard itself is the editor in editor/editor.js, plain page code that
//  keeps its zoom, pan and key elements between visits; this file puts the tab together and holds its shortcuts. The
//  toolbar is keys-toolbar.js, the inspector keys-inspector.js.
// =====================================================================================================================
import { Segmented } from '../blocks.js';
import { html, useLayoutEffect, useRef } from '../html.js';
import { isPopupOpen } from '../popup.js';
import { changed } from '../preview.js';
import { curLayout, nudgeStep, profileSnapshot, setLayoutStyle, viewProf } from '../profiles.js';
import { render } from '../settings.js';
import { observe } from './keys-history.js';
import { overlappingCodes } from './keys-board.js';
import { Inspector } from './keys-inspector.js';
import { systemWord } from '../system-words.js';
import { KeysToolbar, hideSelection, nudgeSelection, redoLastChange, undoLastChange } from './keys-toolbar.js';
import { placeKeys } from '../editor/places.js';
import { platform, selectedKeys, setSelectedKey, setSelectedKeys, tab } from '../state.js';

const LAYOUT_STYLES = [
  { value: 'shape', text: 'Keyboard shape', test: 'layout-style-shape' },
  { value: 'grid', text: 'Even grid', test: 'layout-style-grid' },
];

// ---- The tab ------------------------------------------------------------------------------------------------------
export async function keysTab() {
  const layout = curLayout();
  if (!layout) return null;
  // The editor's code is loaded the first time this tab opens, and the editor then stays alive (zoom, pan and the key
  // elements are kept when you leave the tab).
  const { getEditor } = await import('../editor/editor.js');
  observe(layout.id, profileSnapshot(layout.id)); // undo / redo: notice what changed since the last draw
  const profile = viewProf();
  const editor = getEditor();
  editor.update(layout, profile);
  return html`<${KeysTab} layout=${layout} profile=${profile} editorElement=${editor.element} />`;
}

/** The codes of the shown keys that overlap another shown key. */
function overlappingShownKeys(layout, profile) {
  const hidden = new Set(profile.disabledKeys);
  const shown = placeKeys(layout, profile).filter((item) => !hidden.has(item.key.code));
  const boxes = shown.map((item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h }));
  return overlappingCodes(boxes);
}

function KeysTab({ layout, profile, editorElement }) {
  const overlapping = overlappingShownKeys(layout, profile);
  const pickStyle = (style) => {
    if (style === profile.layoutStyle) return;
    setLayoutStyle(style);
    changed(true);
  };
  return html`<div>
    <div class="keys-head">
      <h2 data-test="section-heading">Keys — ${layout.name}</h2>
      <div class="style-switch">
        <span>Layout style</span>
        <${Segmented}
          label="Layout style"
          choices=${LAYOUT_STYLES}
          value=${profile.layoutStyle}
          onChange=${pickStyle}
          test="layout-style"
        />
      </div>
    </div>
    <${KeysToolbar} layout=${layout} profile=${profile} overlapCount=${overlapping.size} />
    <div class="keys-row">
      <div class="keys-main">
        <${EditorHost} element=${editorElement} />
        <${HintLine} />
      </div>
      <${Inspector} layout=${layout} profile=${profile} overlapping=${overlapping} />
    </div>
  </div>`;
}

/**
 * Holds the editor's element. The editor is plain page code that lives on between visits, so it is put into this
 * placeholder rather than drawn by Preact (Preact never touches what is inside).
 */
function EditorHost({ element }) {
  const host = useRef(null);
  useLayoutEffect(() => {
    if (element.parentNode !== host.current) host.current.replaceChildren(element);
  });
  return html`<div class="editor-host" ref=${host}></div>`;
}

/** One pair in the hint line: its key caps (several are joined by "or") and the word they mean. */
function HintItem({ chips, word }) {
  const parts = chips.map(
    ({ chip, tip }, index) => html`${index ? html`<span>or</span>` : null}<kbd title=${tip}>${chip}</kbd>`,
  );
  return html`<span class="hintitem">${parts}<span>${word}</span></span>`;
}

/** One line under the editor: how to move keys, and the shortcuts as small key caps. */
function HintLine() {
  const single = (chip, tip) => [{ chip, tip }];
  return html`<p class="keyhint" data-test="keys-shortcut-hint">
    <span>${systemWord('dragHint', platform)}</span>
    <span class="chips">
      <${HintItem} chips=${single('← ↑ ↓ →', 'The arrow keys move the selected keys a quarter key')} word="nudge" />
      <${HintItem} chips=${single('Shift', 'Hold Shift with an arrow key to move a whole key')} word="whole key" />
      <${HintItem}
        chips=${single(systemWord('deleteKey', platform), systemWord('deleteKeyTip', platform))}
        word="hide"
      />
      <${HintItem} chips=${single(systemWord('zoomChip', platform), systemWord('zoomTip', platform))} word="zoom" />
      <${HintItem} chips=${systemWord('panHints', platform)} word="pan" />
    </span>
  </p>`;
}

/** True while a popup is open or the cursor is in a field you type into (shortcuts must not steal those keys). */
function shortcutsBlocked(keyEvent) {
  const typingField = /** @type {Element} */ (keyEvent.target).closest?.(
    'input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select, [contenteditable]',
  );
  return !!typingField || isPopupOpen();
}

/**
 * Keyboard shortcuts for the Keys tab (only while it is open, and never while typing or while a popup is open):
 * arrow keys nudge the selection (Shift = a whole key), Delete or Backspace hide it, Ctrl+Z undoes, Ctrl+Shift+Z or
 * Ctrl+Y redoes, Ctrl+A selects every key and Esc clears the selection.
 */
addEventListener('keydown', (keyEvent) => {
  const layout = curLayout();
  if (tab !== 'keys' || !layout || shortcutsBlocked(keyEvent)) return;
  const withCtrl = keyEvent.ctrlKey || keyEvent.metaKey;
  const key = keyEvent.key.toLowerCase();
  const onControl = /** @type {Element} */ (keyEvent.target).closest?.('input, select, textarea, button');
  const hasSelection = selectedKeys.size > 0;

  if (withCtrl && key === 'z') (keyEvent.shiftKey ? redoLastChange : undoLastChange)(layout);
  else if (withCtrl && key === 'y') redoLastChange(layout);
  else if (withCtrl && key === 'a') {
    setSelectedKeys(layout.keys.map((layoutKey) => layoutKey.code));
    render();
  } else if (!withCtrl && (key === 'delete' || key === 'backspace') && hasSelection && !onControl)
    hideSelection(layout);
  else if (key === 'escape' && hasSelection) {
    setSelectedKey(null);
    render();
  } else if (key.startsWith('arrow') && hasSelection && !onControl) {
    const step = keyEvent.shiftKey ? 1 : nudgeStep();
    const dx = { arrowleft: -1, arrowright: 1 }[key] ?? 0;
    const dy = { arrowup: -1, arrowdown: 1 }[key] ?? 0;
    nudgeSelection(layout, dx * step, dy * step);
  } else return;
  keyEvent.preventDefault();
});
