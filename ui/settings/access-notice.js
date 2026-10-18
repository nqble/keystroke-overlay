// =====================================================================================================================
//  What the keyboard access notice says (macOS, and Linux on Wayland). Plain logic, no page code, so tests/ui can run it
//  with Node; keyboard-access.js draws it. See docs/MAC-PORT.md and docs/LINUX-PORT.md.
//  A new case is one more rule in accessNotice().
// =====================================================================================================================

/** Adds the person to the input group, which may read /dev/input. Shown and copied as is; the person runs it. */
export const INPUT_GROUP_COMMAND = 'sudo usermod -aG input $USER';

const TEXT = {
  ask: 'Allow keyboard access so the overlay can see your keys. macOS asks you to switch on Keystroke Overlay in Input Monitoring. If keys still do not light up after an update, see "On a Mac" in the user guide.',
  allow: 'Allow keyboard access',
  restart: 'Access is on. Restart Keystroke Overlay once so macOS starts sending it your keys.',
  restartAfterAllow:
    'Did you switch Keystroke Overlay on in Input Monitoring? Restart it once so macOS starts sending it your keys.',
  restartButton: 'Restart now',
  inputGroup:
    'To see your keys on Wayland, Keystroke Overlay reads the keyboards directly, which needs the input group. Run this command in a terminal, then log out and back in. Note: every program you run can then read the keyboards (see PRIVACY.md).',
  inputGroupCopied:
    'Copied. Paste it in a terminal and run it, then log out and back in. Keystroke Overlay sees your keys after that.',
  copyCommand: 'Copy the command',
  secure:
    'macOS is blocking key capture right now (Secure Input). It does this while a password is typed. If it stays on, lock and unlock the screen, or quit the app that is holding it.',
};

/**
 * The notice to show, or null for none, from { access: {applies, allowed, allowedAtStart, secureInput, captureSeen} | null,
 * inputError, asked }, where `asked` is true once the person has pressed Allow keyboard access.
 * `action` names what its button does ('allow', 'restart' or 'copy'); no button when it is missing. macOS's own "allowed"
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
  if (access.system === 'linux') return linuxNotice(access, asked);
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

/**
 * Linux on Wayland: reading the keyboards needs the input group. Once the person can read them, nothing to show (a
 * capture problem then has its own message in General). There is no restart button: joining a group only takes effect
 * after logging out and in, which restarts the app anyway.
 */
function linuxNotice(access, asked) {
  if (access.captureSeen || access.allowed) return null;
  const text = asked ? TEXT.inputGroupCopied : TEXT.inputGroup;
  return { kind: 'input-group', text, command: INPUT_GROUP_COMMAND, action: 'copy', button: TEXT.copyCommand };
}
