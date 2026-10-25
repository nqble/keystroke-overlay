// =====================================================================================================================
//  Which layouts the Layout tab shows and in what order (the setting layout.order; docs/design/ui-design-v2.md,
//  Layouts), as plain logic for tests/ui/layout-order.test.mjs. The same rules as src-tauri/src/layout_order.rs, which
//  the tray uses (keep the two in step: both tests have the same cases):
//    - a built-in layout shows only while its id is in the order; the others wait in New layout's Built-in;
//    - the user's own layouts always show: one missing from the order is added at the end;
//    - ids of layouts that no longer exist are skipped.
// =====================================================================================================================

/** How close to a gap between cards, in px, a dragged card counts as dropped into that gap (ui-design-v2.md). */
export const DROP_EDGE = 28;

/** The layouts to show, in order. `all` is every layout the app has (the user's own have `user: true`). */
export function shownLayouts(all, order) {
  const byId = new Map(all.map((layout) => [layout.id, layout]));
  const shown = (order ?? []).map((id) => byId.get(id)).filter(Boolean);
  const own = all.filter((layout) => layout.user && !shown.includes(layout));
  return [...shown, ...own];
}

/** The built-in layouts not shown now: the Built-in choice in the New layout popup. */
export function otherLayouts(all, order) {
  const shown = new Set(shownLayouts(all, order));
  return all.filter((layout) => !layout.user && !shown.has(layout));
}

/** The order to save after moving layout `id` into gap `gap` (0 = before the first shown card, n = after the last). */
export function moveToGap(shownIds, id, gap) {
  const from = shownIds.indexOf(id);
  if (from < 0) return shownIds;
  const without = shownIds.filter((other) => other !== id);
  const to = gap > from ? gap - 1 : gap;
  return [...without.slice(0, to), id, ...without.slice(to)];
}

/** The order to save after moving layout `id` one place left (-1) or right (+1); unchanged at either end. */
export function moveBy(shownIds, id, step) {
  const from = shownIds.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= shownIds.length) return shownIds;
  return moveToGap(shownIds, id, step > 0 ? to + 1 : to);
}

/**
 * Which gap a dragged card would drop into, from the pointer and the cards' boxes (in page order; a row's cards left to
 * right): the gap between two cards, or within DROP_EDGE px of it on either card. Over the middle of a card, or away
 * from every row: null, nothing happens.
 */
export function dropGap(x, y, boxes, edge = DROP_EDGE) {
  // the boxes' fields are read by name: a real DOMRect keeps them on its prototype, so `{ ...box }` would lose them
  const all = boxes.map((box, index) => ({
    left: box.left,
    right: box.right,
    top: box.top,
    bottom: box.bottom,
    index,
  }));
  const row = all.filter((box) => y >= box.top && y <= box.bottom);
  if (!row.length) return null;
  for (const box of row) {
    if (x < box.left) return box.index; // in the gap just before this card
    if (x > box.right) continue;
    if (x < box.left + edge) return box.index;
    if (x > box.right - edge) return box.index + 1;
    return null; // the middle of a card
  }
  return row[row.length - 1].index + 1; // after the row's last card
}
