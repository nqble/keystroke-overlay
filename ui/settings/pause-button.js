// =====================================================================================================================
//  The round pause button on the live preview (docs/design/ui-design-v2.md, Live preview). It is the same setting as
//  the tray's "Pause overlay", so the button, the header status (obs-status.js) and the tray always agree.
//  messages.js wires the click and repaints after every change. The look (slide-out pill, timing) is in
//  pause-button.css; this file only says which word, icon (icons.js) and name to show.
// =====================================================================================================================

import { iconElement } from './icons.js';

const TEXT = {
  pauseWord: 'Pause',
  resumeWord: 'Resume',
  pauseName: 'Pause overlay',
  resumeName: 'Resume overlay',
};

/** Which word, icon and screen-reader name the button shows. Plain logic, so tests/ui can check it. */
export function pauseButtonLook(paused) {
  if (paused) return { word: TEXT.resumeWord, icon: 'play', name: TEXT.resumeName };
  return { word: TEXT.pauseWord, icon: 'pause', name: TEXT.pauseName };
}

/** Draw the button for the current pause state. */
export function paintPauseButton(button, paused) {
  const look = pauseButtonLook(paused);
  button.classList.toggle('paused', paused);
  button.setAttribute('aria-pressed', String(paused));
  button.setAttribute('aria-label', look.name);
  button.querySelector('.pause-word').textContent = look.word;
  button.querySelector('.pause-icon').replaceChildren(iconElement(look.icon));
}
