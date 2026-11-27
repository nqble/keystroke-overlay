import { registerAnimation } from '/overlay/registry.js';

// Grows a little on press, as if popping out of the board. Only transform and the glow's opacity change.
// Copy this file to make your own animation (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerAnimation({
  id: 'pop',
  name: 'Pop',
  description: 'Pops out a little.',
  usesIntensity: true,
  apply: ({ ms, intensity }) => ({
    down: `scale(${(1 + 0.08 * intensity).toFixed(3)})`,
    press: { ms: ms * 0.6, ease: 'cubic-bezier(.34,1.56,.64,1)' },
    release: { ms: ms * 1.6, ease: 'cubic-bezier(.16,1,.3,1)' },
  }),
});
