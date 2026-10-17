// =====================================================================================================================
//  The Keys tab: show / hide keys, rename them, and select and move them (one at a time or as a group).
// =====================================================================================================================
import { $, button, confirmTwice, el, heading, note, plural, row, toast } from '../helpers.js';
import { changed } from '../preview.js';
import {
  SNAP,
  basePosition,
  curLayout,
  editPositions,
  editProf,
  forgetKeyEdits,
  forgetStyleEdits,
  isCustom,
  keyPos,
  nudgeStep,
  profileSnapshot,
  round2,
  setKeyPos,
  tidyPositions,
  tidyProf,
  viewProf,
} from '../profiles.js';
import { render } from '../settings.js';
import { observe } from './keys-history.js';
import { hideSelection, nudgeSelection, redoLastChange, selectionTools, undoLastChange } from './keys-toolbar.js';
import { settings, selectedKey, selectedKeys, setSelectedKey, setSelectedKeys, tab } from '../state.js';
import { TEXT } from '../text.js';

// ---- Keys: show / hide keys and rename them -----------------------------------------------------------------------
export async function keysTab() {
  const page = el('div'),
    layout = curLayout();
  if (!layout) return page;
  // The editor's code is loaded the first time this tab opens, and the editor then stays alive (zoom, pan and the key
  // elements are kept when you leave the tab).
  const { getEditor } = await import('../editor/editor.js');
  observe(layout.id, profileSnapshot(layout.id)); // undo / redo: notice what changed since the last draw
  const profile = viewProf();
  const editor = getEditor();
  editor.update(layout, profile);
  page.append(heading('Keys — ' + layout.name), note(TEXT.keysTabHelp));
  page.append(
    selectionTools(layout),
    editor.element,
    el('p', { className: 'keyhint', textContent: TEXT.shortcutsHint, test: 'keys-shortcut-hint' }),
    statusLine(layout, profile),
    keyButtons(layout),
  );
  const selected = selectedKey && layout.keys.find((k) => k.code === selectedKey);
  if (selected) page.append(keyEditor(selected, profile));
  else if (selectedKeys.size > 1) page.append(groupEditor(layout, profile));
  return page;
}

