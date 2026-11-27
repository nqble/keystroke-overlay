// =====================================================================================================================
//  The side panel's controls for a drawn mouse or controller on the Keys tab (docs/design/future-inputs.md §2): its
//  Shape (which drawing it shows), and for a drawing with extra buttons, the key each one lights up with. An extra
//  button is a button the system doesn't report as a mouse button; the mouse's own software sends it as a key (often
//  F13-F24), so you press that key here. Both are saved with the layout's edits (deviceDrawings, deviceKeys;
//  src-tauri/src/device_keys.rs cleans them). keys-inspector.js shows these rows; the drawing is editor/device-drawing.js.
// =====================================================================================================================
import { Segmented, useId } from '../blocks.js';
import { DEVICE_SHAPES, drawingId, extraButtonsOf } from '../editor/device-drawing.js';
import { html, useEffect, useState } from '../html.js';
import { isKnownKey, keyName } from '../key-names.js';
import { changed } from '../preview.js';
import { editProf, tidyProf } from '../profiles.js';
import { platform } from '../state.js';
import { toggleListening } from '../shortcut.js';
import { words } from '../words.js';

const WORDS = words('keysDevice');

/** Keys that clear an extra button's key instead of choosing one. */
const CLEAR_KEYS = new Set(['Delete', 'Backspace']);

/** An extra button's name: "side3" → "Left side 3", from its slot name (the drawing's data-slot). */
export function extraButtonName(slot) {
  const [, kind, number] = slot.match(/^([a-z]+)(\d*)$/) ?? [];
  const name = WORDS.slot[kind];
  return name ? name(number) : slot;
}

/** Choose the drawing this layout shows for the block (the first shape is the layout file's own: no choice saved). */
function setShape(code, shape, layoutKey) {
  const profile = editProf();
  profile.deviceDrawings ??= {};
  if (shape === (layoutKey.device ?? DEVICE_SHAPES[code][0])) delete profile.deviceDrawings[code];
  else profile.deviceDrawings[code] = shape;
  if (!Object.keys(profile.deviceDrawings).length) delete profile.deviceDrawings;
  tidyProf();
  changed(true);
}

/** Save the key an extra button follows, or clear it (code null). */
function setExtraKey(slot, code) {
  const profile = editProf();
  profile.deviceKeys ??= {};
  if (code) profile.deviceKeys[slot] = code;
  else delete profile.deviceKeys[slot];
  if (!Object.keys(profile.deviceKeys).length) delete profile.deviceKeys;
  tidyProf();
  changed(true);
}

/** Shape: Standard or Gaming (only shown when the device has more than one). */
function ShapeRow({ layoutKey, profile }) {
  const shapes = DEVICE_SHAPES[layoutKey.code] ?? [];
  if (shapes.length < 2) return null;
  const choices = shapes.map((shape) => ({ value: shape, text: WORDS.shapes[shape] ?? shape, test: `shape-${shape}` }));
  return html`<div class="row">
    <span>${WORDS.shape}</span>
    <div class="ctl">
      <${Segmented}
        label=${WORDS.shape}
        choices=${choices}
        value=${drawingId(layoutKey, profile)}
        onChange=${(shape) => setShape(layoutKey.code, shape, layoutKey)}
        test="device-shape"
      />
    </div>
  </div>`;
}

/** One extra button: its name, and a button that shows its key and, clicked, listens for the next key press. */
function ExtraButtonRow({ slot, code }) {
  const [listening, setListening] = useState(false);
  const fieldId = useId('extra-button');
  const shown = code ? keyName(code, platform) : WORDS.none;
  const onKeyDown = (event) => {
    event.preventDefault();
    setListening(false);
    if (event.code === 'Escape') return;
    if (CLEAR_KEYS.has(event.code)) return setExtraKey(slot, null);
    if (isKnownKey(event.code)) setExtraKey(slot, event.code);
  };
  return html`<div class="row">
    <label for=${fieldId}>${extraButtonName(slot)}</label>
    <div class="ctl">
      <button
        id=${fieldId}
        type="button"
        aria-label=${listening ? WORDS.listening : WORDS.choose(extraButtonName(slot), shown)}
        data-test=${`extra-button-${slot}`}
        onClick=${(event) => toggleListening(event, listening, setListening)}
        onKeyDown=${listening ? onKeyDown : null}
        onBlur=${() => setListening(false)}
      >
        ${listening ? WORDS.listening : shown}
      </button>
    </div>
  </div>`;
}

/** The extra buttons of the drawing in use, each with its key; nothing for a drawing without any. */
function ExtraButtons({ layoutKey, profile }) {
  const id = drawingId(layoutKey, profile);
  const [slots, setSlots] = useState([]);
  useEffect(() => {
    let current = true;
    extraButtonsOf(id).then((found) => current && setSlots(found));
    return () => {
      current = false;
    };
  }, [id]);
  if (!slots.length) return null;
  return html`<div class="extra-buttons" data-test="device-extra-buttons">
    <b>${WORDS.extraTitle}</b>
    <p class="note">${WORDS.extraNote}</p>
    ${slots.map((slot) => html`<${ExtraButtonRow} key=${slot} slot=${slot} code=${profile.deviceKeys[slot]} />`)}
  </div>`;
}

/** The rows a drawn device adds to the side panel. */
export function DeviceRows({ layoutKey, profile }) {
  return html`<${ShapeRow} layoutKey=${layoutKey} profile=${profile} />
    <${ExtraButtons} layoutKey=${layoutKey} profile=${profile} />`;
}
