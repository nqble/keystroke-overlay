// =====================================================================================================================
//  The Debug tab's wording and the small helpers every section uses.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { el } from '../helpers.js';

// -------------------------------------------------------------------------------------------------------------------
// Words the user reads. The longer explanations live here, so the code below stays short and the wording is easy to
// find.
// -------------------------------------------------------------------------------------------------------------------
export const TEXT = {
  selfTestHelp:
    'Checks that the server, the overlay page, key capture, your settings, the data folder and every ' +
    'layout are healthy.',
  eventLogHelp:
    'What the app itself did: server restarts, layout changes, update checks, tray actions. Kept in ' +
    'memory only (last 300 lines). Never records key presses.',
  keyMonitorHelp:
    'Shows each key the app sees, with the time since the previous event. Use it to check that a key ' +
    'is detected and for timing problems. Press Start first; it stops by itself. Nothing is stored. ' +
    'Don’t type passwords while it runs.',
  rawSettingsHelp:
    'The current settings exactly as the app holds them. Edit and press Apply to try odd values; the ' +
    'app validates them like a hand-edited settings file and shows what it corrected. Port, ' +
    'start-with-Windows, keyboard method and secure link have their own controls, so they are not ' +
    'changed here.',
  fakeUpdateHelp:
    '“Fake update available” shows the update button, the orange tray dot and the “Update available” ' +
    'tray entry without needing a real release.',
  inspectorStepEdge:
    'In Microsoft Edge open edge://inspect, add localhost:9222 under “Configure…”, then click ' +
    '“inspect” under Keystroke Overlay.',
  inspectorDeveloperNote:
    'Developers working on the code can run “npm run dev:debug”, which does all of this and turns ' +
    'Debug mode on. In the inspector’s console, the object “ko” has shortcuts: ko.info(), ko.log(), ' +
    "ko.settings(), ko.goto('style').",
  bugReportHelp:
    'Copies one block of text for a GitHub issue, or to paste to an AI assistant such as Claude: a short summary, then ' +
    'the details (version, system, self-test, the settings you changed and the recent event log). It contains no key ' +
    'presses and no private link key, and your user name is removed.',
  debugToolsIntro:
    'Developer tools. Switch them off in General → App → Debug mode. Nothing here is saved to disk or ' +
    'sent anywhere.',
};

// -------------------------------------------------------------------------------------------------------------------
// Small helpers used by every section

/** Run `fn` now and then every `ms` milliseconds, until `root` has left the page (the tab was changed or redrawn). */
export function every(root, ms, fn) {
  fn();
  const timer = setInterval(() => {
    if (!root.isConnected) clearInterval(timer);
    else fn();
  }, ms);
}

/** A two-column list of label → value. Call `.set(rows)` to refresh it. */
export function facts() {
  const box = el('div', { className: 'dbg-facts', test: 'debug-facts' });
  box.set = (rows) =>
    box.replaceChildren(
      ...rows.flatMap(([label, value, state]) => [
        el('span', { className: 'k', textContent: label }),
        el('span', { className: 'v ' + (state ?? ''), textContent: String(value) }),
      ]),
    );
  return box;
}

export const seconds = (s) =>
  s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`;
export const clock = (ms) => {
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(Math.floor(ms / 60000))}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
};
