// =====================================================================================================================
//  The eye button's choices as plain logic (eye-button.js draws the button): which inputs the selected layout hides,
//  what one click changes, and which inputs can be shown at all. No imports, so tests/ui/eye-button.test.mjs runs it
//  with Node. The overlay side of the same rule is ui/overlay/input-kinds.js; the tray's is src-tauri/src/input_kinds.rs.
// =====================================================================================================================

/** The inputs, in the order the button shows them. Keep in step with INPUT_KINDS in ui/overlay/input-kinds.js (the
 *  settings window can't import from the overlay; tests/ui/eye-button.test.mjs checks they match). */
export const INPUTS = ['keyboard', 'mouse', 'controller'];

/** Can this input be shown? The keyboard always; the mouse and controller only while their input is on (settings.inputs). */
export function inputEnabled(currentSettings, input) {
  if (input === 'mouse') return currentSettings?.inputs?.mouse?.enabled === true;
  if (input === 'controller') return currentSettings?.inputs?.gamepad?.enabled === true;
  return input === 'keyboard';
}

/** The inputs the selected layout hides. */
export function hiddenInputs(currentSettings) {
  const profile = currentSettings?.layout?.profiles?.[currentSettings?.layout?.id];
  const saved = Array.isArray(profile?.hiddenInputs) ? profile.hiddenInputs : [];
  return INPUTS.filter((input) => saved.includes(input));
}

/** The hidden inputs after one click on `input`: hidden becomes shown and shown becomes hidden, in INPUTS order. */
export function toggledInputs(hidden, input) {
  const next = hidden.includes(input) ? hidden.filter((entry) => entry !== input) : [...hidden, input];
  return INPUTS.filter((entry) => next.includes(entry));
}
