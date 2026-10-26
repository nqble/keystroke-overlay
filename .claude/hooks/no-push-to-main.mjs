// A Claude Code hook (turned on in .claude/settings.json): refuses `git push` to main and any force push, which CLAUDE.md
// section 7 says need the maintainer's own word. Work reaches main through a pull request the maintainer merges.
// Only for this repository: the private notes vault pushes to its own main on purpose, so this never goes in user
// settings. Tests: tests/ui/claude-hooks.test.mjs.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PROTECTED = 'main';

/** Why this push command must not run, or null when it may. `currentBranch` is the branch checked out now. */
export function pushProblem(command, currentBranch) {
  const push = /\bgit\b[^|;&]*\bpush\b([^|;&]*)/.exec(command);
  if (!push) return null;
  const words = push[1].trim().split(/\s+/).filter(Boolean);
  if (
    words.some((word) => /^(--force(-with-lease)?(=.*)?|-f|--mirror|--delete|-d)$/.test(word) || /^-[a-z]*f/.test(word))
  ) {
    return "Force pushes, mirror pushes and branch deletions need the maintainer's own word (CLAUDE.md section 7).";
  }
  const refs = words.filter((word) => !word.startsWith('-')).slice(1); // the first plain word is the remote
  const targets = refs.map((ref) => ref.replace(/^\+/, '').split(':').pop());
  const pushesMain = targets.length
    ? targets.includes(PROTECTED) || refs.some((ref) => ref.startsWith('+'))
    : currentBranch === PROTECTED;
  if (!pushesMain) return null;
  return `Pushing to ${PROTECTED} needs the maintainer's own word (CLAUDE.md section 7): push a work branch and open a pull request.`;
}

function currentBranch() {
  try {
    return execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  const problem = event.tool_name === 'Bash' ? pushProblem(event.tool_input?.command ?? '', currentBranch()) : null;
  if (problem) {
    process.stderr.write(problem + '\n');
    process.exit(2); // exit code 2 blocks the tool call and shows the message to the session
  }
}
