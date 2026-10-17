import { registerAnimation } from '/overlay/registry.js';

// Dips on press, springs back past the resting position on release.
registerAnimation({
  id: 'bounce',
  name: 'Bounce',
  description: 'Dips, then springs back.',
  usesIntensity: true,
  apply: ({ ms, intensity }) => ({
    down: `translateY(${(5 * intensity).toFixed(1)}px) scale(${(1 - 0.05 * intensity).toFixed(3)})`,
    press: { ms: ms * 0.5, ease: 'cubic-bezier(.2,.9,.1,1)' },
    release: { ms: ms * 3, ease: 'cubic-bezier(.34,1.9,.64,1)' },
  }),
});
