import { registerAnimation } from '/overlay/registry.js';

// Instant light-up, slow fade-out (nice for showing recent keys).
registerAnimation({
  id: 'fade',
  name: 'Fade',
  description: 'Lights up at once, fades out slowly.',
  apply: ({ ms }) => ({
    press: { ms: Math.min(40, ms * 0.3), ease: 'linear' },
    release: { ms: ms * 4, ease: 'cubic-bezier(.4,0,.2,1)' },
  }),
});
