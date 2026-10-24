// =====================================================================================================================
//  The inspector on the right of the Keys tab: what is selected, and the controls for it (show or hide, a label, an
//  exact width, height and place). Preact components; keys.js puts them on the page. The values are saved through
//  profiles.js, and the keyboard is drawn by editor/editor.js.
// =====================================================================================================================
import { useId } from '../blocks.js';
import { html, useLayoutEffect, useRef } from '../html.js';
import { PLACEHOLDER_PREFIX } from '../kle-layout.js';
import { changed } from '../preview.js';
import {
  MAX_KEY_WIDTH,
  MAX_POSITION,
  MIN_POSITION,
  SNAP,
  baseHeight,
  baseWidth,
  editProf,
  forgetKeyEdits,
  keyHeight,
  keyPos,
  keyWidth,
  round2,
  setKeyHeight,
  setKeyPos,
  setKeyWidth,
  tidyProf,
} from '../profiles.js';
import { render } from '../settings.js';
import { selectedKey, selectedKeys, setSelectedKey } from '../state.js';
import { TEXT } from '../text.js';

const LABEL_MAX_LENGTH = 12;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Show or hide these keys in the overlay (they stay on the board here, dimmed, so they can be shown again). */
function setShown(codes, shown) {
  const edited = editProf();
  const hidden = new Set(edited.disabledKeys);
  for (const code of codes) {
    if (shown) hidden.delete(code);
    else hidden.add(code);
  }
  edited.disabledKeys = [...hidden];
  tidyProf();
  changed(true);
}

/** One row: a label on the left, linked to the first control on the right. */
function Row({ label, fieldId, children }) {
  return html`<div class="row">
    <label for=${fieldId}>${label}</label>
    <div class="ctl">${children}</div>
  </div>`;
}

/**
 * A number field for key units. Typing applies at once (the overlay follows); the keyboard here is drawn again when
 * typing settles (on change), so the field isn't redrawn under the cursor.
 */
function NumberField({ id, value, min, max, test, onValue }) {
  const onInput = (inputEvent) => {
    const typed = parseFloat(inputEvent.currentTarget.value);
    if (!Number.isFinite(typed)) return;
    onValue(clamp(typed, min, max));
    changed();
  };
  return html`<input
    id=${id}
    type="number"
    class="num-field"
    min=${min}
    max=${max}
    step=${SNAP}
    value=${round2(value)}
    data-test=${test}
    onInput=${onInput}
    onChange=${() => render()}
  />`;
}

/** The "Show" tickbox in the inspector's title row. `indeterminate` (some of the keys hidden) has no attribute. */
function ShowBox({ checked, indeterminate = false, onChange }) {
  const box = useRef(null);
  useLayoutEffect(() => {
    box.current.indeterminate = indeterminate;
  });
  return html`<label class="inline">
    <input
      type="checkbox"
      ref=${box}
      checked=${checked}
      data-test="key-show"
      onChange=${(changeEvent) => onChange(changeEvent.currentTarget.checked)}
    />
    ${' Show'}
  </label>`;
}

const CANT_LIGHT_UP = "can't light up";

/** "Key: KeyA"; a key imported from KLE that the app couldn't link shows its label instead of its placeholder code. */
function keyTitle(layoutKey) {
  if (!layoutKey.code.startsWith(PLACEHOLDER_PREFIX)) return `Key: ${layoutKey.code}`;
  return `${layoutKey.label || 'Blank key'} · ${CANT_LIGHT_UP}`;
}

