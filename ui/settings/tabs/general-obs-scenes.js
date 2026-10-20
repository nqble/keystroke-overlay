// =====================================================================================================================
//  General → OBS scenes: hide the overlay, or show another layout, in the OBS scenes you list. The overlay page follows
//  the rules inside OBS (ui/overlay/obs-source.js); the app only saves them (settings `obs.scenes`, cleaned by
//  src-tauri/src/obs_scenes.rs). Off by default. Plan: docs/for-claude/proposals/obs-source-events.md.
// =====================================================================================================================
import { Note, Section, Segmented, Switch } from '../blocks.js';
import { html, useRef, useState } from '../html.js';
import { shownLayouts } from '../layout-order.js';
import { rowProblem, rulesToSave } from '../obs-scene-rules.js';
import { changed } from '../preview.js';
import { layouts, settings } from '../state.js';

// At most this many rules (must match MAX_SCENE_RULES in src-tauri/src/obs_scenes.rs).
const MAX_RULES = 20;
// The longest scene name, in characters (MAX_SCENE_NAME in obs_scenes.rs).
const MAX_NAME = 100;
// Rows on screen, saved or not (blank and repeated names aren't saved), so the list can't grow without end.
const MAX_ROWS = MAX_RULES * 2;

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
  showOrHide: 'Show or hide',
  layoutWhenHidden: 'No layout to choose: the keys are hidden in this scene.',
  problem: {
    empty: 'Type the scene’s name to use this row.',
    repeat: 'This scene already has a row above; only the first one counts.',
  },
  add: '+ Add a scene',
  atLimit: `You can list up to ${MAX_RULES} scenes.`,
};

const SHOW_CHOICES = [
  { value: true, text: WORDS.show },
  { value: false, text: WORDS.hide },
];

const scenesSettings = () => settings.obs?.scenes ?? { enabled: false, rules: [] };

let lastRowId = 0;
/** A row on screen: a rule plus an id that stays the same for its life (Preact keys, focus), never saved. */
const toRow = (rule) => ({ ...rule, id: ++lastRowId });

/** Save the rules worth saving; the overlay in OBS gets them with the next settings message. */
function save(enabled, rows) {
  settings.obs = { ...settings.obs, scenes: { enabled, rules: rulesToSave(rows) } };
  changed(false, true);
}

export function ObsScenes() {
  const [enabled, setEnabled] = useState(() => scenesSettings().enabled);
  const [rows, setRows] = useState(() => scenesSettings().rules.map(toRow));
  const addButton = useRef(null);
  const update = (nextEnabled, nextRows) => {
    setEnabled(nextEnabled);
    setRows(nextRows);
    save(nextEnabled, nextRows);
  };
  // Typing changes only the screen; the rule is saved when the name box loses focus (or Enter), so a half-typed name
  // never flips the live overlay in OBS on and off.
  const editRow = (id, change, saveNow) => {
    const next = rows.map((row) => (row.id === id ? { ...row, ...change } : row));
    if (saveNow) update(enabled, next);
    else setRows(next);
  };
  const removeRow = (id) => {
    update(
      enabled,
      rows.filter((row) => row.id !== id),
    );
    addButton.current?.focus(); // the removed row's button is gone: never leave the keyboard on the next row's ✕
  };
  const addRow = () => update(enabled, [...rows, toRow({ scene: '', show: false, layout: '' })]);

  return html`<${Section} title=${WORDS.title} test="general-obs-scenes">
    <${Switch}
      label=${WORDS.enabled}
      checked=${enabled}
      onChange=${(want) => update(want, rows)}
      test="toggle-obs-scenes-enabled"
    />
    <${Note} text=${WORDS.note} />
    ${enabled ? html`<${Rules} ...${{ rows, editRow, removeRow, addRow, addButton }} />` : null}
  <//>`;
}

function Rules({ rows, editRow, removeRow, addRow, addButton }) {
  const full = rulesToSave(rows).length >= MAX_RULES || rows.length >= MAX_ROWS;
  return html`<div class="scene-rules">
    ${rows.map(
      (row, index) =>
        html`<${Rule}
          key=${row.id}
          row=${row}
          index=${index}
          problem=${rowProblem(rows, index)}
          onChange=${(change, saveNow = true) => editRow(row.id, change, saveNow)}
          onRemove=${() => removeRow(row.id)}
        />`,
    )}
    <div class="btns">
      <button type="button" data-test="obs-scene-add" ref=${addButton} disabled=${full} onClick=${addRow}>
        ${WORDS.add}
      </button>
    </div>
    ${full ? html`<${Note} text=${WORDS.atLimit} />` : null}
    <${Note} text=${WORDS.permission} />
    <${Note} text=${WORDS.preview} />
  </div>`;
}

/** One scene: its name, show or hide, and the layout to show there. A row that won't be saved says why. */
function Rule({ row, index, problem, onChange, onRemove }) {
  const layoutNoteId = `obs-scene-layout-note-${row.id}`;
  const choices = shownLayouts(layouts, settings.layout.order);
  const hidden = row.show === false;
  const commitName = (event) => onChange({ scene: event.currentTarget.value });
  return html`<div class="scene-rule-block">
    <div class="scene-rule" data-test="obs-scene-rule" data-index=${index}>
      <input
        type="text"
        aria-label=${WORDS.sceneName}
        value=${row.scene}
        placeholder=${WORDS.placeholder}
        maxlength=${MAX_NAME}
        data-test="obs-scene-name"
        onInput=${(event) => onChange({ scene: event.currentTarget.value }, false)}
        onBlur=${commitName}
        onKeyDown=${(event) => event.key === 'Enter' && commitName(event)}
      />
      <${Segmented}
        label=${WORDS.showOrHide}
        choices=${SHOW_CHOICES}
        value=${!hidden}
        onChange=${(show) => onChange({ show })}
        test="obs-scene-show"
      />
      <select
        aria-label=${WORDS.layout}
        aria-describedby=${hidden ? layoutNoteId : null}
        data-test="obs-scene-layout"
        disabled=${hidden}
        onChange=${(event) => onChange({ layout: event.currentTarget.value })}
      >
        <option value="" selected=${!row.layout}>${WORDS.chosenLayout}</option>
        ${choices.map((layout) => html`<option value=${layout.id} selected=${row.layout === layout.id}>${layout.name}</option>`)}
      </select>
      <button
        type="button"
        class="menu-button"
        aria-label=${WORDS.remove(row.scene)}
        data-test="obs-scene-remove"
        onClick=${onRemove}
      >
        ✕
      </button>
    </div>
    ${hidden ? html`<span id=${layoutNoteId} hidden>${WORDS.layoutWhenHidden}</span>` : null}
    ${problem ? html`<p class="note" data-test="obs-scene-problem">${WORDS.problem[problem]}</p>` : null}
  </div>`;
}
