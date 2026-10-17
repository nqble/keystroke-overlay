import { registerAnimation } from '/overlay/registry.js';

// Pressed colour plus a soft glow halo that fades in/out.
registerAnimation({
  id: 'glow',
  name: 'Glow',
  description: 'A soft glow around the key.',
  apply: ({ ms }) => ({
    glow: 1,
    press: { ms: ms * 0.7, ease: 'cubic-bezier(.16,1,.3,1)' },
    release: { ms: ms * 2.2, ease: 'cubic-bezier(.4,0,.2,1)' },
  }),
});
