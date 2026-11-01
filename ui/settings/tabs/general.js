// =====================================================================================================================
//  The General tab (docs/design/ui-design-v2.md, Tabs): section cards for Connection (general-connection.js), OBS
//  scenes (general-obs-scenes.js), Keyboard input, Startup, Pause and Open settings shortcuts (general-hotkey.js), Updates
//  (general-updates.js) and a collapsed Advanced. Built with Preact and the shared blocks (blocks.js). Plain words by
//  default; Debug mode adds the technical detail lines.
// =====================================================================================================================
import { Detail, Note, Section, Segmented, Switch } from '../blocks.js';
import { call, invoke, toast } from '../helpers.js';
import { html, useState } from '../html.js';
import { Icon } from '../icons.js';
import { changed } from '../preview.js';
import { inputActive, inputError, platform, setInputActive, setInputError, settings } from '../state.js';
import { hasMinimizeSetting, inputMethods, systemWord } from '../system-words.js';
import { resetDialog } from '../dialogs.js';
import { devLookOn, isDevbuild, setDevLook } from '../devbuild-look.js';
import { TEXT } from '../text.js';
import { Appearance } from './general-appearance.js';
import { Connection } from './general-connection.js';
import { OpenSettingsShortcut, PauseShortcut } from './general-hotkey.js';
import { ObsScenes } from './general-obs-scenes.js';
import { Updates } from './general-updates.js';

const WORDS = {
  title: 'General',
  input: 'Keyboard input',
  standard: 'Standard',
  compatibility: 'Compatibility',
  standardNote: 'Works with nearly every game.',
  compatibilityNote: 'For games where keys don’t light up with Standard.',
  adminNote: 'If a game runs as administrator, start Keystroke Overlay as administrator too.',
  inputDetail: {
    rawinput: 'Compatibility = Raw Input (RIDEV_INPUTSINK, message-only window)',
  },
  inputChanged: (name) => `Keyboard input: ${name}`,
  startup: 'Startup',
  openOnLaunch: 'Open this window on launch',
  advanced: 'Advanced',
  debugMode: 'Debug mode (for developers)',
  devLook: 'Devbuild look: keep the purple logo',
  devLookNote: 'Turn off to see the logo in the theme’s colors. The DEV badge stays.',
  restart: 'Restart server',
  restarted: 'Server restarted',
  dataFolder: 'Open data folder',
  reset: 'Reset all settings…',
  quit: 'Quit app',
};

const ALL_INPUT_METHODS = [
  { value: 'hook', text: WORDS.standard },
  { value: 'rawinput', text: WORDS.compatibility },
];

/** The methods this system has (system-words.js): only Windows has Compatibility. */
const availableMethods = () => ALL_INPUT_METHODS.filter((choice) => inputMethods(platform).includes(choice.value));

export function generalTab() {
  return html`<${General} />`;
}

function General() {
  return html`<div class="tab-page">
    <div class="tab-heading">
      <h2 data-test="section-heading">${WORDS.title}</h2>
    </div>
    <div class="section-grid">
      <${Connection} />
      <${ObsScenes} />
      <${KeyboardInput} />
      <${Startup} />
      <${PauseShortcut} />
      <${OpenSettingsShortcut} />
      <${Updates} />
    </div>
    <${Appearance} />
    <${Advanced} />
  </div>`;
}

/** The line under the method choice. */
function inputNote(method) {
  return method === 'hook' ? WORDS.standardNote : WORDS.compatibilityNote;
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
      toast(WORDS.inputChanged(ALL_INPUT_METHODS.find((choice) => choice.value === want).text));
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
      choices=${availableMethods()}
      value=${method}
      onChange=${choose}
      test="input-method-select"
    />
    ${error ? html`<div class="errnote" data-test="input-method-error">${error}</div>` : null}
    <${Note} text=${inputNote(method)} test="input-method-info" />
    ${inputMethods(platform).includes('rawinput') ? html`<${Note} text=${WORDS.adminNote} />` : null}
    <${Detail} text=${method === 'hook' ? systemWord('standardDetail', platform) : WORDS.inputDetail[method]} />
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
      label=${systemWord('autostart', platform)}
      test="toggle-general-autostart"
      onTurn=${setAutostart}
    />
    ${
      hasMinimizeSetting(platform)
        ? html`<${SettingSwitch}
            name="minimizeToTray"
            label=${systemWord('minimize', platform)}
            test="toggle-general-minimize-to-tray"
          />`
        : null
    }
    <${SettingSwitch} name="openOnLaunch" label=${WORDS.openOnLaunch} test="toggle-general-open-on-launch" />
  <//>`;
}

/** Devbuilds only: whether the header keeps its purple logo, or shows the drawn one that follows the theme. */
function DevLook() {
  const [on, setOn] = useState(devLookOn());
  const turn = (want) => {
    setDevLook(want);
    setOn(want);
  };
  return html`<${Switch} label=${WORDS.devLook} checked=${on} onChange=${turn} test="toggle-general-dev-look" />
    <${Note} text=${WORDS.devLookNote} />`;
}

/** Collapsed until opened; its controls stay in the page while closed, so tests and the keyboard order don't change. */
async function restartServer() {
  try {
    await invoke('restart_server');
    toast(WORDS.restarted);
  } catch (error) {
    toast(String(error), true);
  }
}

/** Advanced's row of buttons: restart the server, open the data folder, reset everything, quit. */
function AdvancedButtons() {
  return html`<div class="btns">
    <button type="button" data-test="server-restart" onClick=${restartServer}>${WORDS.restart}</button>
    <button type="button" data-test="general-open-folder" onClick=${() => call('open_folder', { kind: 'root' })}>
      ${WORDS.dataFolder}
    </button>
    <button type="button" class="danger" data-test="general-reset" onClick=${resetDialog}>${WORDS.reset}</button>
    <button type="button" class="danger" data-test="general-quit" onClick=${() => call('quit_app')}>
      ${WORDS.quit}
    </button>
  </div>`;
}

function Advanced() {
  const [open, setOpen] = useState(false);
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
      <span class=${open ? 'section-chevron' : 'section-chevron chevron-closed'}><${Icon} name="chevronDown" /></span>
    </button>
    <div id="advancedBody" class="section-body" hidden=${!open}>
      <${SettingSwitch}
        name="debugMode"
        label=${WORDS.debugMode}
        test="toggle-general-debug-mode"
        onTurn=${() => changed(true, true)}
      />
      <${Note} text=${TEXT.debugModeHelp} />
      ${isDevbuild() ? html`<${DevLook} />` : null}
      <${AdvancedButtons} />
    </div>
  </section>`;
}
