// Unit tests for the wording rules (tools/word-rules.mjs) that the docs check applies. Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordProblems } from '../../tools/word-rules.mjs';

test('British spellings and the old name are caught', () => {
  for (const line of [
    'Pick a colour',
    'the keyboard stays centred',
    'Copy the OBS link',
    'its behaviour',
    'licences',
  ]) {
    assert.equal(wordProblems(line).length, 1, line);
  }
});

test('American spelling, the right name and code names pass', () => {
  for (const line of ['Pick a color', 'Copy OBS URL', 'centredView(box)', 'result.colour', 'the secure link']) {
    assert.deepEqual(wordProblems(line), [], line);
  }
});
