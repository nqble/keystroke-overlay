// What a key press means while an extra-button row of the Keys tab listens for its key (tabs/keys-device.js): Esc
// cancels, Delete or Backspace clears, a modifier waits for the key a chord ends with (mouse software often sends
// Ctrl+F13), any other key the app can see is chosen. Plain logic, so tests/ui/key-picker.test.mjs can run it.
import { isKnownKey, isModifierKey } from './key-names.js';

const CLEAR_KEYS = new Set(['Delete', 'Backspace']);
/** F13-F24 by their key name: mouse software may send them with no scancode, and then `event.code` is empty. */
const HIGH_FUNCTION_KEY = /^F(1[3-9]|2[0-4])$/;

/** The key's code, from `event.code`, or for F13-F24 sent with no scancode, from `event.key`. */
export function pressedCode(event) {
  if (event.code) return event.code;
  return HIGH_FUNCTION_KEY.test(event.key) ? event.key : '';
}

/** One key press while listening: { action: 'cancel' | 'clear' | 'wait' | 'choose', code }. */
export function keyPickerStep(event) {
  const code = pressedCode(event);
  if (code === 'Escape') return { action: 'cancel', code };
  if (CLEAR_KEYS.has(code)) return { action: 'clear', code };
  if (isModifierKey(code)) return { action: 'wait', code };
  if (isKnownKey(code)) return { action: 'choose', code };
  return { action: 'cancel', code };
}
