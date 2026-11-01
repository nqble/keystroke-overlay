// =====================================================================================================================
//  The eye button under the live preview's pause button (docs/proposals/drawn-devices.md, The eye button): pointing at
//  it, or clicking it, slides out Keyboard · Mouse · Controller, and each shows or hides that whole input on the
//  overlay. The choice is saved per layout (settings.layout.profiles[id].hiddenInputs); the overlay leaves those keys
//  out (ui/overlay/input-kinds.js) and the tray's Show menu is the same switch (src-tauri/src/input_kinds.rs). Mouse
//  and Controller are grayed out while their input is off. The look and timing are in eye-button.css.
// =====================================================================================================================
import { $ } from './helpers.js';
import { iconElement } from './icons.js';
import { changed } from './preview.js';
import { hiddenInputs, inputEnabled, toggledInputs } from './input-choice.js';
import { settings } from './state.js';

const TEXT = {
  button: 'What the overlay shows',
  show: { keyboard: 'Show the keyboard', mouse: 'Show the mouse', controller: 'Show the controller' },
};

/** Show or hide one input on the selected layout, save, and repaint. */
function toggleInput(input) {
  const layoutId = settings.layout.id;
  const profiles = (settings.layout.profiles ??= {});
  const profile = (profiles[layoutId] ??= { disabledKeys: [], labels: {} });
  const next = toggledInputs(hiddenInputs(settings), input);
  if (next.length) profile.hiddenInputs = next;
  else delete profile.hiddenInputs;
  changed(false, true);
  paintEyeButton();
}

/** Put each toggle in step with the settings: on, off (dim, slashed) or unavailable (grayed out). */
export function paintEyeButton() {
  if (!settings) return;
  const hidden = hiddenInputs(settings);
  /** @type {NodeListOf<HTMLButtonElement>} */
  const options = document.querySelectorAll('button.eye-option');
  for (const option of options) {
    const input = option.dataset.input;
    const enabled = inputEnabled(settings, input);
    const shown = enabled && !hidden.includes(input);
    option.disabled = !enabled;
    option.classList.toggle('on', shown);
    option.classList.toggle('off', enabled && !shown);
    option.setAttribute('aria-pressed', String(shown));
  }
}

/** Open or close the toggles by clicking the eye (pointing at it opens them too, in CSS). */
function setPinnedOpen(box, open) {
  box.classList.toggle('open', open);
  $('#eyeBtn').setAttribute('aria-expanded', String(open));
}

/** Draws the icons and names once, and wires the clicks. Called at start-up (settings.js). */
export function setUpEyeButton() {
  const box = $('#eyeBox');
  const eye = $('#eyeBtn');
  eye.append(iconElement('eye'));
  eye.setAttribute('aria-label', TEXT.button);
  box.querySelector('.eye-options').setAttribute('aria-label', TEXT.button);
  eye.onclick = () => setPinnedOpen(box, !box.classList.contains('open'));
  /** @type {NodeListOf<HTMLButtonElement>} */
  const options = box.querySelectorAll('button.eye-option');
  for (const option of options) {
    const input = option.dataset.input;
    option.append(iconElement(input));
    option.setAttribute('aria-label', TEXT.show[input]);
    option.onclick = () => toggleInput(input);
  }
  // a click anywhere else closes toggles that were opened by clicking the eye
  document.addEventListener('click', (clickEvent) => {
    if (!box.contains(clickEvent.target)) setPinnedOpen(box, false);
  });
}
