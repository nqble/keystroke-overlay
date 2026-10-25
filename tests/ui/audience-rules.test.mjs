// Unit tests for the "written for everyone" rules (tools/audience-rules.mjs) that the docs check applies.
// Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audienceProblems } from '../../tools/audience-rules.mjs';

test('text addressed to one setup is caught, with what to write instead', () => {
  for (const line of [
    'Ask Jordan before pushing',
    '/home/jordan/.config',
    'the Advisory session owns this',
    'queue it with the master session',
    'measured by the Mac session',
    'built on `advisor/obs-scenes`',
    'see docs/for-claude/proposals/x.md',
    'mockups: https://claude.ai/artifact/abc123',
  ]) {
    const problems = audienceProblems(line);
    assert.equal(problems.length, 1, line);
    assert.match(problems[0], /\(write .+\)$/, line);
  }
});

test('ordinary text passes', () => {
  for (const line of [
    'Ask the maintainer before pushing',
    'a Claude session on a Mac',
    'the main branch and origin/main',
    'the mac/ folder',
    'src/keyboard/mac/hook.rs',
    'docs/proposals/mouse-input.md',
    'a session cookie',
  ]) {
    assert.deepEqual(audienceProblems(line), [], line);
  }
});

test('a link to an old commit may name the old notes folder', () => {
  const line = 'the plan (https://github.com/nqble/keystroke-overlay/blob/9f1ac68/docs/for-claude/proposals/done/x.md)';
  assert.deepEqual(audienceProblems(line), []);
});

test('a skipped rule is not reported', () => {
  assert.deepEqual(audienceProblems('© 2026 Jordan Phoutthavone', ['name']), []);
});
