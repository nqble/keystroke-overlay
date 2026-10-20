// The rule list the OBS scenes card saves (ui/settings/tabs/general-obs-scenes.js): the rows the person sees, minus the
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
