// The rules the OBS scenes card saves (ui/settings/obs-scene-rules.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowProblem, rulesToSave } from '../../ui/settings/obs-scene-rules.js';

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
