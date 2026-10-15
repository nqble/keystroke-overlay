// =====================================================================================================================
//  Per-layout key edits: hidden keys, labels and moved keys, stored in settings.layout.profiles[layoutId].
// =====================================================================================================================
import { settings, layouts } from './state.js';

// ---------------------------------------------------------------------------------------------------------------------
// 4. Per-layout key edits
//    Every layout has its own hidden keys, labels and moved keys in
//    settings.layout.profiles[layoutId] = { disabledKeys: [], labels: {}, positions: { KeyW: { x, y } } }.
//    `positions` only lists keys the user moved; every other key stays where the layout file puts it. Units are key
//    widths.
// ---------------------------------------------------------------------------------------------------------------------
const EMPTY_PROFILE = () => ({ disabledKeys: [], labels: {}, positions: {} });

export const curLayout = () => layouts.find((l) => l.id === settings.layout.id) ?? layouts[0];

/** For reading only. Always has all three parts, even for settings saved by older versions. */
export const viewProf = () => {
  const profile = settings.layout.profiles[curLayout()?.id];
  return profile
    ? { disabledKeys: profile.disabledKeys ?? [], labels: profile.labels ?? {}, positions: profile.positions ?? {} }
    : EMPTY_PROFILE();
};

/** For changing: creates the profile on the first edit. */
export const editProf = () => {
  const profile = (settings.layout.profiles[curLayout().id] ??= EMPTY_PROFILE());
  profile.positions ??= {};
  return profile;
};

export const isCustom = (id) => {
  const profile = settings.layout.profiles[id];
  return (
    !!profile &&
    (profile.disabledKeys?.length > 0 ||
      Object.keys(profile.labels ?? {}).length > 0 ||
      Object.keys(profile.positions ?? {}).length > 0)
  );
};

/** Forget an edited profile that no longer differs from the default, so "customized" only shows when it should. */
export function tidyProf() {
  const id = curLayout().id,
    profile = settings.layout.profiles[id];
  if (
    profile &&
    !profile.disabledKeys.length &&
    !Object.keys(profile.labels).length &&
    !Object.keys(profile.positions ?? {}).length
  )
    delete settings.layout.profiles[id];
}

/** The layout's key edits as plain text (for undo and redo). "null" means the layout has no edits. */
export const profileSnapshot = (id) => JSON.stringify(settings.layout.profiles[id] ?? null);

/** Put a snapshot from profileSnapshot() back as the layout's key edits. */
export function restoreProfile(id, snapshot) {
  const edits = JSON.parse(snapshot);
  if (edits === null) delete settings.layout.profiles[id];
  else settings.layout.profiles[id] = edits;
}

export const SNAP = 0.25; // the default snap step, and the one "Tidy up" always uses (a quarter key)
export const FINE_STEP = 0.05; // how far the arrow buttons move a key while snapping is off

/** The Snap menu: [step in key widths, label]. 0 means off. Keep in step with SNAP_CHOICES in settings.rs. */
export const SNAP_CHOICES = [
  [0, 'Off'],
  [0.25, 'Quarter key'],
  [0.5, 'Half key'],
  [1, 'Whole key'],
];

/** The snap step chosen in the Keys tab (saved in settings.layout.editor). */
export const snapStep = () => settings.layout.editor?.snap ?? SNAP;

export const gridShown = () => settings.layout.editor?.grid ?? false;

/** How far one press of an arrow button or arrow key moves keys: the snap step, or a fine step when snapping is off. */
export const nudgeStep = () => snapStep() || FINE_STEP;

/** Round to the nearest snap step (the chosen one unless told otherwise). With snapping off the value is unchanged. */
export const snap = (v, step = snapStep()) => (step === 0 ? v : Math.round(v / step) * step);

export const round2 = (v) => Math.round(v * 100) / 100;

/** Where a key is drawn: its saved position if the user moved it, otherwise the layout file's. */
export const keyPos = (key, profile) => profile.positions[key.code] ?? { x: key.x, y: key.y };

/** Save a key's position (dropping the entry when it is back where the layout file has it). */
export function setKeyPos(key, x, y) {
  const prof = editProf();
  x = round2(x);
  y = round2(y);
  if (Math.abs(x - key.x) < 1e-6 && Math.abs(y - key.y) < 1e-6) delete prof.positions[key.code];
  else prof.positions[key.code] = { x, y };
  tidyProf();
}

/**
 * "Tidy up": close the dead space left by hidden keys while keeping the keyboard's shape. Every key keeps its place
 * relative to the
 * others; empty gaps of about a key or more close completely, then everything moves to the top-left corner and snaps to
 * quarter steps.
 * Hidden keys are left alone. Returns { code: { x, y } } for the visible keys.
 */
export function tidyPositions(layout, profile) {
  const hidden = new Set(profile.disabledKeys);
  const keys = layout.keys.filter((k) => !hidden.has(k.code)).map((k) => ({ k, ...keyPos(k, profile) }));
  if (!keys.length) return {};
  /** For one axis: a function giving a key's new coordinate once the empty gaps are closed. */
  const closeGaps = (start, size) => {
    const spans = keys.map((it) => [start(it), start(it) + size(it)]).sort((a, b) => a[0] - b[0]);
    const groups = []; // stretches of the axis that at least one key covers
    for (const [from, to] of spans) {
      const group = groups[groups.length - 1];
      if (group && from <= group.end + 1e-6) group.end = Math.max(group.end, to);
      else groups.push({ start: from, end: to, shift: 0 });
    }
    let shift = groups[0].start; // the first stretch moves to 0
    groups[0].shift = shift;
    for (let i = 1; i < groups.length; i++) {
      const gap = groups[i].start - groups[i - 1].end;
      if (gap >= 0.75) shift += gap; // a gap of about a key or more closes completely
      groups[i].shift = shift;
    }
    return (it) => start(it) - groups.find((g) => start(it) >= g.start - 1e-6 && start(it) <= g.end + 1e-6).shift;
  };
  const newX = closeGaps(
      (it) => it.x,
      (it) => it.k.w ?? 1,
    ),
    newY = closeGaps(
      (it) => it.y,
      (it) => it.k.h ?? 1,
    );
  const out = {};
  for (const it of keys)
    out[it.k.code] = { x: Math.max(0, snap(newX(it), SNAP)), y: Math.max(0, snap(newY(it), SNAP)) };
  return out;
}
