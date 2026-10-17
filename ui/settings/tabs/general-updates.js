// =====================================================================================================================
//  General → Updates: the version, the channel, the check and the install button. Part of the General tab
//  (general.js). Nothing installs without the user's click and the popup's confirmation (update-popup.js); while an
//  update downloads, paintProgress() in update-popup.js fills the #upBar / #upText line here.
// =====================================================================================================================
import { Detail, Note, Section, Segmented, Switch } from '../blocks.js';
import { invoke } from '../helpers.js';
import { html, useEffect, useState } from '../html.js';
import { showNotes } from '../notes.js';
import { changed } from '../preview.js';
import { appVersion, lastUpdate, settings } from '../state.js';
import { TEXT } from '../text.js';
import { openUpdateDialog, paintProgress, setUpdate } from '../update-popup.js';

const WORDS = {
  title: 'Updates',
  version: 'Version',
  notes: 'Release notes',
  channel: 'Update channel',
  stable: 'Stable',
  latest: 'Latest',
  auto: 'Check automatically',
  check: 'Check now',
  checking: 'Checking…',
  install: 'Install update',
  manualInstall: 'Open GitHub installer',
  upToDate: (version) => `Up to date (version ${version})`,
  available: (version) => `Version ${version} is available`,
  manual: (version) => `Version ${version} is available: install it by hand`,
  detail: (channel) => `Manifest: ${channel}.json on GitHub · signature checked before install`,
};

const CHANNELS = [
  { value: 'stable', text: WORDS.stable },
  { value: 'latest', text: WORDS.latest },
];

/** The status line and button for an update check's answer (plain logic, no page). */
export function describeUpdate(update) {
  if (!update) return { status: '', install: null };
  if (update.available && update.manual) return { status: WORDS.manual(update.version), install: WORDS.manualInstall };
  if (update.available) return { status: WORDS.available(update.version), install: WORDS.install };
  return { status: WORDS.upToDate(update.current), install: null };
}

export function Updates() {
  // The answer is read fresh on every draw: a background check can arrive after the tab was drawn (update-popup.js
  // redraws General then). Only what this card itself is doing is kept here.
  const update = lastUpdate;
  const [ownStatus, setOwnStatus] = useState(null); // "Checking…" or an error, while it applies
  const [checking, setChecking] = useState(false);
  const [auto, setAuto] = useState(!!settings.general.autoCheckUpdates);
  const [channel, setChannel] = useState(settings.general.updateChannel);
  useEffect(paintProgress, []); // a download already running shows its progress straight away

  const checkNow = async () => {
    setChecking(true);
    setOwnStatus(WORDS.checking);
    try {
      setUpdate(await invoke('check_update'));
      setOwnStatus(null);
    } catch (error) {
      setOwnStatus(String(error));
    }
    setChecking(false);
  };
  const chooseChannel = async (value) => {
    settings.general.updateChannel = value;
    setChannel(value);
    await invoke('save_settings', { settings }).catch(() => {}); // the check below must see the new channel
    setUpdate(null);
    await checkNow();
  };
  const turnAuto = (on) => {
    settings.general.autoCheckUpdates = on;
    setAuto(on);
    changed(false, true);
  };
  const { status, install } = describeUpdate(update);
  return html`<${Section} title=${WORDS.title} test="general-updates">
    <div class="row">
      <label>${WORDS.version}</label>
      <div class="ctl">
        <b data-test="app-version">v${appVersion}</b>
        <button type="button" data-test="update-release-notes" onClick=${() => showNotes(appVersion)}>
          ${WORDS.notes}
        </button>
      </div>
    </div>
    <${Segmented}
      label=${WORDS.channel}
      choices=${CHANNELS}
      value=${channel}
      onChange=${chooseChannel}
      test="update-channel"
    />
    <${Note} text=${TEXT.updateChannelHelp} />
    <${Switch} label=${WORDS.auto} checked=${auto} onChange=${turnAuto} test="toggle-general-auto-check-updates" />
    <div class="btns">
      <button type="button" data-test="update-check" disabled=${checking} onClick=${checkNow}>${WORDS.check}</button>
      <button type="button" class="primary" data-test="update-install" hidden=${!install} onClick=${openUpdateDialog}>
        ${install || WORDS.install}
      </button>
    </div>
    <span class="hint" data-test="update-status">${ownStatus ?? status}</span>
    <div class="bar" id="upBar" hidden data-test="general-update-progress"><div class="fill" id="upFill"></div></div>
    <span class="hint" id="upText" data-test="general-update-progress-text"></span>
    ${update?.available && update.manual ? html`<p class="note">${TEXT.manualInstallNote}</p>` : null}
    <${Note} text=${TEXT.updatesNote} />
    <${Detail} text=${WORDS.detail(channel)} />
  <//>`;
}
