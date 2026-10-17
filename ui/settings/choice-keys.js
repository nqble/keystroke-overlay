// =====================================================================================================================
//  Arrow keys in a row of choices (the segmented choice in blocks.js, and any radio-style group): plain logic, so
//  tests/ui/choice-keys.test.mjs can check it without a page.
// =====================================================================================================================

const STEPS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Which choice a key moves to, from `index` among `count` choices: the arrows step and wrap around, Home and End jump
 * to the ends. Any other key: null (the key is not ours, let it through).
 */
export function stepChoice(count, index, key) {
  if (count < 1) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (!(key in STEPS)) return null;
  return (index + STEPS[key] + count) % count;
}
