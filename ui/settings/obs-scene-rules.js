// The rule list the Edit scenes popup saves (ui/settings/obs-scenes-popup.js): the rows the person sees, minus the
// ones that would do nothing. Rows without a name, and a second row naming a scene again (upper and lower case don't
// matter, as in ui/overlay/obs-source.js), are kept on screen but not saved, so nothing vanishes silently after a
// restart. src-tauri/src/obs_scenes.rs cleans the saved list again. No imports, so the tests can load it on its own.

/** The rules worth saving, in order: `{ scene, show, layout }` with a trimmed, unique scene name. */
export function rulesToSave(rows) {
  const seen = new Set();
  const rules = [];
  for (const row of rows) {
    const scene = row.scene.trim();
    const key = scene.toLowerCase();
    if (!scene || seen.has(key)) continue;
    seen.add(key);
    rules.push({ scene, show: row.show !== false, layout: row.layout ?? '' });
  }
  return rules;
}

/** Why a row won't be saved: 'empty', 'repeat' (an earlier row names the same scene), or '' (it will be). */
export function rowProblem(rows, index) {
  const scene = rows[index].scene.trim().toLowerCase();
  if (!scene) return 'empty';
  const earlier = rows.slice(0, index).some((row) => row.scene.trim().toLowerCase() === scene);
  return earlier ? 'repeat' : '';
}

// The popup's "In this scene" menu holds one value per row: this one for Hide, '' for your chosen layout, else a layout
// id. A colon can't appear in a layout id (src-tauri/src/sanitize.rs allows letters, digits, '-', '_', '.' and spaces).
export const HIDE_CHOICE = ':hide';

/** The menu value for a rule. */
export const choiceOf = (rule) => (rule.show === false ? HIDE_CHOICE : (rule.layout ?? ''));

/** The rule fields for a menu value. */
export const ruleFromChoice = (choice) =>
  choice === HIDE_CHOICE ? { show: false, layout: '' } : { show: true, layout: choice };
