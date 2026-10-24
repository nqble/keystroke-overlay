// =====================================================================================================================
//  General → OBS scenes: hide the overlay, or show another layout, in the OBS scenes you list. This card has only the
//  switch and a count; the list is edited in a popup (ui/settings/obs-scenes-popup.js). The overlay page follows the
//  rules inside OBS (ui/overlay/obs-source.js); the app only saves them (settings `obs.scenes`, cleaned by
//  src-tauri/src/obs_scenes.rs). Off by default. Proposal: docs/proposals/obs-source-events.md.
// =====================================================================================================================
import { Note, Section, Switch } from '../blocks.js';
import { html, useRef, useState } from '../html.js';
import { editScenes } from '../obs-scenes-popup.js';
import { changed } from '../preview.js';
import { settings } from '../state.js';

const WORDS = {
  title: 'OBS scenes',
  enabled: 'Change the overlay per OBS scene',
  note: 'Hide the keys, or show another layout, in the scenes you list. Works in OBS Studio’s Browser source; the live preview always shows your chosen layout.',
  count: (count) => (count === 0 ? 'No scenes yet' : count === 1 ? '1 scene set' : `${count} scenes set`),
  edit: 'Edit scenes…',
};

const scenesSettings = () => settings.obs?.scenes ?? { enabled: false, rules: [] };

/** Save the switch and the rules; the overlay in OBS gets them with the next settings message. */
function save(enabled, rules) {
  settings.obs = { ...settings.obs, scenes: { enabled, rules } };
  changed(false, true);
}

export function ObsScenes() {
  const [scenes, setScenes] = useState(scenesSettings);
  const editButton = useRef(null);
  const update = (enabled, rules) => {
    setScenes({ enabled, rules });
    save(enabled, rules);
  };
  const openEditor = () => editScenes(scenes.rules, (rules) => update(scenes.enabled, rules), editButton.current);
  return html`<${Section} title=${WORDS.title} test="general-obs-scenes">
    <${Switch}
      label=${WORDS.enabled}
      checked=${scenes.enabled}
      onChange=${(want) => update(want, scenes.rules)}
      test="toggle-obs-scenes-enabled"
    />
    <${Note} text=${WORDS.note} />
    ${
      scenes.enabled
        ? html`<div class="row">
            <label data-test="obs-scenes-count">${WORDS.count(scenes.rules.length)}</label>
            <div class="ctl">
              <button type="button" data-test="obs-scenes-edit" ref=${editButton} onClick=${openEditor}>
                ${WORDS.edit}
              </button>
            </div>
          </div>`
        : null
    }
  <//>`;
}
