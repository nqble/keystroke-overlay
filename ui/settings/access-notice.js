// =====================================================================================================================
//  What the keyboard access notice says (macOS). Plain logic, no page code, so tests/ui can run it with Node;
//  keyboard-access.js draws it. See docs/MAC-PORT.md.
//  A new case is one more rule in accessNotice().
// =====================================================================================================================

const TEXT = {
  ask: 'Allow keyboard access so the overlay can see your keys. macOS asks you to switch on Keystroke Overlay in Input Monitoring. If it is already listed, remove it with the minus button first, then add it again.',
  allow: 'Allow keyboard access',
  restart: 'Access is on. Restart Keystroke Overlay once so macOS starts sending it your keys.',
  restartAfterAllow:
    'Did you switch Keystroke Overlay on in Input Monitoring? Restart it once so macOS starts sending it your keys.',
  restartButton: 'Restart now',
  secure:
    'macOS is blocking key capture right now (Secure Input). It does this while a password is typed. If it stays on, lock and unlock the screen, or quit the app that is holding it.',
};

/**
 * The notice to show, or null for none, from { access: {applies, allowed, allowedAtStart, secureInput, captureSeen} | null,
 * inputError, asked }, where `asked` is true once the person has pressed Allow keyboard access.
 * `action` names what its button does ('allow' or 'restart'); no button when it is missing. macOS's own "allowed"
 * answer and "the tap started" are both unreliable (an app can capture fine while macOS says no, and an app macOS denied
 * can still start a tap that never gets a key), so the proof is a key that really arrived (`captureSeen`). The order
 * matters:
 *   0. not macOS: no notice (other systems show a capture problem in General);
 *   1. a key really arrived: capture works, so only the Secure Input hint can apply;
 *   2. the person pressed Allow: they have probably switched it on, and macOS only starts sending keys to an app after
 *      it restarts, so offer the restart;
 *   3. access not given: macOS has to be asked;
 *   4. access on but capture not working (it failed, or access was given after the app started): restart;
 *   5. capture running but macOS has Secure Input on: a hint, nothing to click.
 */
export function accessNotice({ access, inputError, asked = false }) {
  if (!access?.applies) return null;
  const secure = access.secureInput ? { kind: 'secure', text: TEXT.secure } : null;
  if (access.captureSeen) return secure;
  if (asked) return restartNotice(TEXT.restartAfterAllow);
  if (!access.allowed) return { kind: 'ask', text: TEXT.ask, action: 'allow', button: TEXT.allow };
  if (inputError || !access.allowedAtStart) return restartNotice(TEXT.restart);
  return secure;
}

function restartNotice(text) {
  return { kind: 'restart', text, action: 'restart', button: TEXT.restartButton };
}
