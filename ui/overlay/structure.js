// When the overlay has to rebuild its keys (used by overlay.js). Building is the costly part, so it only happens when
// something that changes how the keyboard is drawn has changed: the layout, the user's edits of it, the sizes, or the
// letters on the keys. The letters matter because they follow the person's keyboard (key labels, src-tauri/src/
// key_labels.rs): when they switch to a French keyboard the layout arrives again with other letters, and the keys must
// be redrawn. No imports, so the tests can load it on its own.

/** The letters on a layout's keys as one text, so a change of any label changes it. */
function labelsOf(layout) {
  return (layout?.keys ?? []).map((key) => key.label ?? '').join('\u0001');
}

/**
 * A text that is the same exactly while the keys would be drawn the same: `profile` is the user's edits of this layout,
 * `style` holds the sizes (keySize, gap, fontSize, scale).
 */
export function structureKey(layout, profile, style) {
  return JSON.stringify([layout?.id, profile, style.keySize, style.gap, style.fontSize, style.scale, labelsOf(layout)]);
}
