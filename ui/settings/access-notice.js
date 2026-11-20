// =====================================================================================================================
//  What the keyboard access notice says (macOS, and Linux on Wayland). Plain logic, no page code, so tests/ui can run it
//  with Node; keyboard-access.js draws it. See docs/MAC-PORT.md and docs/LINUX-PORT.md.
//  A new case is one more rule in accessNotice().
// =====================================================================================================================
import { words } from './words.js';

/** Adds the person to the input group, which may read /dev/input. Shown and copied as is; the person runs it. */
export const INPUT_GROUP_COMMAND = 'sudo usermod -aG input $USER';

const TEXT = words('accessNotice');

/** How long the window waits for a key after an update, with macOS saying access is on, before it offers Renew. */
export const RENEW_AFTER_SECONDS = 30;

/**
 * The notice to show, or null for none, from { access: {applies, allowed, allowedAtStart, secureInput, captureSeen} | null,
 * inputError, asked, waited }, where `asked` is the button the person pressed ('allow', 'renew' or 'copy'; false before)
 * and `waited` is true once the window has waited RENEW_AFTER_SECONDS for a key after an update.
 * `action` names what its button does ('allow', 'restart' or 'copy'); no button when it is missing. macOS's own "allowed"
 * answer and "the tap started" are both unreliable (an app can capture fine while macOS says no, and an app macOS denied
 * can still start a tap that never gets a key), so the proof is a key that really arrived (`captureSeen`). The order
 * matters:
 *   0. not macOS: no notice (other systems show a capture problem in General);
 *   1. a key really arrived: capture works, so only the Secure Input hint can apply;
 *   2. the person pressed Allow or Renew: macOS only starts sending keys to an app after it restarts, so offer the
 *      restart. After Renew the entry is gone until then (macOS asks only once the app starts again), so say so;
 *   3. just updated and no key has arrived yet: the permission may have to be renewed, whether macOS says it is on or
 *      not (an ad-hoc signed app is a new program to macOS after an update; docs/MAC-PORT.md); a key arriving clears it.
 *      When macOS says it is on, it usually works (a certificate-signed update keeps it), so first only ask for a key
 *      press, without a Renew button that would reset a working permission; Renew comes after a while without a key;
 *   3b. access not given: macOS has to be asked;
 *   4. access on but capture not working (it failed, or access was given after the app started): restart;
 *   5. capture running but macOS has Secure Input on: a hint, nothing to click.
 *
 * @param {{ access: any, inputError: any, asked?: false | 'allow' | 'renew' | 'copy', waited?: boolean }} state
 */
export function accessNotice({ access, inputError, asked = false, waited = false }) {
  if (!access?.applies) return null;
  if (access.system === 'linux') return linuxNotice(access, asked);
  const secure = access.secureInput ? { kind: 'secure', text: TEXT.secure } : null;
  if (access.captureSeen) return secure;
  if (asked === 'renew') return restartNotice(TEXT.restartAfterRenew);
  if (asked) return restartNotice(TEXT.restartAfterAllow);
  if (access.renewAfterUpdate && access.allowed && !waited) return { kind: 'checking', text: TEXT.checkAfterUpdate };
  if (access.renewAfterUpdate) return { kind: 'renew', text: TEXT.renew, action: 'renew', button: TEXT.renewButton };
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
