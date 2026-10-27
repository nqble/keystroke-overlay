// A Claude Code hook (turned on in .claude/settings.json): refuses a `git commit` whose message doesn't follow CLAUDE.md
// section 7, `type(scope): summary`. Git's own "Merge ..." and "Revert ..." messages pass. A message it can't read
// (an editor, a file) passes too: the hook only catches the common mistake, it isn't a full parser.
// Tests: tests/ui/claude-hooks.test.mjs.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TYPES = ['feat', 'fix', 'perf', 'refactor', 'test', 'docs', 'style', 'build', 'ci', 'chore']; // CLAUDE.md section 7
const SUBJECT = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9./-]+\\))?!?: [^A-Z].*[^.]$`);
const GIT_OWN = /^(Merge|Revert) /;

/** The first line of the message in a `git commit` command, or null when the command has none we can read. */
export function commitSubject(command) {
  const commit = /\bgit\b[^|;&]*\bcommit\b/.exec(command);
  if (!commit) return null;
  // Only what comes after `git commit` can be its message: a script earlier in the same command (a heredoc fed to
  // python, say) must not be read as one.
  const rest = command.slice(commit.index);
  const heredoc = /<<-?\s*'?(\w+)'?\n([\s\S]*?)\n\1/.exec(rest);
  if (heredoc) return heredoc[2].split('\n')[0].trim();
  const quoted = /(?:\s-[a-zA-Z]*m|\s--message)[=\s]+(["'])([\s\S]*?)\1/.exec(rest); // -m, or -qm and the like
  if (!quoted || quoted[2].startsWith('$(')) return null;
  return quoted[2].split('\n')[0].trim();
}

/** Why this commit command must not run, or null when it may. */
export function commitProblem(command) {
  const subject = commitSubject(command);
  if (subject === null || GIT_OWN.test(subject) || SUBJECT.test(subject)) return null;
  return (
    `Commit message "${subject}" doesn't follow CLAUDE.md section 7: write \`type(scope): summary\` in lower case, ` +
    `no full stop, with type one of ${TYPES.join(', ')} (and \`!\` for a breaking change).`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  const problem = event.tool_name === 'Bash' ? commitProblem(event.tool_input?.command ?? '') : null;
  if (problem) {
    process.stderr.write(problem + '\n');
    process.exit(2); // exit code 2 blocks the tool call and shows the message to the session
  }
}
