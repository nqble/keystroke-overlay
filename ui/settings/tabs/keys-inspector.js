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
  ANGLE_SNAP,
  MAX_ANGLE,
  MAX_KEY_WIDTH,
  MAX_POSITION,
  MIN_POSITION,
  SNAP,
  baseHeight,
  baseWidth,
  editProf,
  editedCodes,
  forgetKeyEdits,
  keyAngle,
  keyHeight,
  keyPos,
  keyWidth,
  round2,
  setKeyAngle,
  setKeyHeight,
  setKeyPos,
  setKeyWidth,
  snapStep,
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
 * typing settles (on change), so the field isn't redrawn under the cursor. `name` is what a screen reader says when the
 * field has no label of its own (the second field in a row).
 */
function NumberField({ id, value, min, max, test, onValue, name = null, step = SNAP }) {
  const onInput = (inputEvent) => {
    const typed = parseFloat(inputEvent.currentTarget.value);
    if (!Number.isFinite(typed)) return;
    onValue(clamp(typed, min, max));
    changed();
  };
  return html`<input
    id=${id}
    aria-label=${name}
    type="number"
    class="num-field"
    min=${min}
    max=${max}
    step=${step}
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

/** The inspector for one key: show or hide it, give it a label, set its width, height, angle and exact place. */
/** The key's own label, and Reset to go back to the layout's. */
function LabelRow({ layoutKey, profile }) {
  const code = layoutKey.code;
  const fieldId = useId('key-label');
  const setLabel = (inputEvent) => {
    editProf().labels[code] = inputEvent.currentTarget.value;
    changed();
  };
  const resetLabel = () => {
    delete editProf().labels[code];
    tidyProf();
    changed(true);
  };
  return html`<${Row} label="Label" fieldId=${fieldId}>
    <input
      id=${fieldId}
      type="text"
      placeholder="Label"
      maxlength=${LABEL_MAX_LENGTH}
      value=${profile.labels[code] ?? layoutKey.label ?? ''}
      data-test="key-label"
      onInput=${setLabel}
    />
    <button type="button" data-test="key-label-reset" onClick=${resetLabel}>Reset</button>
  <//>`;
}

/** Width and height in keys (never narrower or shorter than one key, or than the key already is). */
function SizeRows({ layoutKey, profile }) {
  const widthId = useId('key-width');
  const heightId = useId('key-height');
  return html`<${Row} label="Width in keys" fieldId=${widthId}>
      <${NumberField}
        id=${widthId}
        value=${keyWidth(layoutKey, profile)}
        min=${Math.min(1, baseWidth(layoutKey, profile.layoutStyle))}
        max=${MAX_KEY_WIDTH}
        test="key-width"
        onValue=${(width) => setKeyWidth(layoutKey, width)}
      />
    <//>
    <${Row} label="Height in keys" fieldId=${heightId}>
      <${NumberField}
        id=${heightId}
        value=${keyHeight(layoutKey, profile)}
        min=${Math.min(1, baseHeight(layoutKey))}
        max=${MAX_KEY_WIDTH}
        test="key-height"
        onValue=${(height) => setKeyHeight(layoutKey, height)}
      />
    <//>`;
}

/** The key's angle (the keyboard's own shape only; the Even grid keeps keys straight). */
function AngleRow({ layoutKey, profile }) {
  const fieldId = useId('key-angle');
  return html`<${Row} label="Angle in degrees" fieldId=${fieldId}>
    <${NumberField}
      id=${fieldId}
      value=${keyAngle(layoutKey, profile)}
      min=${-MAX_ANGLE}
      max=${MAX_ANGLE}
      step=${snapStep() ? ANGLE_SNAP : 1}
      test="key-angle"
      onValue=${(angle) => setKeyAngle(layoutKey, angle)}
    />
  <//>`;
}

/** The key's exact place, X and Y in keys. */
function PositionRow({ layoutKey, profile }) {
  const fieldId = useId('key-x');
  const at = keyPos(layoutKey, profile);
  const moveTo = (x, y) => setKeyPos(layoutKey, x, y);
  return html`<${Row} label="Position" fieldId=${fieldId}>
    <span>X</span>
    <${NumberField}
      id=${fieldId}
      value=${at.x}
      min=${MIN_POSITION}
      max=${MAX_POSITION}
      test="key-x"
      name=${TEXT.positionX}
      onValue=${(x) => moveTo(x, keyPos(layoutKey, profile).y)}
    />
    <span>Y</span>
    <${NumberField}
      value=${at.y}
      min=${MIN_POSITION}
      max=${MAX_POSITION}
      test="key-y"
      name=${TEXT.positionY}
      onValue=${(y) => moveTo(keyPos(layoutKey, profile).x, y)}
    />
  <//>`;
}

function KeyInspector({ layoutKey, profile, overlaps }) {
  const code = layoutKey.code;
  const putBack = () => {
    forgetKeyEdits([code]);
    changed(true);
  };
  const edited = editedCodes(profile).has(code);
  const rowProps = { layoutKey, profile };
  return html`<div class="editor" data-test="key-editor">
    <div class="inspector-title">
      <b data-test="key-editor-title">${keyTitle(layoutKey)}</b>
      <${ShowBox} checked=${!profile.disabledKeys.includes(code)} onChange=${(shown) => setShown([code], shown)} />
    </div>
    <${LabelRow} ...${rowProps} />
    <${SizeRows} ...${rowProps} />
    ${profile.layoutStyle === 'shape' ? html`<${AngleRow} ...${rowProps} />` : null}
    <${PositionRow} ...${rowProps} />
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
  const edited = editedCodes(profile);
  const anyEdited = codes.some((code) => edited.has(code));
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
