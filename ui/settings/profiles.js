// =====================================================================================================================
//  Per-layout key edits: hidden keys, labels and moved keys, stored in settings.layout.profiles[layoutId].
// =====================================================================================================================
import { settings, layouts } from './state.js';

// ---------------------------------------------------------------------------------------------------------------------
// 4. Per-layout key edits
//    Every layout has its own hidden keys, labels and moved / resized keys in settings.layout.profiles[layoutId]:
//      { disabledKeys: [], labels: {}, layoutStyle: 'grid' (only when chosen),
//        styles: { shape: { positions: { KeyW: { x, y } }, sizes: { Space: { w } } }, grid: { ... } } }
//    hidden keys and labels are shared by both layout styles; positions and sizes belong to one style each ("shape" =
//    the layout file's own shape, "grid" = even columns). Only keys the user moved or resized are listed; every other
//    key stays where the layout file puts it. Units are key widths.
// ---------------------------------------------------------------------------------------------------------------------
const EMPTY_PROFILE = () => ({ disabledKeys: [], labels: {} });

export const LAYOUT_STYLES = ['shape', 'grid'];

// Limits for positions and widths. Keep in step with MAX_POSITION, MIN_KEY_WIDTH and MAX_KEY_WIDTH in settings.rs.
export const MIN_POSITION = -100; // a key may sit left of or above the layout's own origin (the board is centered on the layout)
export const MAX_POSITION = 100;
export const MIN_KEY_WIDTH = 0.25;
export const MAX_KEY_WIDTH = 100;

export const curLayout = () => layouts.find((l) => l.id === settings.layout.id) ?? layouts[0];

/** Which layout style a saved profile uses: "grid" when chosen, otherwise the default "shape". */
export const styleOf = (profile) => (profile?.layoutStyle === 'grid' ? 'grid' : 'shape');

/**
 * For reading only: the profile with the positions and sizes of the layout style in use pulled up to the top. Always
 * has every part, even for settings saved by older versions.
 */
export const viewProf = () => {
  const profile = settings.layout.profiles[curLayout()?.id];
  const style = styleOf(profile);
  const edits = profile?.styles?.[style] ?? {};
  return {
    disabledKeys: profile?.disabledKeys ?? [],
    labels: profile?.labels ?? {},
    layoutStyle: style,
    positions: edits.positions ?? {},
    sizes: edits.sizes ?? {},
  };
};

/** For changing hidden keys, labels and the layout style: creates the profile on the first edit. */
export const editProf = () => (settings.layout.profiles[curLayout().id] ??= EMPTY_PROFILE());

/** The moved or resized keys of the layout style in use, for changing (created when missing). */
function editStyle() {
  const profile = editProf();
  profile.styles ??= {};
  return (profile.styles[styleOf(profile)] ??= {});
}

/** Switch the current layout between the keyboard's own shape ('shape') and the Even grid ('grid'). Each keeps its own edits. */
export function setLayoutStyle(style) {
  const profile = editProf();
  if (style === 'grid') profile.layoutStyle = 'grid';
  else delete profile.layoutStyle;
  tidyProf();
}

/** The positions of moved keys in the layout style in use, for changing. */
export const editPositions = () => (editStyle().positions ??= {});

/** The widths of resized keys in the layout style in use, for changing. */
export const editSizes = () => (editStyle().sizes ??= {});

/** True when a profile differs from the default in any way. */
function hasEdits(profile) {
  const styles = Object.values(profile.styles ?? {});
  const editedStyle = styles.some(
    (edits) => Object.keys(edits.positions ?? {}).length > 0 || Object.keys(edits.sizes ?? {}).length > 0,
  );
  return (
    profile.disabledKeys?.length > 0 ||
    Object.keys(profile.labels ?? {}).length > 0 ||
    profile.layoutStyle === 'grid' ||
    editedStyle
  );
}

export const isCustom = (id) => {
  const profile = settings.layout.profiles[id];
  return !!profile && hasEdits(profile);
};

/** Forget an edited profile that no longer differs from the default, so "customized" only shows when it should. */
export function tidyProf() {
  const id = curLayout().id;
  const profile = settings.layout.profiles[id];
  if (!profile) return;
  for (const style of LAYOUT_STYLES) {
    const edits = profile.styles?.[style];
    if (!edits) continue;
    for (const part of ['positions', 'sizes']) if (!Object.keys(edits[part] ?? {}).length) delete edits[part];
    if (!Object.keys(edits).length) delete profile.styles[style];
  }
  if (profile.styles && !Object.keys(profile.styles).length) delete profile.styles;
  if (!hasEdits(profile)) delete settings.layout.profiles[id];
}

