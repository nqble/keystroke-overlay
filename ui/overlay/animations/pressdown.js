import { registerAnimation } from '/overlay/registry.js';

// Key sinks slightly when pressed.
registerAnimation({
  id: 'pressdown',
  name: 'Press down',
  description: 'Sinks a little.',
  usesIntensity: true,
  apply: ({ ms, intensity }) => ({
    down: `translateY(${(4 * intensity).toFixed(1)}px) scale(${(1 - 0.03 * intensity).toFixed(3)})`,
    press: { ms: ms * 0.6, ease: 'cubic-bezier(.2,.9,.1,1)' },
    release: { ms, ease: 'cubic-bezier(.16,1,.3,1)' },
  }),
});
