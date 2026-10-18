// =====================================================================================================================
//  The Keys tab's note for Mac laptops: the F1-F12 row only lights up while Fn is held. Plain logic, no page code, so
//  tests/ui can run it with Node; keys.js draws it. Why: docs/MAC-PORT.md, "Seen on a real Mac".
// =====================================================================================================================

const TEXT = {
  fnHint:
    'On a Mac laptop the top row (F1 to F12) only lights up while you hold Fn. Without Fn those keys are brightness and volume keys, which macOS does not send as F keys.',
};

/** The note for this system ("windows", "macos" or "linux", from platform.rs), or null where there is none. */
export function macFnHintText(platform) {
  return platform === 'macos' ? TEXT.fnHint : null;
}
