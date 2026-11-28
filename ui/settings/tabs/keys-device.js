// =====================================================================================================================
//  The side panel's controls for a drawn mouse or controller on the Keys tab (docs/design/future-inputs.md §2): its
//  Shape (which drawing it shows), and for a drawing with extra buttons, the key each one lights up with. An extra
//  button is a button the system doesn't report as a mouse button; the mouse's own software sends it as a key (often
//  F13-F24), so you press that key here. Both are saved with the layout's edits (deviceDrawings, deviceKeys;
//  src-tauri/src/device_keys.rs cleans them). keys-inspector.js shows these rows; the drawing is editor/device-drawing.js.
// =====================================================================================================================
import { Segmented, useId } from '../blocks.js';
import { DEVICE_SHAPES, drawingId, extraButtonsOf } from '../editor/device-drawing.js';
import { html, useEffect, useRef, useState } from '../html.js';
import { keyName } from '../key-names.js';
import { keyPickerStep, pressedCode } from '../key-picker.js';
import { changed } from '../preview.js';
import { editProf, tidyProf } from '../profiles.js';
import { platform } from '../state.js';
import { toggleListening } from '../shortcut.js';
import { words } from '../words.js';

const WORDS = words('keysDevice');

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
  const shown = drawingId(layoutKey, profile); // clicking the shape already shown changes nothing
  return html`<div class="row">
    <span>${WORDS.shape}</span>
    <div class="ctl">
      <${Segmented}
        label=${WORDS.shape}
        choices=${choices}
        value=${shown}
        onChange=${(shape) => shape !== shown && setShape(layoutKey.code, shape, layoutKey)}
        test="device-shape"
      />
    </div>
  </div>`;
}

/**
 * Listening for the key of one extra button: the key handlers, and `stop`. While listening, a key goes to the picker
 * only (key-picker.js decides what it means), not to the Keys tab's own shortcuts.
 */
function useKeyListener(slot) {
  const [listening, setListening] = useState(false);
  const waitingModifier = useRef(null); // a modifier pressed while listening, chosen if it is let go on its own
  const stop = () => {
    waitingModifier.current = null;
    setListening(false);
  };
  const onKeyDown = (event) => {
    event.preventDefault();
    event.stopPropagation(); // the Keys tab's shortcuts (Esc deselects, Ctrl+Z undoes) must not act on it too
    const step = keyPickerStep(event);
    if (step.action === 'wait') {
      waitingModifier.current = step.code;
      return;
    }
    stop();
    if (step.action === 'clear') setExtraKey(slot, null);
    if (step.action === 'choose') setExtraKey(slot, step.code);
  };
  const onKeyUp = (event) => {
    if (pressedCode(event) !== waitingModifier.current) return;
    event.stopPropagation();
    setExtraKey(slot, waitingModifier.current);
    stop();
  };
  return { listening, setListening, stop, onKeyDown, onKeyUp };
}

/** One extra button: its name, and a button that shows its key and, clicked, listens for the next key press. */
function ExtraButtonRow({ slot, code }) {
  const listener = useKeyListener(slot);
  const { listening } = listener;
  const fieldId = useId('extra-button');
  const shown = code ? keyName(code, platform) : WORDS.none;
  return html`<div class="row">
    <label for=${fieldId}>${extraButtonName(slot)}</label>
    <div class="ctl">
      <button
        id=${fieldId}
        type="button"
        aria-label=${listening ? WORDS.listening : WORDS.choose(extraButtonName(slot), shown)}
        data-test=${`extra-button-${slot}`}
        onClick=${(event) => toggleListening(event, listening, listener.setListening)}
        onKeyDown=${listening ? listener.onKeyDown : null}
        onKeyUp=${listening ? listener.onKeyUp : null}
        onBlur=${listener.stop}
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
