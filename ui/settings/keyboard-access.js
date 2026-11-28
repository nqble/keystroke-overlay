// =====================================================================================================================
//  The keyboard access notice under the header: on macOS "Allow keyboard access", "Restart", or the Secure Input hint;
//  on Linux Wayland the input-group command with a Copy button.
//  What it says is plain logic in access-notice.js. It is asked again when the window gets focus, which is when the
//  person comes back from System Settings, and once when the first key arrives (after Renew and a restart the window
//  already has focus), so nothing polls. Rust side: src-tauri/src/commands/keyboard_access.rs.
// =====================================================================================================================
import { RENEW_AFTER_SECONDS, accessNotice } from './access-notice.js';
import { $, invoke, tauriEvent } from './helpers.js';
import { html, render as draw } from './html.js';
import { inputError } from './state.js';

let access = null; // { applies, allowed, allowedAtStart, secureInput, captureSeen } from the app; null before the first answer
/** @type {false | 'allow' | 'renew' | 'copy'} */
let asked = false; // the button pressed ('allow', 'renew' or 'copy'): the next step is the restart or log out

export function setKeyboardAccess(value) {
  access = value;
}

let waited = false; // true once the window has waited RENEW_AFTER_SECONDS for a key after an update
let waiting = null; // the one-shot timer for that wait, while the "press any key" notice shows

/**
 * The "press any key" notice after an update gives way to Renew if no key arrives in time: one timer, started when
 * that notice first shows and never repeated, so nothing runs while idle otherwise.
 */
function waitForKeys(notice) {
  if (notice?.kind !== 'checking' || waiting) return;
  waiting = setTimeout(() => {
    waited = true;
    refreshAccess(); // ask the app again: keys may have arrived without a keys-arriving event (while paused)
  }, RENEW_AFTER_SECONDS * 1000);
}

/** Draw the notice for the current state. Cheap to call often. */
export function paintAccess() {
  const notice = accessNotice({ access, inputError, asked, waited });
  waitForKeys(notice);
  const banner = $('#accessBanner');
  banner.hidden = !notice;
  draw(notice ? html`<${Notice} notice=${notice} />` : null, banner);
}

/** Must match KEYS_ARRIVING_EVENT in src-tauri/src/commands/keyboard_access.rs */
const KEYS_ARRIVING_EVENT = 'keys-arriving';

/** Ask the app again: coming back from System Settings shows the new answer at once. */
export async function refreshAccess() {
  try {
    access = await invoke('get_keyboard_access');
  } catch {
    // keep the old answer, but still draw: the wait for a key may have just ended
  }
  paintAccess();
}

function Notice({ notice }) {
  const press = () => {
    if (notice.action === 'restart') return invoke('restart_app');
    asked = notice.action;
    paintAccess();
    if (notice.action === 'copy') return invoke('copy_text', { text: notice.command });
    if (notice.action === 'renew') return invoke('renew_keyboard_access'); // clears the stale permission, then asks
    return invoke('request_keyboard_access');
  };
  return html`<span data-test="keyboard-access-text">${notice.text}</span> ${
      notice.command ? html`<code data-test="keyboard-access-command">${notice.command}</code> ` : null
    }${
      notice.button
        ? html`<button class="primary" type="button" data-test="keyboard-access-button" onClick=${press}>
            ${notice.button}
          </button>`
        : null
    }`;
}

addEventListener('focus', refreshAccess);

tauriEvent.listen(KEYS_ARRIVING_EVENT, refreshAccess);
