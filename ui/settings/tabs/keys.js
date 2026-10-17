// =====================================================================================================================
//  The Keys tab: the keyboard editor with its toolbar, and the inspector on its right (show or hide keys, label them, set an
//  exact width and place). The keyboard itself is the editor in editor/editor.js; this file puts the tab together.
// =====================================================================================================================
import { button, confirmTwice, el, heading, row, toast } from '../helpers.js';
import { isPopupOpen } from '../popup.js';
import { changed } from '../preview.js';
import {
  MAX_KEY_WIDTH,
  MAX_POSITION,
  SNAP,
  baseWidth,
  basePosition,
  curLayout,
  editPositions,
  editProf,
  forgetKeyEdits,
  forgetStyleEdits,
  isCustom,
  keyPos,
  keyWidth,
  nudgeStep,
  profileSnapshot,
  round2,
  setKeyPos,
  setKeyWidth,
  tidyPositions,
  tidyProf,
  viewProf,
} from '../profiles.js';
import { render } from '../settings.js';
import { observe } from './keys-history.js';
import { overlappingCodes } from './keys-board.js';
import { hideSelection, keysToolbar, nudgeSelection, redoLastChange, undoLastChange } from './keys-toolbar.js';
import { placeKeys } from '../editor/places.js';
import { settings, selectedKey, selectedKeys, setSelectedKey, setSelectedKeys, tab } from '../state.js';
import { TEXT } from '../text.js';

// ---- The tab ------------------------------------------------------------------------------------------------------
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
  const hidden = new Set(profile.disabledKeys);
  const overlapping = overlappingCodes(
    placeKeys(layout, profile)
      .filter((item) => !hidden.has(item.key.code))
      .map((item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h })),
  );
  page.append(
    heading('Keys — ' + layout.name),
    keysToolbar(layout, profile, overlapping.size),
    el(
      'div',
      { className: 'keys-row' },
      el('div', { className: 'keys-main' }, editor.element, hintLine()),
      inspector(layout, profile, overlapping),
    ),
    keyButtons(layout),
  );
  return page;
}

/** One line under the editor: how to move keys, and the shortcuts as small key caps. */
function hintLine() {
  const chip = (text, tooltip) => el('kbd', { textContent: text, title: tooltip });
  return el(
    'p',
    { className: 'keyhint', test: 'keys-shortcut-hint' },
    el('span', { textContent: TEXT.dragHint }),
    el(
      'span',
      { className: 'chips' },
      chip('← ↑ ↓ →', 'The arrow keys move the selected keys a quarter key'),
      ' nudge · ',
      chip('Shift', 'Hold Shift with an arrow key to move a whole key'),
      ' whole key · ',
      chip('Del', 'Delete or Backspace hides the selected keys'),
      ' hide · ',
      chip('Scroll', 'Scroll the mouse wheel over the keyboard to zoom'),
      ' zoom · ',
      chip('Middle-drag', 'Drag with the middle mouse button to move the view'),
      ' pan',
    ),
  );
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

// ---- The inspector --------------------------------------------------------------------------------------------------
/** The panel to the right of the editor: what is selected, and the controls for it. */
function inspector(layout, profile, overlapping) {
  const panel = el('aside', { className: 'inspector' });
  panel.setAttribute('aria-label', 'Selected keys');
  const selected = selectedKey && layout.keys.find((key) => key.code === selectedKey);
  if (selected) panel.append(keyInspector(selected, profile, overlapping.has(selected.code)));
  else if (selectedKeys.size > 1) panel.append(groupInspector(profile));
  else
    panel.append(
      el(
        'div',
        { className: 'editor', test: 'key-inspector-empty' },
        el('b', { textContent: TEXT.noKeySelected }),
        el('p', { className: 'note', textContent: TEXT.inspectorTip }),
      ),
    );
  return panel;
}

/** The inspector for one key: show or hide it, give it a label, set its width and exact place. */
function keyInspector(key, profile, overlaps) {
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
  const resetLabel = button(
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
  const num = (value, test, min = 0, max = MAX_POSITION) =>
    el('input', { type: 'number', min, max, step: SNAP, value: round2(value), className: 'num-field', test });
  const px = num(at.x, 'key-x'),
    py = num(at.y, 'key-y');
  const place = () => {
    const x = parseFloat(px.value),
      y = parseFloat(py.value);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      setKeyPos(key, Math.min(MAX_POSITION, Math.max(0, x)), Math.min(MAX_POSITION, Math.max(0, y)));
      changed();
    }
  };
  px.oninput = py.oninput = place;
  // draw the keyboard again once typing settles
  px.onchange = py.onchange = () => render();

  const minWidth = Math.min(1, baseWidth(key, profile.layoutStyle));
  const width = num(keyWidth(key, profile), 'key-width', minWidth, MAX_KEY_WIDTH);
  width.oninput = () => {
    const value = parseFloat(width.value);
    if (!Number.isFinite(value)) return;
    setKeyWidth(key, Math.min(MAX_KEY_WIDTH, Math.max(minWidth, value)));
    changed();
  };
  width.onchange = () => render();

  const back = button(
    'Put back where it was',
    () => {
      forgetKeyEdits([key.code]);
      changed(true);
    },
    '',
    'key-position-reset',
  );
  back.disabled = !profile.positions[key.code] && !profile.sizes[key.code];

  const editor = el(
    'div',
    { className: 'editor', test: 'key-editor' },
    el(
      'div',
      { className: 'inspector-title' },
      el('b', { textContent: `Key: ${key.code}`, test: 'key-editor-title' }),
      el('label', { className: 'inline' }, show, ' Show'),
    ),
    row('Label', label, resetLabel),
    row('Width in keys', width),
    row('Position', el('span', { textContent: 'X' }), px, el('span', { textContent: 'Y' }), py),
  );
  if (overlaps) editor.append(el('p', { className: 'danger-note', textContent: TEXT.overlapNote }));
  editor.append(back);
  return editor;
}

/** The inspector while several keys are selected: show or hide them together, or put them back. */
function groupInspector(profile) {
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
    'Put these back',
    () => {
      forgetKeyEdits(codes);
      changed(true);
    },
    '',
    'key-group-put-back',
  );
  putBack.disabled = movedCodes.length === 0;
  putBack.title = 'Put the selected keys back where the layout has them';
  const clear = button(
    'Clear selection',
    () => {
      setSelectedKey(null);
      render();
    },
    '',
    'key-clear-selection',
  );
  return el(
    'div',
    { className: 'editor', test: 'key-editor' },
    el(
      'div',
      { className: 'inspector-title' },
      el('b', { textContent: `${codes.length} keys selected`, test: 'key-editor-title' }),
      el('label', { className: 'inline' }, show, ' Show'),
    ),
    el('p', { className: 'note', textContent: TEXT.groupInspectorTip }),
    el('div', { className: 'btns' }, putBack, clear),
  );
}
