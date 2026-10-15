import { registerAnimation } from '/overlay/registry.js';

// No animation: state changes instantly.
registerAnimation({
  id: 'none',
  name: 'None',
  apply: () => ({ press: { ms: 0, ease: 'linear' }, release: { ms: 0, ease: 'linear' } }),
});
