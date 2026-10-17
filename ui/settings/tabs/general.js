// =====================================================================================================================
//  The General tab (docs/design/ui-design-v2.md, Tabs): section cards for Connection (general-connection.js), Keyboard
//  input, Startup, Pause shortcut (general-hotkey.js), Updates (general-updates.js) and a collapsed Advanced. Built
//  with Preact and the shared blocks (blocks.js). Plain words by default; Debug mode adds the technical detail lines.
// =====================================================================================================================
import { Detail, Note, Section, Segmented, Switch } from '../blocks.js';
import { call, invoke, toast } from '../helpers.js';
import { html, useState } from '../html.js';
import { changed } from '../preview.js';
import { inputActive, inputError, setInputActive, setInputError, settings } from '../state.js';
import { resetDialog } from '../dialogs.js';
import { TEXT } from '../text.js';
import { Connection } from './general-connection.js';
import { PauseShortcut } from './general-hotkey.js';
import { Updates } from './general-updates.js';

const WORDS = {
  title: 'General',
  subtitle: 'Connection, startup and updates.',
  input: 'Keyboard input',
  standard: 'Standard',
  compatibility: 'Compatibility',
  standardNote: 'Works with nearly every game. Keep it unless keys don’t light up in one game.',
  compatibilityNote: 'For games where keys don’t light up with Standard. Uses just as little CPU.',
  adminNote: 'If a game runs as administrator, start Keystroke Overlay as administrator too.',
  inputDetail: {
    hook: 'Standard = WH_KEYBOARD_LL hook (Linux: XInput2 raw events)',
    rawinput: 'Compatibility = Raw Input (RIDEV_INPUTSINK, message-only window)',
  },
  inputChanged: (name) => `Keyboard input: ${name}`,
  startup: 'Startup',
  autostart: 'Start with Windows',
  tray: 'Minimize to tray',
  openOnLaunch: 'Open this window on launch',
  advanced: 'Advanced',
  debugMode: 'Debug mode (for developers)',
  restart: 'Restart server',
  restarted: 'Server restarted',
  dataFolder: 'Open data folder',
  reset: 'Reset all settings…',
  quit: 'Quit app',
};

const INPUT_METHODS = [
  { value: 'hook', text: WORDS.standard },
  { value: 'rawinput', text: WORDS.compatibility },
];

export function generalTab() {
  return html`<${General} />`;
}

function General() {
  return html`<div class="tab-page">
    <div class="tab-heading">
      <h2 data-test="section-heading">${WORDS.title}</h2>
      <p class="note">${WORDS.subtitle}</p>
    </div>
    <div class="section-grid">
      <${Connection} />
      <${KeyboardInput} />
      <${Startup} />
      <${PauseShortcut} />
      <${Updates} />
    </div>
    <${Advanced} />
  </div>`;
}

function KeyboardInput() {
  const [method, setMethod] = useState(inputActive);
  const [error, setError] = useState(inputError);
  const choose = async (want) => {
    try {
      await invoke('set_input_method', { method: want });
      setInputActive(want);
      settings.general.inputMethod = want;
      setInputError(null);
      setMethod(want);
      setError(null);
      toast(WORDS.inputChanged(INPUT_METHODS.find((choice) => choice.value === want).text));
    } catch (problem) {
      // the new method could not start: the old one keeps running
      setInputError(String(problem));
      setError(String(problem));
      toast(String(problem), true);
    }
  };
  return html`<${Section} title=${WORDS.input} test="general-input">
    <${Segmented}
      label=${WORDS.input}
      choices=${INPUT_METHODS}
      value=${method}
      onChange=${choose}
      test="input-method-select"
    />
    ${error ? html`<div class="errnote" data-test="input-method-error">${error}</div>` : null}
    <${Note} text=${method === 'hook' ? WORDS.standardNote : WORDS.compatibilityNote} test="input-method-info" />
    <${Note} text=${WORDS.adminNote} />
    <${Detail} text=${WORDS.inputDetail[method]} />
  <//>`;
}

/** A switch for one `general.<name>` setting that saves at once. `onTurn` replaces the plain save when it needs more. */
function SettingSwitch({ name, label, test, onTurn = null }) {
  const [on, setOn] = useState(!!settings.general[name]);
  const turn = (want) => {
    settings.general[name] = want;
    setOn(want);
    if (onTurn) onTurn(want, () => setOn(!want));
    else changed(false, true);
  };
  return html`<${Switch} label=${label} checked=${on} onChange=${turn} test=${test} />`;
}

function Startup() {
  const setAutostart = async (want, undo) => {
    try {
      await invoke('set_autostart', { enabled: want });
    } catch (error) {
      settings.general.autostart = !want;
      undo();
      toast(String(error), true);
    }
  };
  return html`<${Section} title=${WORDS.startup} test="general-startup">
    <${SettingSwitch}
      name="autostart"
      label=${WORDS.autostart}
      test="toggle-general-autostart"
      onTurn=${setAutostart}
    />
    <${SettingSwitch} name="minimizeToTray" label=${WORDS.tray} test="toggle-general-minimize-to-tray" />
    <${SettingSwitch} name="openOnLaunch" label=${WORDS.openOnLaunch} test="toggle-general-open-on-launch" />
  <//>`;
}

/** Collapsed until opened; its controls stay in the page while closed, so tests and the keyboard order don't change. */
function Advanced() {
  const [open, setOpen] = useState(false);
  const restart = async () => {
    try {
      await invoke('restart_server');
      toast(WORDS.restarted);
    } catch (error) {
      toast(String(error), true);
    }
  };
  return html`<section class="section-card" aria-labelledby="advancedTitle" data-test="general-advanced">
    <button
      type="button"
      class="section-toggle"
      aria-expanded=${open ? 'true' : 'false'}
      aria-controls="advancedBody"
      data-test="general-advanced-toggle"
      onClick=${() => setOpen(!open)}
    >
      <span id="advancedTitle" class="section-title">${WORDS.advanced}</span>
      <span aria-hidden="true">${open ? '▾' : '▸'}</span>
    </button>
    <div id="advancedBody" class="section-body" hidden=${!open}>
      <${SettingSwitch}
        name="debugMode"
        label=${WORDS.debugMode}
        test="toggle-general-debug-mode"
        onTurn=${() => changed(true, true)}
      />
      <${Note} text=${TEXT.debugModeHelp} />
      <div class="btns">
        <button type="button" data-test="server-restart" onClick=${restart}>${WORDS.restart}</button>
        <button type="button" data-test="general-open-folder" onClick=${() => call('open_folder', { kind: 'root' })}>
          ${WORDS.dataFolder}
        </button>
        <button type="button" class="danger" data-test="general-reset" onClick=${resetDialog}>${WORDS.reset}</button>
        <button type="button" class="danger" data-test="general-quit" onClick=${() => call('quit_app')}>
          ${WORDS.quit}
        </button>
      </div>
    </div>
  </section>`;
}
