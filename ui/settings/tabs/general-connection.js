// =====================================================================================================================
//  General → Connection (docs/design/ui-design-v2.md, Tabs): the OBS link (the only link box in the window), the port
//  and the secure link. Part of the General tab (general.js). preview.js keeps #obsUrl and #sizeNote up to date.
// =====================================================================================================================
import { ConfirmButton, Detail, Note, Section, Switch } from '../blocks.js';
import { $, invoke, toast } from '../helpers.js';
import { html, useState } from '../html.js';
import { copyUrl, frame, previewSrc, sizeText, updateObs } from '../preview.js';
import { render } from '../settings.js';
import { obsUrl, setObsUrl, settings } from '../state.js';
import { TEXT } from '../text.js';

const WORDS = {
  title: 'Connection',
  link: 'OBS link',
  copy: 'Copy',
  port: 'Port',
  apply: 'Apply',
  portChanged: 'Port changed. Copy the OBS link into OBS.',
  secure: 'Secure my OBS link',
  copySecure: 'Copy secure link',
  newKey: 'Make a new key',
  secureOn: 'Secure link on: copy the new link into OBS.',
  secureOff: 'Secure link off.',
  newKeyMade: 'New key made: copy the new link into OBS.',
  serverDetail: (port) => `Local server on 127.0.0.1:${port}`,
  keyDetail: '128-bit key, checked in constant time on /api, /ws, /fonts and /user.',
};

/** The new link takes effect everywhere: the link box, the header, and the live preview (it reloads with the link). */
function useLink(url) {
  setObsUrl(url);
  updateObs();
  frame.src = previewSrc();
}

export function Connection() {
  return html`<${Section} title=${WORDS.title} test="general-connection">
    <${ObsLink} />
    <${Port} />
    <${SecureLink} />
    <${Detail} text=${WORDS.serverDetail(settings.general.port)} />
  <//>`;
}

function ObsLink() {
  return html`<div class="row">
      <label for="obsUrl">${WORDS.link}</label>
      <div class="ctl">
        <input
          id="obsUrl"
          value=${obsUrl}
          readonly
          type=${settings.general.secureLink ? 'password' : 'text'}
          data-test="obs-url"
        />
        <button type="button" class="primary" data-test="general-obs-copy" onClick=${copyUrl}>${WORDS.copy}</button>
      </div>
    </div>
    <p class="note" id="sizeNote" data-test="general-size-note">${sizeText()}</p>`;
}

function Port() {
  const [port, setPort] = useState(String(settings.general.port));
  const apply = async () => {
    try {
      setObsUrl(await invoke('set_port', { port: +port }));
      settings.general.port = +port;
      $('#banner').hidden = true;
      toast(WORDS.portChanged);
      frame.src = previewSrc();
      updateObs();
      render();
    } catch (error) {
      toast(String(error), true);
    }
  };
  return html`<div class="row">
    <label for="serverPort">${WORDS.port}</label>
    <div class="ctl">
      <input
        id="serverPort"
        type="number"
        min="1024"
        max="65535"
        style="width:100px"
        value=${port}
        data-test="server-port"
        onInput=${(inputEvent) => setPort(inputEvent.currentTarget.value)}
      />
      <button type="button" data-test="server-port-apply" onClick=${apply}>${WORDS.apply}</button>
    </div>
  </div>`;
}

function SecureLink() {
  const [on, setOn] = useState(!!settings.general.secureLink);
  const [busy, setBusy] = useState(false);
  const turn = async (want) => {
    setBusy(true);
    try {
      useLink(await invoke('set_secure_link', { enabled: want }));
      settings.general.secureLink = want;
      setOn(want);
      updateObs();
      toast(want ? WORDS.secureOn : WORDS.secureOff);
    } catch (error) {
      toast(String(error), true);
    }
    setBusy(false);
  };
  const newKey = async () => {
    try {
      useLink(await invoke('regenerate_link_key'));
      toast(WORDS.newKeyMade);
    } catch (error) {
      toast(String(error), true);
    }
  };
  return html`<${Switch}
      label=${WORDS.secure}
      checked=${on}
      onChange=${(want) => !busy && turn(want)}
      test="secure-link-toggle"
    />
    <${Note} text=${on ? TEXT.secureLinkOn : TEXT.secureLinkOff} test="secure-link-note" />
    <div class="btns" hidden=${!on}>
      <button type="button" class="primary" data-test="secure-link-copy" onClick=${copyUrl}>${WORDS.copySecure}</button>
      <${ConfirmButton} text=${WORDS.newKey} onConfirm=${newKey} test="secure-link-new-key" />
    </div>
    <${Detail} text=${WORDS.keyDetail} />`;
}