/** Forget the moved and resized keys of the layout style in use (hidden keys and labels stay). */
export function forgetStyleEdits() {
  const profile = editProf();
  delete profile.styles?.[styleOf(profile)];
  tidyProf();
}

/** Put these keys back where, and as wide as, the layout style in use has them. */
export function forgetKeyEdits(codes) {
  const edits = editStyle();
  for (const code of codes) {
    delete edits.positions?.[code];
    delete edits.sizes?.[code];
  }
  tidyProf();
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

/**
 * The snap step in use: the one chosen in the Keys tab (saved in settings.layout.editor), or a whole key in the Even grid
 * layout style (when Snap is on). 0 means Snap is off.
 */
export function snapStep() {
  const chosen = settings.layout.editor?.snap ?? SNAP;
  return chosen > 0 && viewProf().layoutStyle === 'grid' ? 1 : chosen;
}

export const gridShown = () => settings.layout.editor?.grid ?? false;

/** Whether the Keys tab shows the keys that are hidden in the overlay (dimmed). */
export const showHiddenKeys = () => settings.layout.editor?.showHidden ?? true;

/** How far one press of an arrow button or arrow key moves keys: the snap step, or a fine step when snapping is off. */
export const nudgeStep = () => snapStep() || FINE_STEP;

/** Round to the nearest snap step (the chosen one unless told otherwise). With snapping off the value is unchanged. */
export const snap = (v, step = snapStep()) => (step === 0 ? v : Math.round(v / step) * step);

export const round2 = (v) => Math.round(v * 100) / 100;

/** Where the layout style puts a key before the user moves it: the layout file's place, or its place in the even grid. */
export function basePosition(key, style) {
  const place = style === 'grid' ? curLayout()?.grid?.[key.code] : null;
  return place ?? { x: key.x, y: key.y };
}

/** How wide the layout style makes a key before the user resizes it: as the layout file has it, or 1 in the even grid. */
export const baseWidth = (key, style) => (style === 'grid' ? 1 : (key.w ?? 1));

/** Where a key is drawn: its saved position if the user moved it, otherwise where the layout style puts it. */
export const keyPos = (key, profile) => profile.positions[key.code] ?? basePosition(key, profile.layoutStyle);

/** How tall the layout makes a key before the user resizes it. */
export const baseHeight = (key) => key.h ?? 1;

/** How tall a key is drawn: its saved height if the user resized it, otherwise the layout's height. */
export const keyHeight = (key, profile) => profile.sizes[key.code]?.h ?? baseHeight(key);

/** How wide a key is drawn: its saved width if the user resized it, otherwise the layout style's width. */
export const keyWidth = (key, profile) => profile.sizes[key.code]?.w ?? baseWidth(key, profile.layoutStyle);

/** Save a key's position (dropping the entry when it is back where the layout style puts it). */
export function setKeyPos(key, x, y) {
  const style = styleOf(editProf());
  const base = basePosition(key, style);
  x = round2(x);
  y = round2(y);
  if (Math.abs(x - base.x) < 1e-6 && Math.abs(y - base.y) < 1e-6) delete editPositions()[key.code];
  else editPositions()[key.code] = { x, y };
  tidyProf();
}

/** Save one part ('w' or 'h') of a key's size, dropping it (and the whole entry when empty) once it is back to `base`. */
function setSize(key, part, value, base) {
  const sizes = editSizes();
  const entry = { ...sizes[key.code] };
  value = round2(value);
  if (Math.abs(value - base) < 1e-6) delete entry[part];
  else entry[part] = value;
  if (Object.keys(entry).length) sizes[key.code] = entry;
  else delete sizes[key.code];
  tidyProf();
}

/** Save a key's width (dropping it when it is back to the layout style's own width). */
export const setKeyWidth = (key, w) => setSize(key, 'w', w, baseWidth(key, styleOf(editProf())));

/** Save a key's height (dropping it when it is back to the layout's own height). */
export const setKeyHeight = (key, h) => setSize(key, 'h', h, baseHeight(key));
