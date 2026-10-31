// =====================================================================================================================
//  First run setup (docs/design/ui-design-v2.md, First run setup): three short steps to add the overlay to OBS, shown
//  over the Layout tab's content on a brand-new install (get_state's firstRun, settings::is_first_run in Rust).
//  The header, the tab list and the live preview stay, so the user sees what OBS will show. ✕ closes it any time;
//  it also closes by itself when OBS first connects, and the Layout tab then says "You're all set".
//  General → First run setup opens it again. Drawn by tabs/layout.js; OBS connecting is noticed in messages.js.
// =====================================================================================================================
import { call } from './helpers.js';
import { html } from './html.js';
import { Icon } from './icons.js';
import { copyUrl, obsSize } from './preview.js';
import { render } from './settings.js';
import { overlays, setTab } from './state.js';

const WORDS = {
  title: 'Add Keystroke Overlay to OBS',
  close: 'Close first run setup',
  copyStep: 'Copy the OBS URL',
  copy: 'Copy OBS URL',
  sourceStep: 'Add a Browser source',
  sourceHow: 'In OBS: Sources → + → Browser',
  sizeStep: 'Paste and size it',
  sizeHow: 'Width × height:',
  waiting: 'Waiting for OBS…',
  allSet: '✓ You’re all set. OBS is connected.',
};

let open = false; // the screen is showing
let allSet = false; // it closed because OBS connected: the Layout tab says so

export const isFirstRunOpen = () => open;
export const isAllSet = () => allSet;

/** Show the screen (a new install, or General → First run setup). */
export function openFirstRun() {
  open = true;
  allSet = false;
  setTab('layout');
}

async function close() {
  open = false;
  await call('ack_first_run'); // closed once: it never opens by itself again
  render();
}

/** An OBS overlay connected or disconnected (messages.js): the first connection finishes the setup. */
export function noticeObs() {
  if (!open || overlays === 0) return;
  allSet = true;
  close();
}

export function AllSetLine() {
  return html`<p class="first-run-done" role="status" data-test="first-run-done">${WORDS.allSet}</p>`;
}

export function FirstRun() {
  return html`<section class="first-run" aria-labelledby="firstRunTitle" data-test="first-run">
    <button
      type="button"
      class="first-run-close"
      aria-label=${WORDS.close}
      data-test="first-run-close"
      onClick=${close}
    >
      <${Icon} name="close" />
    </button>
    <div class="tab-heading">
      <h2 id="firstRunTitle">${WORDS.title}</h2>
    </div>
    <ol class="first-run-steps">
      <li>
        <b>${WORDS.copyStep}</b>
        <button type="button" class="primary" data-test="first-run-copy" onClick=${copyUrl}>${WORDS.copy}</button>
      </li>
      <li>
        <b>${WORDS.sourceStep}</b>
        <span class="note">${WORDS.sourceHow}</span>
      </li>
      <li>
        <b>${WORDS.sizeStep}</b>
        <span class="note"
          >${WORDS.sizeHow + ' '}
          <span id="firstRunSize" class="first-run-size" data-test="first-run-size">${obsSize()}</span></span
        >
      </li>
    </ol>
    <p class="first-run-waiting" role="status">${WORDS.waiting}</p>
  </section>`;
}