/** The inspector for one key: show or hide it, give it a label, set its width, height and exact place. */
function KeyInspector({ layoutKey, profile, overlaps }) {
  const code = layoutKey.code;
  const ids = { label: useId('key-label'), width: useId('key-width'), height: useId('key-height'), x: useId('key-x') };
  const at = keyPos(layoutKey, profile);
  const minWidth = Math.min(1, baseWidth(layoutKey, profile.layoutStyle));
  const minHeight = Math.min(1, baseHeight(layoutKey));
  const moveTo = (x, y) => setKeyPos(layoutKey, x, y);
  const setLabel = (inputEvent) => {
    editProf().labels[code] = inputEvent.currentTarget.value;
    changed();
  };
  const resetLabel = () => {
    delete editProf().labels[code];
    tidyProf();
    changed(true);
  };
  const putBack = () => {
    forgetKeyEdits([code]);
    changed(true);
  };
  const edited = !!(profile.positions[code] || profile.sizes[code]);
  return html`<div class="editor" data-test="key-editor">
    <div class="inspector-title">
      <b data-test="key-editor-title">${keyTitle(layoutKey)}</b>
      <${ShowBox} checked=${!profile.disabledKeys.includes(code)} onChange=${(shown) => setShown([code], shown)} />
    </div>
    <${Row} label="Label" fieldId=${ids.label}>
      <input
        id=${ids.label}
        type="text"
        placeholder="Label"
        maxlength=${LABEL_MAX_LENGTH}
        value=${profile.labels[code] ?? layoutKey.label ?? ''}
        data-test="key-label"
        onInput=${setLabel}
      />
      <button type="button" data-test="key-label-reset" onClick=${resetLabel}>Reset</button>
    <//>
    <${Row} label="Width in keys" fieldId=${ids.width}>
      <${NumberField}
        id=${ids.width}
        value=${keyWidth(layoutKey, profile)}
        min=${minWidth}
        max=${MAX_KEY_WIDTH}
        test="key-width"
        onValue=${(width) => setKeyWidth(layoutKey, width)}
      />
    <//>
    <${Row} label="Height in keys" fieldId=${ids.height}>
      <${NumberField}
        id=${ids.height}
        value=${keyHeight(layoutKey, profile)}
        min=${minHeight}
        max=${MAX_KEY_WIDTH}
        test="key-height"
        onValue=${(height) => setKeyHeight(layoutKey, height)}
      />
    <//>
    <${Row} label="Position" fieldId=${ids.x}>
      <span>X</span>
      <${NumberField}
        id=${ids.x}
        value=${at.x}
        min=${MIN_POSITION}
        max=${MAX_POSITION}
        test="key-x"
        onValue=${(x) => moveTo(x, keyPos(layoutKey, profile).y)}
      />
      <span>Y</span>
      <${NumberField}
        value=${at.y}
        min=${MIN_POSITION}
        max=${MAX_POSITION}
        test="key-y"
        onValue=${(y) => moveTo(keyPos(layoutKey, profile).x, y)}
      />
    <//>
    ${overlaps ? html`<p class="danger-note">${TEXT.overlapNote}</p>` : null}
    <button type="button" data-test="key-position-reset" disabled=${!edited} onClick=${putBack}>
      Put back where it was
    </button>
  </div>`;
}

/** The inspector while several keys are selected: show or hide them together, or put them back. */
function GroupInspector({ profile }) {
  const codes = [...selectedKeys];
  const hiddenCount = codes.filter((code) => profile.disabledKeys.includes(code)).length;
  const anyEdited = codes.some((code) => profile.positions[code] || profile.sizes[code]);
  const putBack = () => {
    forgetKeyEdits(codes);
    changed(true);
  };
  const clear = () => {
    setSelectedKey(null);
    render();
  };
  return html`<div class="editor" data-test="key-editor">
    <div class="inspector-title">
      <b data-test="key-editor-title">${codes.length} keys selected</b>
      <${ShowBox}
        checked=${hiddenCount === 0}
        indeterminate=${hiddenCount > 0 && hiddenCount < codes.length}
        onChange=${(shown) => setShown(codes, shown)}
      />
    </div>
    <p class="note">${TEXT.groupInspectorTip}</p>
    <div class="btns">
      <button
        type="button"
        data-test="key-group-put-back"
        title="Put back where the layout has them"
        disabled=${!anyEdited}
        onClick=${putBack}
      >
        Put these back
      </button>
      <button type="button" data-test="key-clear-selection" onClick=${clear}>Clear selection</button>
    </div>
  </div>`;
}

/** Nothing selected yet: how to select keys. */
function EmptyInspector() {
  return html`<div class="editor" data-test="key-inspector-empty">
    <b>${TEXT.noKeySelected}</b>
    <p class="note">${TEXT.inspectorTip}</p>
  </div>`;
}

/** The panel to the right of the editor: what is selected, and the controls for it. */
export function Inspector({ layout, profile, overlapping }) {
  const selected = selectedKey && layout.keys.find((layoutKey) => layoutKey.code === selectedKey);
  let content = html`<${EmptyInspector} />`;
  if (selected)
    content = html`<${KeyInspector}
      key=${selected.code}
      layoutKey=${selected}
      profile=${profile}
      overlaps=${overlapping.has(selected.code)}
    />`;
  else if (selectedKeys.size > 1) content = html`<${GroupInspector} profile=${profile} />`;
  return html`<aside class="inspector" aria-label="Selected keys">${content}</aside>`;
}
