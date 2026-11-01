// =====================================================================================================================
//  The devbuild look: a devbuild shows its purple logo whatever the theme, so it is never mistaken for the real app
//  (tools/devbuild.mjs). General → Advanced has a switch (devbuilds only) that shows the drawn logo instead, which
//  follows the theme, so a theme can be tested as it will look. The DEV badge stays either way. The choice is the
//  window's own, not a setting: it is kept in this window's storage, never sent anywhere, and the real app has no switch.
// =====================================================================================================================
const KEY = 'devbuildLook';

/** True in a devbuild (tools/devbuild-title.mjs added the badge), false in the real app. */
export const isDevbuild = () => !!document.querySelector('[data-test="dev-badge"]');

/** Whether the purple devbuild logo is shown: on unless the person turned it off. */
export function devLookOn() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Shows or hides the purple devbuild logo (header.css reads the attribute). */
export function setDevLook(on) {
  if (on) delete document.documentElement.dataset.devLook;
  else document.documentElement.dataset.devLook = 'off';
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // storage may be blocked: the choice then lasts until the window closes
  }
}

/** Applies the saved choice when the window opens. The attribute does nothing without the DEV badge (header.css). */
export function applySavedDevLook() {
  if (!devLookOn()) document.documentElement.dataset.devLook = 'off';
}
