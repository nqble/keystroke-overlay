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
  const p = settings.layout.profiles[curLayout()?.id];
  return p
    ? { disabledKeys: p.disabledKeys ?? [], labels: p.labels ?? {}, positions: p.positions ?? {} }
    : EMPTY_PROFILE();
};

/** For changing: creates the profile on the first edit. */
export const editProf = () => {
  const p = (settings.layout.profiles[curLayout().id] ??= EMPTY_PROFILE());
  p.positions ??= {};
  return p;
};

export const isCustom = (id) => {
  const p = settings.layout.profiles[id];
  return (
    !!p &&
    (p.disabledKeys?.length > 0 || Object.keys(p.labels ?? {}).length > 0 || Object.keys(p.positions ?? {}).length > 0)
  );
};

/** Forget an edited profile that no longer differs from the default, so "customized" only shows when it should. */
export function tidyProf() {
  const id = curLayout().id,
    p = settings.layout.profiles[id];
  if (p && !p.disabledKeys.length && !Object.keys(p.labels).length && !Object.keys(p.positions ?? {}).length)
    delete settings.layout.profiles[id];
}

export const SNAP = 0.25; // keys snap to quarter-key steps

export const snap = (v) => Math.round(v / SNAP) * SNAP;

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
      const g = groups[groups.length - 1];
      if (g && from <= g.end + 1e-6) g.end = Math.max(g.end, to);
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
  for (const it of keys) out[it.k.code] = { x: Math.max(0, snap(newX(it))), y: Math.max(0, snap(newY(it))) };
  return out;
}
