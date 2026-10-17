import { registerAnimation } from '/overlay/registry.js';

// No animation: state changes instantly.
// Copy this file to make your own animation (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerAnimation({
  id: 'none',
  name: 'None',
  description: 'Changes at once.',
  apply: () => ({ press: { ms: 0, ease: 'linear' }, release: { ms: 0, ease: 'linear' } }),
});
