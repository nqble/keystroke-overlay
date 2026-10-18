// =====================================================================================================================
//  What the keyboard access notice says (macOS). Plain logic, no page code, so tests/ui can run it with Node;
//  keyboard-access.js draws it. See docs/MAC-PORT.md.
//  A new case is one more rule in accessNotice().
// =====================================================================================================================

const TEXT = {
  ask: 'Allow keyboard access so the overlay can see your keys. macOS asks you to switch on Keystroke Overlay in Input Monitoring.',
  allow: 'Allow keyboard access',
  restart: 'Access is on. Restart Keystroke Overlay once so macOS starts sending it your keys.',
  restartButton: 'Restart now',
  secure:
    'macOS is blocking key capture right now (Secure Input). It does this while a password is typed. If it stays on, lock and unlock the screen, or quit the app that is holding it.',
};

/**
 * The notice to show, or null for none, from { access: {applies, allowed, secureInput} | null, inputError }.
 * `action` names what its button does ('allow' or 'restart'); no button when it is missing. The order matters:
 *   0. not macOS: no notice (other systems show a capture problem in General);
 *   1. access not given yet: macOS has to be asked first, nothing else can work;
 *   2. access given but capture still failed to start: it only starts after a restart;
 *   3. capture running but macOS has Secure Input on: a hint, nothing to click.
 */
export function accessNotice({ access, inputError }) {
  if (!access?.applies) return null;
  if (!access.allowed) return { kind: 'ask', text: TEXT.ask, action: 'allow', button: TEXT.allow };
  if (inputError) return { kind: 'restart', text: TEXT.restart, action: 'restart', button: TEXT.restartButton };
  if (access.secureInput) return { kind: 'secure', text: TEXT.secure };
  return null;
}
