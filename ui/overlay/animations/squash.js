import { registerAnimation } from '/overlay/registry.js';

// Squashes flat from the bottom on press, then springs back to its height. Only transform and the glow's opacity change.
// Copy this file to make your own animation (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerAnimation({
  id: 'squash',
  name: 'Squash',
  description: 'Squashes flat, then springs back.',
  usesIntensity: true,
  apply: ({ ms, intensity }) => ({
    down: `translateY(${(3 * intensity).toFixed(1)}px) scaleY(${(1 - 0.15 * intensity).toFixed(3)})`,
    press: { ms: ms * 0.5, ease: 'cubic-bezier(.2,.9,.1,1)' },
    release: { ms: ms * 2, ease: 'cubic-bezier(.16,1,.3,1)' },
  }),
});
