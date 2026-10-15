// =====================================================================================================================
//  The General tab: OBS link, server, security, input method, app options and updates.
// =====================================================================================================================
import { $, button, call, confirmTwice, el, heading, invoke, note, row, toast } from '../helpers.js';
import { toggle } from '../controls.js';
import { md, openUpdateDialog, paintProgress, resetDialog, setUpdate, showNotes } from '../popups.js';
import { changed, copyUrl, frame, previewSrc, sizeText, updateObs } from '../preview.js';
import { render } from '../settings.js';
import {
  settings,
  appVersion,
  inputActive,
  inputError,
  lastUpdate,
  obsUrl,
  setInputActive,
  setInputError,
  setObsUrl,
} from '../state.js';
import { TEXT } from '../text.js';

// ---- General: OBS link, server, security, input method, app options, updates --------------------------------------
export function generalTab() {
  const page = el('div');
  page.append(
    ...obsSection(),
    ...serverSection(),
    ...secureLinkSection(),
    ...inputSection(),
    ...appSection(),
    ...updatesSection(),
  );
  return page;
}

function obsSection() {
  return [
    heading('OBS'),
    row('Browser Source URL', el('input', { value: obsUrl, readOnly: true }), button('Copy', copyUrl, 'primary')),
    el('p', { className: 'note', id: 'sizeNote', textContent: sizeText() }),
  ];
}

function serverSection() {
  const port = el('input', {
    type: 'number',
    min: 1024,
    max: 65535,
    value: settings.general.port,
    style: 'width:100px',
  });
  const applyPort = async () => {
    try {
      setObsUrl(await invoke('set_port', { port: +port.value }));
      settings.general.port = +port.value;
      $('#banner').hidden = true;
      toast('Port changed — update your OBS source URL');
      frame.src = previewSrc();
      updateObs();
      render();
    } catch (error) {
      toast(String(error), true);
    }
  };
  const restart = async (clickEvent) => {
    clickEvent.target.disabled = true;
    try {
      await invoke('restart_server');
      toast('Server restarted');
    } catch (error) {
      toast(String(error), true);
    }
    clickEvent.target.disabled = false;
  };
  return [
    heading('Server'),
    row('Port', port, button('Apply', applyPort)),
    el('div', { className: 'btns' }, button('Restart server', restart)),
    note(TEXT.serverNote),
  ];
}

function secureLinkSection() {
  const OFF = TEXT.secureLinkOff;
  const ON = TEXT.secureLinkOn;
  const checkbox = el('input', { type: 'checkbox', checked: !!settings.general.secureLink });
  const explanation = el('div', { className: 'note' });
  const newKey = el('button', { className: 'danger', textContent: 'Make a new key' });
  const buttons = el(
    'div',
    { className: 'btns', hidden: !settings.general.secureLink },
    button('Copy secure link', copyUrl, 'primary'),
    newKey,
  );
  const paint = (on) => {
    explanation.replaceChildren(md(on ? ON : OFF));
    buttons.hidden = !on;
  };
  // also reloads the live preview with the new link
  const useLink = (url) => {
    setObsUrl(url);
    updateObs();
    frame.src = previewSrc();
  };

  checkbox.onchange = async () => {
    const want = checkbox.checked;
    checkbox.disabled = true;
    try {
      useLink(await invoke('set_secure_link', { enabled: want }));
      settings.general.secureLink = want;
      updateObs();
      toast(want ? 'Secure link on — copy the new link into OBS.' : 'Secure link off.');
    } catch (error) {
      checkbox.checked = !want;
      toast(String(error), true);
    }
    checkbox.disabled = false;
    paint(checkbox.checked);
  };
  confirmTwice(newKey, 'Make a new key', async () => {
    try {
      useLink(await invoke('regenerate_link_key'));
      toast('New key made — copy the new link into OBS.');
    } catch (error) {
      toast(String(error), true);
    }
  });
  paint(!!settings.general.secureLink);
  return [heading('Secure link'), row('Secure my OBS link', checkbox), explanation, buttons];
}

function inputSection() {
  const METHODS = { hook: 'Standard (keyboard hook) — recommended', rawinput: 'Compatibility (Raw Input)' };
  const INFO = {
    hook: TEXT.inputStandard,
    rawinput: TEXT.inputCompatibility,
  };
  const select = el(
    'select',
    {},
    Object.entries(METHODS).map(([value, name]) => el('option', { value, textContent: name })),
  );
  select.value = inputActive;
  const info = el('div', { className: 'note' });
  const error = el('div', { className: 'errnote', hidden: !inputError, textContent: inputError || '' });
  const showInfo = () => info.replaceChildren(md(INFO[select.value]));

  select.onchange = async () => {
    const want = select.value;
    try {
      await invoke('set_input_method', { method: want });
      setInputActive(want);
      settings.general.inputMethod = want;
      setInputError(null);
      error.hidden = true;
      toast('Keyboard input: ' + METHODS[want].replace(' — recommended', ''));
      // the new method could not start: the old one keeps running
    } catch (e) {
      select.value = inputActive;
      setInputError(String(e));
      error.textContent = inputError;
      error.hidden = false;
      toast(inputError, true);
    }
    showInfo();
  };
  showInfo();
  return [heading('Keyboard input'), row('Input method', select), error, info, note(TEXT.inputNote)];
}

