// =====================================================================================================================
//  General → Pause shortcut and Open settings shortcut: key combinations that pause or resume the overlay, or open this
//  window, from any app, like the tray's Pause overlay and Open settings. Off and empty by default. The app registers
//  only these combinations (src-tauri/src/hotkeys.rs); the key press that sets one is read here, in the settings
//  window, and turned into text by ../shortcut.js.
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
  note: 'Works from any app, even in a game.',
  none: 'No shortcut yet',
  choose: 'Choose shortcut',
  listening: 'Press the keys… (Esc to cancel)',
  needsModifier: (modifiers) => `Add ${modifiers} to that key.`,
  clear: 'Clear',
  saved: (name) => `Pause shortcut: ${name}`,
  openTitle: 'Open settings shortcut',
  openNote: (example) => `Opens this window from any app. Off until you choose keys, for example ${example}.`,
  openSaved: (name) => `Open settings shortcut: ${name}`,
};

/** A suggestion that no common app uses for itself (a plain ⌘, or Ctrl+, opens other apps' own settings). */
const OPEN_SETTINGS_EXAMPLE = { macos: 'Super+Alt+Comma', other: 'Ctrl+Alt+Comma' }; // per-system: key names, shown through shortcutName

/** A key press while choosing: Esc stops, a lone modifier waits for more, a key without a modifier is refused. */
function readShortcutKey(event, stopListening, useShortcut) {
  event.preventDefault();
  if (event.code === 'Escape') return stopListening();
  const text = shortcutFromKey(event);
  if (text === '') return;
  stopListening();
  if (text === null) return toast(WORDS.needsModifier(systemWord('modifiers', platform)), true);
  useShortcut(text);
}

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

  const onKeyDown = (event) =>
    readShortcutKey(
      event,
      () => setListening(false),
      (text) => save(enabled, text),
    );

  return html`<${Section} title=${WORDS.title} test="general-hotkey">
    <${Switch}
      label=${WORDS.enabled}
      checked=${enabled}
      onChange=${(want) => save(want, shortcut)}
      test="toggle-hotkeys-enabled"
    />
    <${Note} text=${WORDS.note} />
    ${
      enabled
        ? html`<${ShortcutPicker}
            ...${{ shortcut, listening, setListening, onKeyDown, clear: () => save(true, '') }}
            test="hotkey-pause"
          />`
        : null
    }
  <//>`;
}

/** General → Open settings shortcut: one picker, no switch (no keys chosen is off). */
export function OpenSettingsShortcut() {
  const [shortcut, setShortcut] = useState(settings.hotkeys?.openSettings ?? '');
  const [listening, setListening] = useState(false);
  const example = OPEN_SETTINGS_EXAMPLE[platform] ?? OPEN_SETTINGS_EXAMPLE.other;

  const save = async (wantShortcut) => {
    try {
      await invoke('set_open_settings_hotkey', { shortcut: wantShortcut });
      settings.hotkeys = { ...settings.hotkeys, openSettings: wantShortcut };
      setShortcut(wantShortcut);
      if (wantShortcut) toast(WORDS.openSaved(shortcutName(wantShortcut, platform)));
    } catch (problem) {
      toast(String(problem), true);
    }
  };
  const onKeyDown = (event) => readShortcutKey(event, () => setListening(false), save);

  return html`<${Section} title=${WORDS.openTitle} test="general-open-settings-hotkey">
    <${Note} text=${WORDS.openNote(shortcutName(example, platform))} />
    <${ShortcutPicker}
      ...${{ shortcut, listening, setListening, onKeyDown, clear: () => save('') }}
      test="hotkey-open-settings"
    />
  <//>`;
}

/** The button that shows and records a shortcut, and Clear; `test` names their data-test hooks. */
function ShortcutPicker({ shortcut, listening, setListening, onKeyDown, clear, test }) {
  const shown = shortcut ? shortcutName(shortcut, platform) : WORDS.none;
  return html`<div class="btns">
    <button
      type="button"
      aria-label=${listening ? WORDS.listening : `${WORDS.choose}: ${shown}`}
      data-test=${`${test}-record`}
      onClick=${(event) => toggleListening(event, listening, setListening)}
      onKeyDown=${listening ? onKeyDown : null}
      onBlur=${() => setListening(false)}
    >
      ${listening ? WORDS.listening : shown}
    </button>
    ${
      shortcut
        ? html`<button type="button" data-test=${`${test}-clear`} onClick=${clear}>${WORDS.clear}</button>`
        : null
    }
  </div>`;
}
