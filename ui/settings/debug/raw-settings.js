// =====================================================================================================================
//  "Settings (raw)": the settings as the app holds them, editable to try odd values.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere; the
//  private link key is always shown redacted (redactSettings).
// =====================================================================================================================
import { flatten, redactSettings } from '../debug-report.js';
import { call, invoke, toast } from '../helpers.js';
import { html, useRef, useState } from '../html.js';
import { resync } from '../messages.js';
import { platform, settings } from '../state.js';
import { systemWord } from '../system-words.js';
import { Button, Check, Hint, TEXT } from './shared.js';

// At most this many corrected values are listed after Apply.
const MAX_CHANGES_SHOWN = 20;

const shownSettings = () => JSON.stringify(redactSettings(settings), null, 2);

/** The setting paths the app changed from what was typed (the link key is never compared or shown). */
function correctedPaths(typed, kept) {
  const before = flatten(typed);
  const after = flatten(kept);
  const paths = Object.keys(after).filter((path) => before[path] !== after[path] && path !== 'general.linkKey');
  return paths.map((path) => ({ path, typed: before[path] ?? '(missing)', kept: after[path] }));
}

/** Sends the typed JSON to the app; returns the corrections, or null when nothing was applied. */
async function applyTyped(text) {
  let typed;
  try {
    typed = JSON.parse(text);
  } catch (e) {
    toast('That is not valid JSON: ' + e.message, true);
    return null;
  }
  try {
    await invoke('save_settings', { settings: typed });
  } catch (e) {
    toast(String(e), true);
    return null;
  }
  const kept = (await invoke('get_state')).settings;
  const changes = correctedPaths(typed, kept);
  await resync();
  return changes;
}

function Result({ changes }) {
  if (!changes) return null;
  const summary = changes.length
    ? `The app corrected ${changes.length} value(s) you typed:`
    : 'Applied exactly as typed.';
  return html`<${Check} ok=${!changes.length} mark=${changes.length ? '!' : '✔'} name=${summary} /> ${changes
      .slice(0, MAX_CHANGES_SHOWN)
      .map(
        (change) =>
          html`<${Check} mark="" name=${change.path} detail=${`typed ${change.typed}  →  kept ${change.kept}`} />`,
      )}`;
}

function RawSettings() {
  // The box is read when Apply is pressed (not kept in state), so text put in by any means, typed or pasted, counts.
  const box = useRef(null);
  const [changes, setChanges] = useState(null);
  const showCurrent = () => {
    box.current.value = shownSettings();
  };
  const apply = async () => {
    const result = await applyTyped(box.current.value);
    if (!result) return;
    showCurrent();
    setChanges(result);
  };
  const reload = async () => {
    await resync();
    showCurrent();
    setChanges(null);
  };
  const copy = async () => {
    await call('copy_text', { text: box.current.value });
    toast('Settings copied');
  };
  return html`<${Hint} text=${TEXT.rawSettingsHelp(systemWord('startup', platform))} />
    <textarea
      class="dbg-json"
      data-test="debug-json"
      spellcheck=${false}
      defaultValue=${shownSettings()}
      ref=${box}
    ></textarea>
    <div class="btns">
      <${Button} text="Apply" kind="primary" test="debug-raw-apply" onClick=${apply} />
      <${Button} text="Reload from app" test="debug-raw-reload" onClick=${reload} />
      <${Button} text="Copy" test="debug-raw-copy" onClick=${copy} />
    </div>
    <div class="dbg-tests" data-test="debug-raw-result"><${Result} changes=${changes} /></div>`;
}

export const rawSettings = { id: 'raw-settings', title: 'Settings (raw)', Body: RawSettings };
