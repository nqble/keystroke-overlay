import { registerAnimation } from '/overlay/registry.js';

// Instant light-up, slow fade-out (nice for showing recent keys).
// Copy this file to make your own animation (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerAnimation({
  id: 'fade',
  name: 'Fade',
  description: 'Lights up at once, fades out slowly.',
  apply: ({ ms }) => ({
    press: { ms: Math.min(40, ms * 0.3), ease: 'linear' },
    release: { ms: ms * 4, ease: 'cubic-bezier(.4,0,.2,1)' },
  }),
});
