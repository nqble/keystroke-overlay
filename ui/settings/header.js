// =====================================================================================================================
//  The header's controls (docs/design/ui-design-v2.md, Header): the OBS status on the left, then Copy OBS URL and the
//  Update ready chip in the top right. The first screen built with Preact (docs/decisions/0013-preact-with-htm-for-the-settings-window.md): paintHeader()
//  draws it from the current state, and anything that changes that state calls paintHeader() again. What the status
//  says is plain logic in obs-status.js; the logo, name and window buttons are fixed markup in index.html (windowbar.js).
// =====================================================================================================================
import { $ } from './helpers.js';
import { html, render as draw, useRef, useState } from './html.js';
import { obsStatus, obsStatusDetail } from './obs-status.js';
import { copyUrl } from './preview.js';
import { render } from './settings.js';
import { lastUpdate, linkChanged, overlays, paused, serverError, setTab, settings } from './state.js';
import { openUpdateDialog } from './update-popup.js';

const TEXT = {
  statusTip: 'OBS URL settings', // the status opens General, where the OBS URL and port live
  copy: 'Copy OBS URL',
  update: 'Update ready',
};

// The same wait as the pause button's: a mouse that only passes over the chip plays nothing.
const ARROW_DELAY_MS = 150;

/** Draw the header's controls for the current state. Cheap to call often: Preact only changes what differs. */
export function paintHeader() {
  const status = obsStatus({ paused, overlays, serverError, linkChanged });
  const tip = settings?.general?.debugMode ? obsStatusDetail(paused, overlays) : TEXT.statusTip;
  const updateReady = !!lastUpdate?.available;
  draw(html`<${HeaderControls} status=${status} tip=${tip} updateReady=${updateReady} />`, $('#headerControls'));
}

function HeaderControls({ status, tip, updateReady }) {
  return html`
    <div class="header-status" data-tauri-drag-region>
      <${ObsStatus} status=${status} tip=${tip} />
    </div>
    <div class="header-actions">
      <button id="copyUrl" data-test="obs-copy" class="primary" type="button" onClick=${copyUrl}>${TEXT.copy}</button>
      <${UpdateChip} hidden=${!updateReady} />
    </div>
  `;
}

/** Live, paused, not connected, link changed or port in use. Clicking it opens the place to fix it: General. */
function ObsStatus({ status, tip }) {
  const openGeneral = () => {
    setTab('general');
    render();
  };
  return html`<button
    id="obsStatus"
    class=${'obs-status ' + status.kind}
    data-test="obs-status"
    type="button"
    aria-live="polite"
    title=${tip}
    onClick=${openGeneral}
  >
    ${status.text}
  </button>`;
}

/**
 * The Update ready chip. Its arrow starts 150 ms after the mouse arrives and, once started, always plays to the end (CSS
 * alone would stop it the moment the mouse leaves). Keyboard focus starts it at once. The timer exists only while the
 * mouse is on the chip. The click opens the update popup where the user is (update-popup.js).
 */
function UpdateChip({ hidden }) {
  const [dropping, setDropping] = useState(false);
  const timer = useRef(0);
  const drop = () => setDropping(true);
  return html`<button
    id="updateBtn"
    data-test="update-button"
    class="update-chip"
    type="button"
    hidden=${hidden}
    onClick=${openUpdateDialog}
    onMouseEnter=${() => (timer.current = setTimeout(drop, ARROW_DELAY_MS))}
    onMouseLeave=${() => clearTimeout(timer.current)}
    onFocus=${drop}
  >
    <span class="update-arrow-box" aria-hidden="true"
      ><span class=${dropping ? 'update-arrow dropping' : 'update-arrow'} onAnimationEnd=${() => setDropping(false)}
        >↓</span
      ></span
    >${TEXT.update}
  </button>`;
}
