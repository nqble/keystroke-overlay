// =====================================================================================================================
//  The release notes' sections: the one list both the app and the release check use (docs/RELEASING.md, "Release
//  notes format"). popups.js colours each section when it shows the notes; tools/changelog-section.mjs refuses a
//  CHANGELOG entry that uses another heading or the wrong order. Plain logic, so tests/ui can run it with Node.
// =====================================================================================================================

/**
 * Every section a release may have, in the order they must appear. `kind` picks the colour in popups.css
 * (.notes-new, .notes-improved, ...). To add a section: add it here, give it a colour token in settings.css, and
 * describe it in docs/RELEASING.md.
 */
export const NOTE_SECTIONS = [
  { kind: 'new', icon: '✨', name: 'New' },
  { kind: 'improved', icon: '🛠', name: 'Improved' },
  { kind: 'fixed', icon: '🐛', name: 'Fixed' },
  { kind: 'perf', icon: '⚡', name: 'Performance' },
  { kind: 'hood', icon: '🧰', name: 'Under the hood' },
];

// Emoji may carry an invisible "show as colour emoji" mark (U+FE0F) or not; both mean the same icon.
const plain = (text) => text.replace(/️/g, '').trim();

/**
 * Which section a heading names, or null. "⚡ Performance — v1.3.0 vs v1.2.1" is Performance: anything after
 * " — " is a free note.
 */
export function sectionOf(headingText) {
  const [name] = plain(headingText).split(' — ');
  return NOTE_SECTIONS.find((section) => `${section.icon} ${section.name}` === name.trim()) ?? null;
}

/**
 * The heading text if this line is a section heading, else null. Accepts "### ✨ New" (the format from v1.4.0) and the
 * older bold line "**✨ New**" that published releases up to v1.3.0 use, so their notes are coloured too.
 */
export function headingOf(line) {
  const markdownHeading = /^#{1,6}\s+(.*)$/.exec(line.trim());
  if (markdownHeading) return markdownHeading[1];
  const boldLine = /^\*\*([^*]+)\*\*$/.exec(line.trim());
  if (boldLine && sectionOf(boldLine[1])) return boldLine[1];
  return null;
}

/** What is wrong with one CHANGELOG entry's sections (empty = fine). Used by the release check. */
export function sectionProblems(entryBody) {
  const problems = [];
  let lastIndex = -1;
  for (const line of entryBody.replace(/\r/g, '').split('\n')) {
    const heading = headingOf(line);
    if (heading === null) continue;
    const section = sectionOf(heading);
    if (!section) {
      problems.push(`unknown section "${heading}"`);
      continue;
    }
    if (!/^#{3}\s/.test(line.trim())) problems.push(`write "${heading}" as a heading: ### ${heading}`);
    const index = NOTE_SECTIONS.indexOf(section);
    if (index === lastIndex) problems.push(`"${section.name}" appears twice`);
    else if (index < lastIndex) problems.push(`"${section.name}" must come before "${NOTE_SECTIONS[lastIndex].name}"`);
    lastIndex = Math.max(lastIndex, index);
  }
  return problems;
}
