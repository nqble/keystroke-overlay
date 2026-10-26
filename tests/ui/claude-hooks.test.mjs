// Unit tests for the two Claude Code hooks in .claude/hooks/ (turned on in .claude/settings.json): the commit-message
// format and no pushes to main. Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitProblem } from '../../.claude/hooks/commit-format.mjs';
import { pushProblem } from '../../.claude/hooks/no-push-to-main.mjs';

test('a commit in the CLAUDE.md format passes, with or without a scope or a body', () => {
  for (const command of [
    'git commit -m "fix(keys): close gaps fills the holes hidden keys leave in a row"',
    "git add -A && git commit -qm 'docs: one line'",
    'git -c user.name=x commit -qm "feat(settings)!: a breaking change" -m "why it breaks"',
    'git commit -m "$(cat <<\'EOF\'\nchore(release): version 2.0.1\n\nbody\nEOF\n)"',
    'git commit -m "Revert \\"docs: x\\""',
    'git commit --no-edit',
    'git commit',
    'git status',
  ]) {
    assert.equal(commitProblem(command), null, command);
  }
});

test('a commit outside the format is refused, with what to write instead', () => {
  for (const command of [
    'git commit -m "Fixed the drag bug"',
    'git commit -m "fix: Capitalized summary"',
    'git commit -m "fix: ends with a full stop."',
    'git commit -m "feature(keys): wrong type"',
    'git commit -m "fix keys: no colon after the type"',
  ]) {
    assert.match(commitProblem(command) ?? '', /type\(scope\): summary/, command);
  }
});

test('pushing a work branch passes, wherever you are', () => {
  for (const [command, branch] of [
    ['git push -u origin fix/drag-cards', 'fix/drag-cards'],
    ['git push -q origin fix/drag-cards', 'main'],
    ['git push', 'fix/drag-cards'],
    ['git push origin HEAD:refs/heads/fix/x', 'main'],
    ['git pull origin main', 'main'],
  ]) {
    assert.equal(pushProblem(command, branch), null, command);
  }
});

test('pushing to main, or forcing anything, is refused', () => {
  for (const [command, branch] of [
    ['git push origin main', 'fix/x'],
    ['git push', 'main'],
    ['git push -u origin HEAD:main', 'fix/x'],
    ['git push origin +fix/x', 'fix/x'],
    ['git push --force origin fix/x', 'fix/x'],
    ['git push -f origin fix/x', 'fix/x'],
    ['git push --force-with-lease origin fix/x', 'fix/x'],
    ['git push origin --delete fix/x', 'main'],
    ['cd repo && git push origin main', 'fix/x'],
  ]) {
    assert.match(pushProblem(command, branch) ?? '', /maintainer's own word/, command);
  }
});

test('the hooks are turned on in .claude/settings.json, so a forgotten line is caught', async () => {
  const { readFileSync } = await import('node:fs');
  const settings = JSON.parse(readFileSync(new URL('../../.claude/settings.json', import.meta.url), 'utf8'));
  const commands = settings.hooks.PreToolUse.flatMap((entry) => entry.hooks.map((hook) => hook.command)).join(' ');
  for (const hook of ['commit-format.mjs', 'no-push-to-main.mjs']) assert.ok(commands.includes(hook), hook);
});
