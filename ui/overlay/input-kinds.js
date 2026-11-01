// =====================================================================================================================
//  Which input a key belongs to (keyboard, mouse or controller), so a whole input can be hidden at once: the eye button
//  under the live preview and the tray's Show menu save the hidden inputs per layout (settings.layout.profiles[id]
//  .hiddenInputs), and overlay.js leaves those keys out. The names follow docs/design/future-inputs.md §2; the same
//  rule is in src-tauri/src/input_kinds.rs. Plain logic, tested by tests/ui/input-kinds.test.mjs.
// =====================================================================================================================

/** The inputs, in the order the eye button and the tray show them. Keep in step with INPUT_KINDS in input_kinds.rs. */
export const INPUT_KINDS = ['keyboard', 'mouse', 'controller'];

// Mouse buttons are Mouse… (MouseLeft) and wheel notches Wheel… (WheelUp); controller buttons and sticks are Pad…
// (PadA, PadStickL). A drawn device's own block is named Mouse or Controller. Everything else is a keyboard key,
// placeholders (Unlinked1) included, because they come from keyboard files.
const MOUSE_NAMES = /^(Mouse|Wheel)/;
const CONTROLLER_NAMES = /^(Pad|Controller$)/;

/** 'keyboard', 'mouse' or 'controller' for a key's code. */
export function inputKind(code) {
  if (MOUSE_NAMES.test(code)) return 'mouse';
  if (CONTROLLER_NAMES.test(code)) return 'controller';
  return 'keyboard';
}

/** The inputs a saved profile hides, as a Set; anything that isn't an input name is ignored. */
export function hiddenInputsOf(savedProfile) {
  const saved = Array.isArray(savedProfile?.hiddenInputs) ? savedProfile.hiddenInputs : [];
  return new Set(saved.filter((kind) => INPUT_KINDS.includes(kind)));
}
