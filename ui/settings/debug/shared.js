// =====================================================================================================================
//  The Debug tab's wording and the small helpers every section uses.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { html, useEffect } from '../html.js';

// -------------------------------------------------------------------------------------------------------------------
// Words the user reads. The longer explanations live here, so the code below stays short and the wording is easy to
// find.
// -------------------------------------------------------------------------------------------------------------------
export const TEXT = {
  selfTestHelp:
    'Checks that the server, the overlay page, key capture, your settings, the data folder and every ' +
    'layout are healthy.',
  // `trayName` is the system's name for where the app's icon lives (system-words.js), here and in fakeUpdateHelp
  eventLogHelp: (trayName) =>
    `What the app itself did: server restarts, layout changes, update checks, ${trayName} actions. Kept in ` +
    'memory only (last 300 lines). Never records key presses.',
  keyMonitorHelp:
    'Shows each key the app sees, with the time since the previous event. Use it to check that a key ' +
    'is detected and for timing problems. Press Start first; it stops by itself. Nothing is stored. ' +
    'Don’t type passwords while it runs.',
  // `startup` is the system's name for starting with the computer (system-words.js)
  rawSettingsHelp: (startup) =>
    'The current settings exactly as the app holds them. Edit and press Apply to try odd values; the ' +
    'app validates them like a hand-edited settings file and shows what it corrected. Port, ' +
    `${startup}, keyboard method and secure link have their own controls, so they are not ` +
    'changed here.',
  fakeUpdateHelp: (trayName) =>
    `“Fake update available” shows the update button, the orange ${trayName} dot and the “Update available” ` +
    `${trayName} entry without needing a real release. It stays until you clear it: update checks answer with it ` +
    `meanwhile. The picture shows the ${trayName} icon exactly as it is now.`,
  trayNow: (trayName) => `The ${trayName} icon now:`,
  trayState: (state) =>
    `update dot ${state.updateShown ? 'on' : 'off'} · first menu entry: ${state.firstMenuEntry ?? '?'} · ` +
    `tooltip: ${state.tooltip}`,
  trayNotReady: (trayName) => `The ${trayName} icon is not there yet.`,
  // The Mac window is a WKWebView, inspected with Safari. Only a development build allows it: a built or downloaded app
  // does not switch the inspector on.
  inspectorMacSteps: [
    'Use a development build: quit Keystroke Overlay, then run “npm run dev:debug” in the project folder. A built or downloaded app does not allow the inspector.',
    'In Safari open Settings → Advanced and tick “Show features for web developers”.',
    'In Safari’s Develop menu choose this Mac, then “Keystroke Overlay” and its page.',
  ],
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
    'Developer tools. Switch them off in General → Advanced → Debug mode. Nothing here is saved to disk or ' +
    'sent anywhere.',
};

// -------------------------------------------------------------------------------------------------------------------
// Small building blocks used by every section (Preact, like the rest of the settings window: html.js)

/** Run `fn` now and then every `ms` milliseconds while the section is on screen; leaving the tab stops it. */
export function useEvery(ms, fn) {
  useEffect(() => {
    fn();
    const timer = setInterval(fn, ms);
    return () => clearInterval(timer);
  }, []);
}

/** A button with its test hook. `kind` is a class such as 'primary'. */
export function Button({ text, onClick, kind = '', test = '' }) {
  return html`<button type="button" class=${kind} data-test=${test || null} onClick=${onClick}>${text}</button>`;
}

/** A short help line (plain text, like the rest of the Debug tab). */
export function Hint({ text }) {
  return html`<p class="note">${text}</p>`;
}

/** A two-column list of label → value, each row [label, value, 'good' | 'bad' | ''] . */
export function Facts({ rows }) {
  return html`<div class="dbg-facts" data-test="debug-facts">
    ${rows.flatMap(([label, value, state]) => [
      html`<span class="k">${label}</span>`,
      html`<span class=${'v ' + (state ?? '')}>${String(value)}</span>`,
    ])}
  </div>`;
}

/** One line of a yes/no list: a mark, a name and an optional detail. */
export function Check({ ok, mark, name, detail = '', test = '' }) {
  return html`<div class=${'dbg-test ' + (ok === undefined ? '' : ok ? 'good' : 'bad')} data-test=${test || null}>
    <b>${mark}</b><span>${name}</span>${detail ? html`<i>${detail}</i>` : null}
  </div>`;
}

/** A log line: a time stamp and its text. */
export function LogLine({ time, text }) {
  return html`<div><span class="ts">${time}</span><span>${text}</span></div>`;
}

export const seconds = (s) =>
  s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`;
export const clock = (ms) => {
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(Math.floor(ms / 60000))}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
};
