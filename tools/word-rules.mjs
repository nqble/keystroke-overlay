// The wording rules in docs/DOCS-STYLE.md that a script can check: American spelling, and one name for each thing.
// tools/check-docs.mjs applies them to the docs and to the settings window's text; tests/ui/word-rules.test.mjs checks
// each rule. A new rule is one more line in RULES.

// A word counts only where it is not part of a code name: no letter, digit, dot or $ just before it, and no letter,
// digit or opening bracket just after it (so centredView, result.colour and colour() are left alone).
const word = (core, flags = 'i') => new RegExp(`(?<![\\w.$])(?:${core})(?![\\w(])`, flags);

/** [what is not allowed, what to write instead]. */
export const RULES = [
  [word(String.raw`OBS link(s)?`, ''), 'OBS URL'],
  [word(String.raw`colour(ed|s)?`), 'color'],
  [word(String.raw`centre[sd]?`), 'center'],
  [word(String.raw`behaviours?`), 'behavior'],
  [word(String.raw`licences?`), 'license'],
  [word(String.raw`grey(ed)?`), 'gray'],
  [word(String.raw`cancelled`), 'canceled'],
  [word(String.raw`labelled`), 'labeled'],
  [word(String.raw`neighbour(s|ing)?`), 'neighbor'],
  [
    word(String.raw`(summari|customi|sanit|organi|optimi|recogni|initiali|normali|priorit)s(e|ed|es|ing|er|ers|ation)`),
    '-ize',
  ],
  [word(String.raw`favourites?`), 'favorite'],
];

/** The problems in one line of text, as "found → write" strings (none when the line follows every rule). */
export function wordProblems(line) {
  const found = [];
  for (const [pattern, instead] of RULES) {
    const match = line.match(pattern);
    if (match) found.push(`"${match[0]}" (write ${instead})`);
  }
  return found;
}
