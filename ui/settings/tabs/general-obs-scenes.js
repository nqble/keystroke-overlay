// =====================================================================================================================
//  General → OBS scenes: hide the overlay, or show another layout, in the OBS scenes you list. The overlay page follows
//  the rules inside OBS (ui/overlay/obs-source.js); the app only saves them (settings `obs.scenes`, cleaned by
//  src-tauri/src/obs_scenes.rs). Off by default. Plan: docs/for-claude/proposals/obs-source-events.md.
// =====================================================================================================================
import { Note, Section, Segmented, Switch } from '../blocks.js';
import { html, useState } from '../html.js';
import { shownLayouts } from '../layout-order.js';
import { changed } from '../preview.js';
import { layouts, settings } from '../state.js';

// At most this many rules (must match MAX_SCENE_RULES in src-tauri/src/obs_scenes.rs).
const MAX_RULES = 20;
// The longest scene name, in characters (MAX_SCENE_NAME in obs_scenes.rs).
const MAX_NAME = 100;

const WORDS = {
  title: 'OBS scenes',
  enabled: 'Change the overlay per OBS scene',
  note: 'Hide the keys, or show another layout, in the scenes you list. This works in OBS Studio’s Browser source; anywhere else the overlay always shows your chosen layout.',
  permission:
    'So the overlay knows the scene as soon as OBS starts, right-click the Browser source in OBS, choose **Properties** and set **Page permissions** to **Read access to user information**. Without it, the overlay follows the scene from the first scene switch on.',
  preview: 'The live preview always shows your chosen layout.',
  sceneName: 'Scene name',
  placeholder: 'As OBS spells it',
  show: 'Show',
  hide: 'Hide',
  layout: 'Layout',
  chosenLayout: 'Your chosen layout',
  remove: (scene) => `Remove ${scene || 'this scene'}`,
  add: '+ Add a scene',
  atLimit: `You can list up to ${MAX_RULES} scenes.`,
};

const SHOW_CHOICES = [
  { value: true, text: WORDS.show },
  { value: false, text: WORDS.hide },
];

const scenesSettings = () => settings.obs?.scenes ?? { enabled: false, rules: [] };

/** Save the scene settings; the overlay in OBS gets them with the next settings message. Typing waits to batch up. */
function save(next, immediate = true) {
  settings.obs = { ...settings.obs, scenes: next };
  changed(false, immediate);
}

export function ObsScenes() {
  const [scenes, setScenes] = useState(scenesSettings);
  const update = (next, immediate) => {
    setScenes(next);
    save(next, immediate);
  };
  const setRule = (index, rule, immediate = true) =>
    update({ ...scenes, rules: scenes.rules.map((old, at) => (at === index ? rule : old)) }, immediate);
  const removeRule = (index) => update({ ...scenes, rules: scenes.rules.filter((_, at) => at !== index) });
  const addRule = () => update({ ...scenes, rules: [...scenes.rules, { scene: '', show: false, layout: '' }] });

  return html`<${Section} title=${WORDS.title} test="general-obs-scenes">
    <${Switch}
      label=${WORDS.enabled}
      checked=${scenes.enabled}
      onChange=${(want) => update({ ...scenes, enabled: want })}
      test="toggle-obs-scenes-enabled"
    />
    <${Note} text=${WORDS.note} />
    ${scenes.enabled ? html`<${Rules} ...${{ scenes, setRule, removeRule, addRule }} />` : null}
  <//>`;
}

function Rules({ scenes, setRule, removeRule, addRule }) {
  const full = scenes.rules.length >= MAX_RULES;
  return html`<div class="scene-rules">
    ${scenes.rules.map(
      (rule, index) =>
        html`<${Rule}
          key=${index}
          rule=${rule}
          onChange=${(next, immediate) => setRule(index, next, immediate)}
          onRemove=${() => removeRule(index)}
          index=${index}
        />`,
    )}
    <div class="btns">
      <button type="button" data-test="obs-scene-add" disabled=${full} onClick=${addRule}>${WORDS.add}</button>
    </div>
    ${full ? html`<${Note} text=${WORDS.atLimit} />` : null}
    <${Note} text=${WORDS.permission} />
    <${Note} text=${WORDS.preview} />
  </div>`;
}

/** One scene: its name, show or hide, and the layout to show there. */
function Rule({ rule, onChange, onRemove, index }) {
  const choices = shownLayouts(layouts, settings.layout.order);
  return html`<div class="scene-rule" data-test="obs-scene-rule" data-index=${index}>
    <input
      type="text"
      aria-label=${WORDS.sceneName}
      value=${rule.scene}
      placeholder=${WORDS.placeholder}
      maxlength=${MAX_NAME}
      data-test="obs-scene-name"
      onInput=${(inputEvent) => onChange({ ...rule, scene: inputEvent.currentTarget.value }, false)}
    />
    <${Segmented}
      label=${`${WORDS.show} or ${WORDS.hide.toLowerCase()}`}
      choices=${SHOW_CHOICES}
      value=${rule.show !== false}
      onChange=${(show) => onChange({ ...rule, show })}
      test="obs-scene-show"
    />
    <select
      aria-label=${WORDS.layout}
      data-test="obs-scene-layout"
      disabled=${rule.show === false}
      onChange=${(changeEvent) => onChange({ ...rule, layout: changeEvent.currentTarget.value })}
    >
      <option value="" selected=${!rule.layout}>${WORDS.chosenLayout}</option>
      ${choices.map(
        (layout) => html`<option value=${layout.id} selected=${rule.layout === layout.id}>${layout.name}</option>`,
      )}
    </select>
    <button
      type="button"
      class="menu-button"
      aria-label=${WORDS.remove(rule.scene)}
      data-test="obs-scene-remove"
      onClick=${onRemove}
    >
      ✕
    </button>
  </div>`;
}
