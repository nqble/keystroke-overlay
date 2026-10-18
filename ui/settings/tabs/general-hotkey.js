// =====================================================================================================================
//  General → Pause shortcut: a key combination that pauses or resumes the overlay from any app, like the tray's Pause
//  overlay. Off and empty by default. The app registers only this one combination (src-tauri/src/hotkeys.rs); the
//  key press that sets it is read here, in the settings window, and turned into text by ../shortcut.js.
// =====================================================================================================================
import { Note, Section, Switch } from '../blocks.js';
import { invoke, toast } from '../helpers.js';
import { html, useState } from '../html.js';
import { platform, settings } from '../state.js';
import { shortcutFromKey, shortcutName, toggleListening } from '../shortcut.js';
import { systemWord } from '../system-words.js';

const WORDS = {
  title: 'Pause shortcut',
  enabled: 'Pause with a shortcut',
  note: 'Pauses or resumes the overlay from any app, even in a game.',
  none: 'No shortcut yet',
  choose: 'Choose shortcut',
  listening: 'Press the keys… (Esc to cancel)',
  needsModifier: (modifiers) => `Use ${modifiers} with that key, so it doesn’t get in the way of typing.`,
  clear: 'Clear',
  saved: (name) => `Pause shortcut: ${name}`,
};

export function PauseShortcut() {
  const [enabled, setEnabled] = useState(!!settings.hotkeys?.enabled);
  const [shortcut, setShortcut] = useState(settings.hotkeys?.pause ?? '');
  const [listening, setListening] = useState(false);

  const save = async (wantEnabled, wantShortcut) => {
    try {
      await invoke('set_pause_hotkey', { enabled: wantEnabled, shortcut: wantShortcut });
      settings.hotkeys = { enabled: wantEnabled, pause: wantShortcut };
      setEnabled(wantEnabled);
      setShortcut(wantShortcut);
      if (wantEnabled && wantShortcut) toast(WORDS.saved(shortcutName(wantShortcut, platform)));
    } catch (problem) {
      toast(String(problem), true);
    }
  };

  const onKeyDown = (event) => {
    event.preventDefault();
    if (event.code === 'Escape') {
      setListening(false);
      return;
    }
    const text = shortcutFromKey(event);
    if (text === '') return;
    setListening(false);
    if (text === null) {
      toast(WORDS.needsModifier(systemWord('modifiers', platform)), true);
      return;
    }
    save(enabled, text);
  };

  return html`<${Section} title=${WORDS.title} test="general-hotkey">
    <${Switch}
      label=${WORDS.enabled}
      checked=${enabled}
      onChange=${(want) => save(want, shortcut)}
      test="toggle-hotkeys-enabled"
    />
    <${Note} text=${WORDS.note} />
    ${enabled ? html`<${ShortcutPicker} ...${{ shortcut, listening, setListening, onKeyDown, save }} />` : null}
  <//>`;
}

function ShortcutPicker({ shortcut, listening, setListening, onKeyDown, save }) {
  const shown = shortcut ? shortcutName(shortcut, platform) : WORDS.none;
  return html`<div class="btns">
    <button
      type="button"
      aria-label=${listening ? WORDS.listening : `${WORDS.choose}: ${shown}`}
      data-test="hotkey-pause-record"
      onClick=${(event) => toggleListening(event, listening, setListening)}
      onKeyDown=${listening ? onKeyDown : null}
      onBlur=${() => setListening(false)}
    >
      ${listening ? WORDS.listening : shown}
    </button>
    ${
      shortcut
        ? html`<button type="button" data-test="hotkey-pause-clear" onClick=${() => save(true, '')}>
            ${WORDS.clear}
          </button>`
        : null
    }
  </div>`;
}
