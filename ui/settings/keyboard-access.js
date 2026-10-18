// =====================================================================================================================
//  The keyboard access notice under the header (macOS): "Allow keyboard access", "Restart", or the Secure Input hint.
//  What it says is plain logic in access-notice.js. It is asked again when the window gets focus, which is when the
//  person comes back from System Settings, so nothing polls. Rust side: src-tauri/src/commands/keyboard_access.rs.
// =====================================================================================================================
import { accessNotice } from './access-notice.js';
import { $, invoke } from './helpers.js';
import { html, render as draw } from './html.js';
import { inputError } from './state.js';

let access = null; // { applies, allowed, allowedAtStart, secureInput, captureSeen } from the app; null before the first answer
let asked = false; // true once Allow keyboard access was pressed: the next step is the restart

export function setKeyboardAccess(value) {
  access = value;
}

/** Draw the notice for the current state. Cheap to call often. */
export function paintAccess() {
  const notice = accessNotice({ access, inputError, asked });
  const banner = $('#accessBanner');
  banner.hidden = !notice;
  draw(notice ? html`<${Notice} notice=${notice} />` : null, banner);
}

/** Ask the app again: coming back from System Settings shows the new answer at once. */
export async function refreshAccess() {
  try {
    access = await invoke('get_keyboard_access');
  } catch {
    return; // keep the old answer
  }
  paintAccess();
}

function Notice({ notice }) {
  const press = () => {
    if (notice.action === 'restart') return invoke('restart_app');
    asked = true;
    paintAccess();
    return invoke('request_keyboard_access');
  };
  return html`<span data-test="keyboard-access-text">${notice.text}</span> ${
      notice.button
        ? html`<button class="primary" type="button" data-test="keyboard-access-button" onClick=${press}>
            ${notice.button}
          </button>`
        : null
    }`;
}

addEventListener('focus', refreshAccess);
