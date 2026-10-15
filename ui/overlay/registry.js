// Plugin registries. Modules in animations/ and themes/ import these helpers
// and register themselves; the overlay auto-loads every file in those folders.
//
//   registerAnimation({ id, name, apply(opts) -> AnimationSpec })
//   registerTheme({ id, name, style: {...}, animation: {...} })
//   registerEasing({ id, name, css })
//
// AnimationSpec (all fields optional):
//   down      CSS transform of a pressed key        e.g. 'translateY(3px)'
//   idle      CSS transform of a released key       (default 'none')
//   glow      0..1 opacity of the glow layer when pressed
//   press     { ms, ease }  timing while pressing
//   release   { ms, ease }  timing while releasing
// Only transform + opacity are ever animated, so everything stays on the GPU.

export const animations = new Map();
export const themes = new Map();
export const easings = new Map();

export const registerAnimation = (a) => animations.set(a.id, a);
export const registerTheme = (t) => themes.set(t.id, t);
export const registerEasing = (e) => easings.set(e.id, e);

registerEasing({ id: 'linear', name: 'Linear', css: 'linear' });
registerEasing({ id: 'ease-out', name: 'Ease out', css: 'cubic-bezier(.16,1,.3,1)' });
registerEasing({ id: 'ease-in-out', name: 'Ease in-out', css: 'cubic-bezier(.65,0,.35,1)' });
registerEasing({ id: 'snappy', name: 'Snappy', css: 'cubic-bezier(.2,.9,.1,1)' });
registerEasing({ id: 'overshoot', name: 'Overshoot', css: 'cubic-bezier(.34,1.56,.64,1)' });
