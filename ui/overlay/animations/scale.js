import { registerAnimation } from '/overlay/registry.js';

// Key pops bigger while held.
// Copy this file to make your own animation (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerAnimation({
  id: 'scale',
  name: 'Scale up',
  apply: ({ ms, intensity }) => ({
    down: `scale(${(1 + 0.12 * intensity).toFixed(3)})`,
    press: { ms: ms * 0.7, ease: 'cubic-bezier(.34,1.4,.64,1)' },
    release: { ms, ease: 'cubic-bezier(.16,1,.3,1)' },
  }),
});
