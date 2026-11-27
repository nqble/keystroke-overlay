import { registerAnimation } from '/overlay/registry.js';

// Wobbles wide and short on press and overshoots on release, like jelly. Only transform and the glow's opacity change.
// Copy this file to make your own animation (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerAnimation({
  id: 'jelly',
  name: 'Jelly',
  description: 'Wobbles like jelly.',
  usesIntensity: true,
  apply: ({ ms, intensity }) => ({
    down: `scale(${(1 + 0.08 * intensity).toFixed(3)}, ${(1 - 0.1 * intensity).toFixed(3)})`,
    press: { ms: ms * 0.6, ease: 'cubic-bezier(.2,.9,.1,1)' },
    release: { ms: ms * 3, ease: 'cubic-bezier(.34,2.2,.64,1)' },
  }),
});
