// =====================================================================================================================
//  Where the keys of the current layout are, as the Keys tab edits them: every key with its place and size in keys, and the
//  selected ones as boxes the arrange maths (tabs/keys-arrange.js) understands.
// =====================================================================================================================
import { keyAngle, keyHeight, keyPos, keyWidth, viewProf } from '../profiles.js';
import { selectedKeys } from '../state.js';
import { boardFrame, evenGridBoxes } from '../tabs/keys-board.js';
import { turnedBounds } from '../tabs/keys-turn.js';

/** Every key of the layout with its current place and size in key units, and its angle: [{ key, x, y, w, h, r }]. */
export function placeKeys(layout, profile) {
  return layout.keys.map((key) => ({
    key,
    ...keyPos(key, profile),
    w: keyWidth(key, profile),
    h: keyHeight(key, profile),
    r: keyAngle(key, profile),
  }));
}

/** The layout's keys as the layout style puts them before any edit: [{ code, x, y, w, h }]. */
export function layoutBoxesFor(layout, profile) {
  return profile.layoutStyle === 'grid'
    ? evenGridBoxes(layout)
    : layout.keys.map((key) => ({ code: key.code, x: key.x, y: key.y, w: key.w ?? 1, h: key.h ?? 1 }));
}

/** The keys as they are now, as the upright boxes they cover (a turned key covers more): [{ code, x, y, w, h }]. */
export const placedBoxesFor = (layout, profile) => placeKeys(layout, profile).map((item) => coveredBox(item));

/** A placed key as a box with its angle, for the overlap warning: { code, x, y, w, h, r }. */
export const turnedBox = (item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h, r: item.r });

/** The upright box a placed key covers on the board: the key itself, or more when it is turned (keys-turn.js). */
export const coveredBox = (item) =>
  turnedBounds({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h, r: item.r });

/** The board for the layout: { w, h, originX, originY } in keys (a key's board place is its saved place plus the origin). */
export const boardFor = (layout, profile) =>
  boardFrame(layoutBoxesFor(layout, profile), placedBoxesFor(layout, profile));

/** The selected keys as boxes: [{ code, x, y, w, h }]. */
export function selectedBoxes(layout) {
  const profile = viewProf();
  return placeKeys(layout, profile)
    .filter((item) => selectedKeys.has(item.key.code))
    .map((item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h }));
}
