// =====================================================================================================================
//  Smart guides for the key editor (docs/design/key-editor.md §4, Snap): while a key is dragged with Snap on, its left
//  or right edge sticks to another key's left or right edge when they come close, and its top edge to another key's top.
//  Plain math, no page code, so tests/ui can run it with Node. Boxes are { code, x, y, w, h } like keys-arrange.js.
//  Meant to be reused: it imports nothing and reads only x, y, w and h of each box, never what the box stands for.
// =====================================================================================================================

/** How close (in keys) an edge must come to another key's edge before it sticks to it. */
export const GUIDE_DISTANCE = 0.2;

/** The edges of the other keys that a dragged key may stick to, per axis. */
function edgesOf(others) {
  return {
    x: others.flatMap((box) => [box.x, box.x + box.w]),
    y: others.map((box) => box.y),
  };
}

/**
 * The closest edge within GUIDE_DISTANCE for one axis. `mine` lists the dragged key's own edges as offsets from its
 * position (0 = its left/top edge, its width = its right edge). Returns { position, at } or null when nothing is close.
 */
function nearestEdge(position, mine, edges) {
  let best = null;
  for (const offset of mine) {
    for (const edge of edges) {
      const distance = Math.abs(edge - (position + offset));
      if (distance > GUIDE_DISTANCE || (best && distance >= best.distance)) continue;
      best = { distance, position: edge - offset, at: edge };
    }
  }
  return best && { position: best.position, at: best.at };
}

/**
 * Where a dragged key goes when its wished-for top-left corner is (x, y): sticks to nearby edges of `others` (the
 * visible keys that are not being dragged). Returns { x, y, guideX, guideY }: guideX / guideY is the edge it stuck to,
 * for drawing the guide line, or null. An axis that sticks to nothing is returned unchanged, so the caller can snap it
 * to the grid step instead.
 */
export function snapToGuides(dragged, x, y, others) {
  const edges = edgesOf(others);
  const stickX = nearestEdge(x, [0, dragged.w], edges.x);
  const stickY = nearestEdge(y, [0], edges.y);
  return {
    x: stickX ? stickX.position : x,
    y: stickY ? stickY.position : y,
    guideX: stickX ? stickX.at : null,
    guideY: stickY ? stickY.at : null,
  };
}