/** True while a popup is open or the cursor is in a field you type into (shortcuts must not steal those keys). */
function shortcutsBlocked(keyEvent) {
  const typingField = /** @type {Element} */ (keyEvent.target).closest?.(
    'input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select, [contenteditable]',
  );
  return !!typingField || !$('#dlg').hidden || !$('#modal').hidden || !$('#updModal').hidden;
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

/** One line under the picture: where the selected key is (when exactly one is selected), and how many keys are moved. */
function statusLine(layout, profile) {
  const parts = [];
  const selected = selectedKey && layout.keys.find((key) => key.code === selectedKey);
  if (selected) {
    const at = keyPos(selected, profile);
    parts.push(`${selected.code} at x ${round2(at.x)}, y ${round2(at.y)}`);
  }
  const movedCount = Object.keys(profile.positions).length;
  parts.push(movedCount === 0 ? TEXT.noKeysMoved : `${plural(movedCount, 'key')} moved from the layout file`);
  const status = el('p', { className: 'keystatus', textContent: parts.join(' · '), test: 'key-status' });
  status.setAttribute('aria-live', 'polite'); // read out after a change
  return status;
}

/** Enable all / Disable all / Reset all labels / Tidy up / Reset positions / Revert to Default. */
function keyButtons(layout) {
  const revert = el('button', {
    className: 'danger',
    textContent: 'Revert to Default',
    disabled: !isCustom(layout.id),
    title: 'Undo all key edits (hidden keys, labels and moved keys) for this layout',
    test: 'keys-revert',
  });
  confirmTwice(revert, 'Revert to Default', () => {
    delete settings.layout.profiles[layout.id];
    setSelectedKey(null);
    changed(true);
    toast(layout.name + ' reverted to default');
  });
  const moved = Object.keys(viewProf().positions).length > 0;
  const tidy = button(
    'Tidy up',
    () => {
      const view = viewProf();
      const next = tidyPositions(layout, view);
      // keep only positions that differ from where the layout style puts the key
      for (const layoutKey of layout.keys) {
        const newPosition = next[layoutKey.code];
        if (!newPosition) continue;
        const base = basePosition(layoutKey, view.layoutStyle);
        if (Math.abs(newPosition.x - base.x) < 1e-6 && Math.abs(newPosition.y - base.y) < 1e-6)
          delete editPositions()[layoutKey.code];
        else editPositions()[layoutKey.code] = { x: round2(newPosition.x), y: round2(newPosition.y) };
      }
      tidyProf();
      changed(true);
      toast('Gaps closed');
    },
    '',
    'keys-tidy',
  );
  tidy.title = 'Close the gaps left by hidden keys, keeping the shape of the keyboard';
  const reset = button(
    'Reset positions',
    () => {
      forgetStyleEdits();
      changed(true);
    },
    '',
    'keys-reset-positions',
  );
  reset.disabled = !moved;
  reset.title = 'Put every moved and resized key back where the layout has it';
  return el(
    'div',
    { className: 'btns' },
    button(
      'Enable all',
      () => {
        editProf().disabledKeys = [];
        tidyProf();
        changed(true);
      },
      '',
      'keys-enable-all',
    ),
    button(
      'Disable all',
      () => {
        editProf().disabledKeys = layout.keys.map((k) => k.code);
        changed(true);
      },
      '',
      'keys-disable-all',
    ),
    button(
      'Reset all labels',
      () => {
        editProf().labels = {};
        tidyProf();
        changed(true);
      },
      '',
      'keys-reset-labels',
    ),
    tidy,
    reset,
    revert,
  );
}

/**
 * The small editor under the keyboard for the selected key: show/hide it, give it a label, and set its exact position.
 */
function keyEditor(key, profile) {
  const show = el('input', { type: 'checkbox', checked: !profile.disabledKeys.includes(key.code), test: 'key-show' });
  show.onchange = () => {
    const edited = editProf(),
      hidden = new Set(edited.disabledKeys);
    if (show.checked) hidden.delete(key.code);
    else hidden.add(key.code);
    edited.disabledKeys = [...hidden];
    tidyProf();
    changed(true);
  };
  const label = el('input', {
    type: 'text',
    value: profile.labels[key.code] ?? key.label ?? '',
    placeholder: 'Label',
    maxLength: 12,
    test: 'key-label',
  });
  label.oninput = () => {
    editProf().labels[key.code] = label.value;
    changed();
  };
  const reset = button(
    'Reset',
    () => {
      delete editProf().labels[key.code];
      tidyProf();
      changed(true);
    },
    '',
    'key-label-reset',
  );

  const at = keyPos(key, profile);
  const num = (value, test) =>
    el('input', { type: 'number', min: 0, max: 100, step: SNAP, value: round2(value), className: 'num-field', test });
  const px = num(at.x, 'key-x'),
    py = num(at.y, 'key-y');
  const place = () => {
    const x = parseFloat(px.value),
      y = parseFloat(py.value);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      setKeyPos(key, Math.min(100, Math.max(0, x)), Math.min(100, Math.max(0, y)));
      changed();
    }
  };
  px.oninput = py.oninput = place;
  // redraw the keyboard once typing settles
  px.onchange = py.onchange = () => render();
  const back = button(
    'Reset',
    () => {
      forgetKeyEdits([key.code]);
      changed(true);
    },
    '',
    'key-position-reset',
  );
  back.disabled = !profile.positions[key.code] && !profile.sizes[key.code];

  return el(
    'div',
    { className: 'editor', test: 'key-editor' },
    el('b', { textContent: key.code, test: 'key-editor-title' }),
    row('Show this key', show),
    row('Custom label', label, reset),
    row('Position', el('span', { textContent: 'X' }), px, el('span', { textContent: 'Y' }), py, back),
    note(TEXT.keyEditorTip),
  );
}

/** The panel under the picture while several keys are selected: show / hide them together, or put them back. */
function groupEditor(layout, profile) {
  const codes = [...selectedKeys];
  const hiddenCount = codes.filter((code) => profile.disabledKeys.includes(code)).length;
  const show = el('input', { type: 'checkbox', checked: hiddenCount === 0, test: 'key-show' });
  show.indeterminate = hiddenCount > 0 && hiddenCount < codes.length;
  show.onchange = () => {
    const edited = editProf();
    const hidden = new Set(edited.disabledKeys);
    for (const code of codes) {
      if (show.checked) hidden.delete(code);
      else hidden.add(code);
    }
    edited.disabledKeys = [...hidden];
    tidyProf();
    changed(true);
  };
  const movedCodes = codes.filter((code) => profile.positions[code] || profile.sizes[code]);
  const putBack = button(
    'Put back',
    () => {
      forgetKeyEdits(codes);
      changed(true);
    },
    '',
    'key-group-put-back',
  );
  putBack.disabled = movedCodes.length === 0;
  putBack.title = 'Put the selected keys back where the layout has them';
  return el(
    'div',
    { className: 'editor', test: 'key-editor' },
    el('b', { textContent: `${codes.length} keys selected`, test: 'key-editor-title' }),
    row('Show these keys', show),
    row('Positions', putBack),
    note(TEXT.groupEditorTip),
  );
}
