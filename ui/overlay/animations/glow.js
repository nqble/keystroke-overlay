import { registerAnimation } from '/overlay/registry.js';

// Pressed colour plus a soft glow halo that fades in/out.
// Copy this file to make your own animation (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerAnimation({
  id: 'glow',
  name: 'Glow',
  apply: ({ ms }) => ({
    glow: 1,
    press: { ms: ms * 0.7, ease: 'cubic-bezier(.16,1,.3,1)' },
    release: { ms: ms * 2.2, ease: 'cubic-bezier(.4,0,.2,1)' },
  }),
});