function appSection() {
  const setAutostart = async (on) => {
    try {
      await invoke('set_autostart', { enabled: on });
    } catch (error) {
      toast(String(error), true);
      settings.general.autostart = !on;
      render();
    }
  };
  return [
    heading('App'),
    toggle('general.autostart', 'Start with Windows', setAutostart),
    toggle('general.minimizeToTray', 'Minimize to tray'),
    toggle('general.openOnLaunch', 'Open this window on launch'),
    toggle('general.debugMode', 'Debug mode (for developers)', () => changed(true, true)),
    note(TEXT.debugModeHelp),
    el(
      'div',
      { className: 'btns' },
      button('Open data folder', () => call('open_folder', { kind: 'root' })),
      button('Reset all settings…', resetDialog, 'danger'),
      button('Quit app', () => call('quit_app'), 'danger'),
    ),
  ];
}

function updatesSection() {
  const status = el('span', { className: 'hint', textContent: '' });
  const installBtn = el('button', { className: 'primary', textContent: 'Install update', hidden: true });
  const checkBtn = el('button', { textContent: 'Check for updates' });
  const details = el('p', { className: 'note', hidden: true });

  /** Show the answer of an update check in the status line and the Install button. */
  const showResult = (update) => {
    installBtn.textContent = 'Install update';
    if (update.available && update.manual) {
      status.textContent = `Version ${update.version} is available — this update needs a manual install`;
      details.textContent = (update.notes ? update.notes + '\n\n' : '') + TEXT.manualInstallNote;
      details.style.whiteSpace = 'pre-line';
      details.hidden = false;
      installBtn.textContent = 'Open GitHub installer';
      installBtn.hidden = false;
    } else if (update.available) {
      status.textContent = `Version ${update.version} is available`;
      details.textContent = update.notes || '';
      details.hidden = !update.notes;
      installBtn.hidden = false;
    } else {
      status.textContent = `You're up to date (version ${update.current})`;
      installBtn.hidden = true;
      details.hidden = true;
    }
  };
  /** Ask the app to check now and show the answer. */
  const checkNow = async () => {
    status.textContent = 'Checking…';
    try {
      showResult(setUpdate(await invoke('check_update')));
    } catch (error) {
      status.textContent = String(error);
    }
  };
  checkBtn.onclick = async () => {
    checkBtn.disabled = true;
    await checkNow();
    checkBtn.disabled = false;
  };
  // same confirm dialog as the corner button
  installBtn.onclick = openUpdateDialog;
  if (lastUpdate) showResult(lastUpdate);

  const channel = el(
    'select',
    {},
    el('option', { value: 'stable', textContent: 'Stable (recommended)' }),
    el('option', { value: 'latest', textContent: 'Latest' }),
  );
  channel.value = settings.general.updateChannel;
  channel.onchange = async () => {
    settings.general.updateChannel = channel.value;
    // the check below must see the new channel
    try {
      await invoke('save_settings', { settings: settings });
    } catch {
      /* ignore */
    }
    setUpdate(null);
    await checkNow();
  };

  const progressBar = el(
    'div',
    { className: 'bar', id: 'upBar', hidden: true },
    el('div', { className: 'fill', id: 'upFill' }),
  );
  const statusRow = el(
    'div',
    { className: 'row' },
    el('label'),
    el(
      'div',
      { className: 'ctl', style: 'flex-direction:column;align-items:stretch;gap:6px' },
      status,
      progressBar,
      el('span', { className: 'hint', id: 'upText' }),
    ),
  );
  // after the page is built, show a download already in progress
  setTimeout(paintProgress, 0);

  return [
    heading('Program updates'),
    row(
      'Current version',
      el('b', { textContent: 'v' + appVersion }),
      button('View release notes', () => showNotes(appVersion)),
    ),
    row('Update channel', channel),
    note(TEXT.updateChannelHelp),
    row('Software update', checkBtn, installBtn),
    statusRow,
    details,
    toggle('general.autoCheckUpdates', 'Check for updates automatically'),
    note(TEXT.updatesNote),
  ];
}
