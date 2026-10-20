// =====================================================================================================================
//  The Edit scenes popup (opened from General → OBS scenes, ui/settings/tabs/general-obs-scenes.js): one row per OBS
//  scene, with its name and what the overlay does there. Nothing is saved until Save, so a half-typed name never
//  reaches OBS. The row rules (blank and repeated names) are in obs-scene-rules.js; the shared popup is popup.js.
// =====================================================================================================================
import { Note } from './blocks.js';
import { el } from './helpers.js';
import { html, render as drawPreact, useState } from './html.js';
import { shownLayouts } from './layout-order.js';
import { HIDE_CHOICE, choiceOf, ruleFromChoice, rowProblem, rulesToSave } from './obs-scene-rules.js';
import { dialog } from './popup.js';
import { layouts, settings } from './state.js';

// At most this many rules (must match MAX_SCENE_RULES in src-tauri/src/obs_scenes.rs).
export const MAX_RULES = 20;
// The longest scene name, in characters (MAX_SCENE_NAME in obs_scenes.rs).
const MAX_NAME = 100;
// Rows on screen, saved or not (blank and repeated names aren't saved), so the list can't grow without end.
const MAX_ROWS = MAX_RULES * 2;

const TEXT = {
  title: 'OBS scenes',
  intro: 'Type each scene’s name as OBS spells it. Scenes you don’t list show your chosen layout.',
  sceneHeading: 'Scene',
  choiceHeading: 'In this scene',
  placeholder: 'As OBS spells it',
  hide: 'Hide the overlay',
  chosenLayout: 'Show your chosen layout',
  showLayout: (name) => `Show: ${name}`,
  remove: (scene) => `Remove ${scene || 'this scene'}`,
  problem: {
    empty: 'Type the scene’s name, or remove this row.',
    repeat: 'Already listed above; only the first one counts.',
  },
  add: '+ Add a scene',
  atLimit: `You can list up to ${MAX_RULES} scenes.`,
  permission:
    'Rules start only after the first scene switch? In OBS, right-click the Browser source, choose **Properties** and set **Page permissions** to **Read access to user information**.',
  cancel: 'Cancel',
  save: 'Save',
};

let lastRowId = 0;
/** A row on screen: a rule plus an id that stays the same for its life (Preact keys), never saved. */
const toRow = (rule) => ({ ...rule, id: ++lastRowId });

/**
 * Open the popup with the saved rules. `onSave(rules)` gets the rules worth saving when Save is pressed; `returnFocus`
 * is the button that opened it, so the keyboard lands back there when the popup closes either way.
 */
export function editScenes(rules, onSave, returnFocus) {
  const rowsNow = { current: rules.map(toRow) };
  const body = el('div');
  drawPreact(html`<${SceneList} start=${rowsNow.current} onRows=${(rows) => (rowsNow.current = rows)} />`, body);
  dialog({
    title: TEXT.title,
    body: [body],
    buttons: [
      { label: TEXT.cancel, test: 'dialog-cancel', run: () => returnFocus?.focus() },
      {
        label: TEXT.save,
        test: 'obs-scenes-save',
        primary: true,
        run: () => {
          onSave(rulesToSave(rowsNow.current));
          returnFocus?.focus();
        },
      },
    ],
  });
  body.querySelector('input')?.focus();
}

function SceneList({ start, onRows }) {
  const [rows, setRows] = useState(start);
  const change = (next) => {
    setRows(next);
    onRows(next);
  };
  const edit = (id, patch) => change(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const remove = (id) => change(rows.filter((row) => row.id !== id));
  const add = () => change([...rows, toRow({ scene: '', show: false, layout: '' })]);
  const full = rulesToSave(rows).length >= MAX_RULES || rows.length >= MAX_ROWS;
  return html`<div class="scene-rules">
    <${Note} text=${TEXT.intro} />
    ${rows.length ? html`<${Headings} />` : null}
    ${rows.map(
      (row, index) =>
        html`<${Rule}
          key=${row.id}
          row=${row}
          index=${index}
          problem=${rowProblem(rows, index)}
          onChange=${(patch) => edit(row.id, patch)}
          onRemove=${() => remove(row.id)}
        />`,
    )}
    <div class="btns">
      <button type="button" data-test="obs-scene-add" disabled=${full} onClick=${add}>${TEXT.add}</button>
    </div>
    ${full ? html`<${Note} text=${TEXT.atLimit} />` : null}
    <${Note} text=${TEXT.permission} />
  </div>`;
}

// Column names for sighted people; each control also has its own aria-label, so a screen reader never needs these.
const Headings = () =>
  html`<div class="scene-rule scene-rule-headings" aria-hidden="true">
    <span>${TEXT.sceneHeading}</span><span>${TEXT.choiceHeading}</span><span></span>
  </div>`;

/** One scene: its name and what the overlay does there. A row that won't be saved says why. */
function Rule({ row, index, problem, onChange, onRemove }) {
  const problemId = `obs-scene-problem-${row.id}`;
  const choices = shownLayouts(layouts, settings.layout.order);
  return html`<div class="scene-rule-block">
    <div class="scene-rule" data-test="obs-scene-rule" data-index=${index}>
      <input
        type="text"
        aria-label=${TEXT.sceneHeading}
        aria-describedby=${problem ? problemId : null}
        value=${row.scene}
        placeholder=${TEXT.placeholder}
        maxlength=${MAX_NAME}
        data-test="obs-scene-name"
        onInput=${(event) => onChange({ scene: event.currentTarget.value })}
      />
      <select
        aria-label=${TEXT.choiceHeading}
        data-test="obs-scene-layout"
        onChange=${(event) => onChange(ruleFromChoice(event.currentTarget.value))}
      >
        <option value=${HIDE_CHOICE} selected=${choiceOf(row) === HIDE_CHOICE}>${TEXT.hide}</option>
        <option value="" selected=${choiceOf(row) === ''}>${TEXT.chosenLayout}</option>
        ${choices.map(
          (layout) =>
            html`<option value=${layout.id} selected=${choiceOf(row) === layout.id}>
              ${TEXT.showLayout(layout.name)}
            </option>`,
        )}
      </select>
      <button
        type="button"
        class="menu-button"
        aria-label=${TEXT.remove(row.scene)}
        data-test="obs-scene-remove"
        onClick=${onRemove}
      >
        ✕
      </button>
    </div>
    ${problem ? html`<p class="note" id=${problemId} data-test="obs-scene-problem">${TEXT.problem[problem]}</p>` : null}
  </div>`;
}
