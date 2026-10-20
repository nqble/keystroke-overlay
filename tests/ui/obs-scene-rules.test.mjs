// The rules the OBS scenes card saves (ui/settings/obs-scene-rules.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HIDE_CHOICE, choiceOf, ruleFromChoice, rowProblem, rulesToSave } from '../../ui/settings/obs-scene-rules.js';

const rows = [
  { scene: '  Chat ', show: false, layout: '' },
  { scene: '', show: true, layout: '' },
  { scene: 'CHAT', show: true, layout: 'full' },
  { scene: 'Coding', show: true, layout: 'full' },
];

test('blank names and repeats are not saved; names are trimmed', () => {
  assert.deepEqual(rulesToSave(rows), [
    { scene: 'Chat', show: false, layout: '' },
    { scene: 'Coding', show: true, layout: 'full' },
  ]);
});

test('each row says why it would not be saved', () => {
  assert.deepEqual(
    rows.map((_, index) => rowProblem(rows, index)),
    ['', 'empty', 'repeat', ''],
  );
});

test('the "In this scene" menu value and the rule fields turn into each other', () => {
  const cases = [
    [{ show: false, layout: '' }, HIDE_CHOICE],
    [{ show: true, layout: '' }, ''],
    [{ show: true, layout: 'wasd' }, 'wasd'],
  ];
  for (const [rule, choice] of cases) {
    assert.equal(choiceOf(rule), choice);
    assert.deepEqual(ruleFromChoice(choice), rule);
  }
  // a hidden rule keeps no layout, so the menu never shows a stale one
  assert.equal(choiceOf({ show: false, layout: 'wasd' }), HIDE_CHOICE);
});
