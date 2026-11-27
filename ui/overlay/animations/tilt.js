import { registerAnimation } from '/overlay/registry.js';

// Tips to one side on press, like a key rocking on its switch. Only transform and the glow's opacity change.
// Copy this file to make your own animation (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerAnimation({
  id: 'tilt',
  name: 'Tilt',
  description: 'Tips to one side.',
  usesIntensity: true,
  apply: ({ ms, intensity }) => ({
    down: `rotate(${(-6 * intensity).toFixed(1)}deg) translateY(${(2 * intensity).toFixed(1)}px)`,
    press: { ms: ms * 0.6, ease: 'cubic-bezier(.2,.9,.1,1)' },
    release: { ms: ms * 2, ease: 'cubic-bezier(.34,1.56,.64,1)' },
  }),
});
