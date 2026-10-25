// The "written for everyone" rules (decision 0014): text in the repository is read by users, contributors and their
// Claude sessions, so it never speaks to the maintainer's own setup. tools/check-docs.mjs applies these to the docs and
// to every tracked text file; the reasons and the words to use are in docs/DOCS-STYLE.md, "Who you're writing for".

// A link to one old commit of a file is history, not a live path, so it may name the old docs/for-claude/ folder.
const HISTORY_LINK = /github\.com\/[\w.-]+\/[\w.-]+\/blob\/[0-9a-f]{7,40}\/docs\/for-claude\/\S*/g;

// Each rule: an id (used by the exemptions in check-docs.mjs), what it finds, and what to write instead.
export const AUDIENCE_RULES = [
  { id: 'name', pattern: /\b(?:jordan|phoutthavone)\b/i, instead: '"the maintainer"' },
  {
    id: 'session',
    pattern: /\b(?:advisory|master|mac) sessions?\b/i,
    instead: '"a Claude session", or say what the work is',
  },
  {
    id: 'branch',
    pattern: /(?<![\w/.-])(?:advisor|master|mac)\/[\w.-]+/,
    instead: '"a work branch", or link the pull request',
  },
  { id: 'notes-folder', pattern: /docs\/for-claude\//, instead: 'docs/proposals/, or a link to an old commit' },
  {
    id: 'private-link',
    pattern: /claude\.ai\/(?:code\/)?artifact\//,
    instead: 'a file in the repository, or an issue (only you can open that link)',
  },
];

// Returns the problems on one line as `"<found>" (write <instead>)`, skipping the rules listed in `skip`.
export function audienceProblems(line, skip = []) {
  const text = line.replace(HISTORY_LINK, '');
  const problems = [];
  for (const rule of AUDIENCE_RULES) {
    if (skip.includes(rule.id)) continue;
    const match = text.match(rule.pattern);
    if (match) problems.push(`"${match[0]}" is written for one setup (write ${rule.instead})`);
  }
  return problems;
}
