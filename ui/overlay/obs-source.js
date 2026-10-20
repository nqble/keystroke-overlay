// OBS scenes (General → OBS scenes): inside OBS Studio's Browser source the page can hear which scene is on air
// (obs-browser's page API: the obsSceneChanged event and window.obsstudio.getCurrentScene). overlay.js uses these
// functions to hide the keys or show another layout in the scenes the user listed. Outside OBS (a browser, the live
// preview) there is no window.obsstudio and nothing here does anything. The scene's name stays in the page: it is never
// stored, logged or sent, not even to the app (PRIVACY.md). Plan: docs/for-claude/proposals/obs-source-events.md.
// No imports, so the tests can load it on its own.

/**
 * Listens for the scene that is on air and calls `onScene(name)` each time it changes. Returns false (and does
 * nothing) when the page isn't in OBS. `host` is `window` (a stand-in in the tests).
 */
export function watchObs(host, { onScene }) {
  const obs = host.obsstudio;
  if (!obs) return false;
  let heardSwitch = false;
  host.addEventListener('obsSceneChanged', (sceneEvent) => {
    const name = sceneEvent.detail?.name;
    if (typeof name !== 'string') return;
    heardSwitch = true;
    onScene(name);
  });
  // The scene at start-up. OBS answers null unless the source's Page permissions allow reading scenes (level 2); then
  // the overlay follows the scene from the first switch on. A late answer never overwrites a newer switch.
  if (typeof obs.getCurrentScene === 'function') {
    obs.getCurrentScene((scene) => {
      if (heardSwitch || typeof scene?.name !== 'string') return;
      onScene(scene.name);
    });
  }
  return true;
}

const sameName = (one, other) => one.trim().toLowerCase() === other.trim().toLowerCase();

/** The user's rule for this scene, or null (the feature is off, the scene is unknown, or no rule names it). */
export function sceneRule(obsSettings, sceneName) {
  if (!obsSettings?.scenes?.enabled || typeof sceneName !== 'string') return null;
  const rules = obsSettings.scenes.rules ?? [];
  return rules.find((rule) => typeof rule?.scene === 'string' && sameName(rule.scene, sceneName)) ?? null;
}

/**
 * What to draw in this scene: `{ layoutId, hidden, wanted }`. Without a matching rule it is the layout chosen in the
 * settings window, shown. A rule's layout that isn't in `layouts` counts as the chosen one; `wanted` still names it, so
 * the overlay can re-read its list once (the layout may have been made after the page loaded).
 */
export function sceneView(settings, sceneName, layouts) {
  const chosen = settings.layout.id;
  const rule = sceneRule(settings.obs, sceneName);
  if (!rule) return { layoutId: chosen, hidden: false, wanted: chosen };
  const wanted = rule.layout || chosen;
  const known = layouts.some((layout) => layout.id === wanted);
  return { layoutId: known ? wanted : chosen, hidden: rule.show === false, wanted };
}
