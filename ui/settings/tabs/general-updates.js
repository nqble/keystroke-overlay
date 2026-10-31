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

/** "Check now": its own status line ("Checking…" or an error) while it runs, and whether it is running. */
function useUpdateCheck() {
  const [ownStatus, setOwnStatus] = useState(null);
  const [checking, setChecking] = useState(false);
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
  return { ownStatus, checking, checkNow };
}

/** This version, and its release notes. */
function VersionRow() {
  return html`<div class="row">
    <label>${WORDS.version}</label>
    <div class="ctl">
      <b data-test="app-version">v${appVersion}</b>
      <button type="button" data-test="update-release-notes" onClick=${() => showNotes(appVersion)}>
        ${WORDS.notes}
      </button>
    </div>
  </div>`;
}

/** The status line, the download's progress (update-popup.js paints it) and, for a by-hand update, how to do it. */
function UpdateStatus({ text, manual }) {
  return html`<span class="hint" data-test="update-status">${text}</span>
    <div class="bar" id="upBar" hidden data-test="general-update-progress"><div class="fill" id="upFill"></div></div>
    <span class="hint" id="upText" data-test="general-update-progress-text"></span>
    ${manual ? html`<p class="note">${TEXT.manualInstall}</p>` : null}`;
}

/** Saves "Check automatically" right away and returns it. */
function saveAutoCheck(on) {
  settings.general.autoCheckUpdates = on;
  changed(false, true);
  return on;
}

export function Updates() {
  // The answer is read fresh on every draw: a background check can arrive after the tab was drawn (update-popup.js
  // redraws General then). Only what this card itself is doing is kept here.
  const update = lastUpdate;
  const { ownStatus, checking, checkNow } = useUpdateCheck();
  const [auto, setAuto] = useState(!!settings.general.autoCheckUpdates);
  const [channel, setChannel] = useState(settings.general.updateChannel);
  useEffect(paintProgress, []); // a download already running shows its progress straight away

  const chooseChannel = async (value) => {
    settings.general.updateChannel = value;
    setChannel(value);
    await invoke('save_settings', { settings }).catch(() => {}); // the check below must see the new channel
    setUpdate(null);
    await checkNow();
  };
  const turnAuto = (on) => setAuto(saveAutoCheck(on));
  const { status, install } = describeUpdate(update);
  return html`<${Section} title=${WORDS.title} test="general-updates">
    <${VersionRow} />
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
    <${UpdateStatus} text=${ownStatus ?? status} manual=${!!(update?.available && update.manual)} />
    <${Note} text=${TEXT.updatesNote} />
    <${Detail} text=${WORDS.detail(channel)} />
  <//>`;
}
