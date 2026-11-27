import { registerAnimation } from '/overlay/registry.js';

// Glows and grows slightly at once: a softer, brighter press than Glow alone. Only transform and the glow's opacity change.
// Copy this file to make your own animation (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerAnimation({
  id: 'pulse',
  name: 'Pulse',
  description: 'Glows and grows a little.',
  usesIntensity: true,
  apply: ({ ms, intensity }) => ({
    down: `scale(${(1 + 0.04 * intensity).toFixed(3)})`,
    glow: 1,
    press: { ms: ms * 0.7, ease: 'cubic-bezier(.16,1,.3,1)' },
    release: { ms: ms * 2.4, ease: 'cubic-bezier(.4,0,.2,1)' },
  }),
});
