// =====================================================================================================================
//  Where the keys of the current layout are, as the Keys tab edits them: every key with its place and size in keys, and the
//  selected ones as boxes the arrange maths (tabs/keys-arrange.js) understands.
// =====================================================================================================================
import { keyPos, keyWidth, viewProf } from '../profiles.js';
import { selectedKeys } from '../state.js';

/** Every key of the layout with its current place and size in key units: [{ key, x, y, w, h }]. */
export function placeKeys(layout, profile) {
  return layout.keys.map((key) => ({ key, ...keyPos(key, profile), w: keyWidth(key, profile), h: key.h ?? 1 }));
}

/** The selected keys as boxes: [{ code, x, y, w, h }]. */
export function selectedBoxes(layout) {
  const profile = viewProf();
  return placeKeys(layout, profile)
    .filter((item) => selectedKeys.has(item.key.code))
    .map((item) => ({ code: item.key.code, x: item.x, y: item.y, w: item.w, h: item.h }));
}
