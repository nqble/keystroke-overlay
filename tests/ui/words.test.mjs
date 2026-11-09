// The settings window's words (ui/settings/words.js) and the language check (tools/check-locales.mjs): texts come from
// the chosen language with English for any missing one, placeholders are filled in English order even when a
// translation moves them, and the check catches a renamed text or a lost placeholder.
// Run with: node --test tests/ui/words.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLanguage, placeholders, useLanguage, words } from '../../ui/settings/words.js';
import { flatten, problemsOf } from '../../tools/check-locales.mjs';
import english from '../../ui/settings/locales/en.js';

test('a group gives its English texts, nested groups included', () => {
  const texts = words('pauseButton');
  assert.equal(texts.pauseWord, 'Pause');
  assert.equal(words('eyeButton').show.mouse, 'Show the mouse');
});

test('a text with placeholders is a function filled in English order', () => {
  assert.equal(words('messages').downloadingOf('1 MB', '4 MB', 25), 'Downloading… 1 MB of 4 MB (25%)');
  assert.equal(
    words('shared').layoutLimitReached(20),
    'You have 20 layouts, the most allowed. Delete one to add another.',
  );
});

test('a translation may move placeholders; missing texts stay English', () => {
  useLanguage({ messages: { downloadingOf: '{percent} % — {done} / {total}' } });
  try {
    const texts = words('messages');
    assert.equal(texts.downloadingOf('1 MB', '4 MB', 25), '25 % — 1 MB / 4 MB');
    assert.equal(texts.installing, 'Installing… the app will restart.');
  } finally {
    useLanguage(null);
  }
});

test('an unknown group is a mistake, not silence', () => {
  assert.throws(() => words('noSuchGroup'), /No texts for "noSuchGroup"/);
});

test('placeholders are listed once, in order', () => {
  assert.deepEqual(placeholders('{a} and {b}, then {a}'), ['a', 'b']);
});

test('the language check catches renamed texts, lost placeholders and non-texts', () => {
  const source = flatten(english);
  const language = flatten({
    messages: { downloading: 'Téléchargement…', installing: 'Installation…' },
    header: { gone: 'x' },
    pauseButton: { pauseWord: 3 },
  });
  const problems = problemsOf(source, language);
  assert.ok(problems.some((p) => p.startsWith('messages.downloading: placeholders')));
  assert.ok(problems.some((p) => p.startsWith('header.gone: not in English')));
  assert.ok(problems.some((p) => p.startsWith('pauseButton.pauseWord: not a text')));
  assert.equal(problems.length, 3);
});

test('a plural text picks its form by count, "none" for 0 when given', () => {
  const count = words('generalObsScenes').count;
  assert.equal(count(0), 'No scenes yet');
  assert.equal(count(1), '1 scene set');
  assert.equal(count(3), '3 scenes set');
});

test('a language uses its own plural forms (Polish has "few" and "many")', () => {
  useLanguage(
    {
      generalObsScenes: {
        count: {
          none: 'Brak scen',
          one: '1 scena',
          few: '{count} sceny',
          many: '{count} scen',
          other: '{count} sceny',
        },
      },
    },
    'pl',
  );
  try {
    const count = words('generalObsScenes').count;
    assert.equal(count(0), 'Brak scen');
    assert.equal(count(3), '3 sceny');
    assert.equal(count(5), '5 scen');
  } finally {
    useLanguage(null);
  }
});

test('the language check knows plural forms', () => {
  const source = flatten(english);
  const ok = flatten({ generalObsScenes: { count: { one: '1 scena', few: '{count} sceny', other: '{count} scen' } } });
  assert.deepEqual(problemsOf(source, ok), []);
  const bad = flatten({ generalObsScenes: { count: { one: '1', lots: 'x', other: '{total}' } } });
  const problems = problemsOf(source, bad);
  assert.ok(problems.some((p) => p.includes('count.lots: not a plural form')));
  assert.ok(problems.some((p) => p.includes('count.other: unknown placeholder')));
  assert.ok(
    problemsOf(source, flatten({ generalObsScenes: { count: 'just text' } }))[0].includes('needs plural forms'),
  );
});

test('the layout import messages read as before they moved to the language file', () => {
  const layoutWords = words('layout');
  assert.equal(layoutWords.imported(1), 'Imported 1 layout');
  assert.equal(layoutWords.importedSkipped(3, 2), 'Imported 3 layouts, skipped 2');
  assert.equal(
    layoutWords.nothingImportedSkipped(2, 20),
    'Nothing imported (2 skipped: empty, or the 20-layout limit)',
  );
  assert.equal(layoutWords.exported(2), 'Exported 2 layouts');
  assert.equal(layoutWords.count(4, 20), 'Your layouts: 4 / 20');
});

test('every control in controls.js has its label in the language file', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../ui/settings/controls.js', import.meta.url), 'utf8');
  const named = [...source.matchAll(/label: WORDS\.labels\.(\w+)/g)].map((match) => match[1]);
  const controlCount = [...source.matchAll(/path: '/g)].length;
  assert.equal(named.length, controlCount, 'each control names its label as WORDS.labels.<name>');
  const missing = named.filter((name) => typeof english.controls.labels[name] !== 'string');
  assert.deepEqual(missing, []);
});

test('the saved language wins when there is a file for it', () => {
  assert.equal(pickLanguage('de', ['de', 'en', 'fr'], ['fr-FR']), 'de');
  assert.equal(pickLanguage('it', ['de', 'en'], ['de-DE']), 'de', 'a choice with no file falls back to the computer');
});

test('"Same as this computer" finds the closest file, in the order the computer lists its languages', () => {
  const files = ['de', 'en', 'pt-BR', 'zh-Hans'];
  assert.equal(pickLanguage('', files, ['pt-BR', 'de']), 'pt-BR', 'the same code');
  assert.equal(pickLanguage('', files, ['de-AT']), 'de', 'the language without its region');
  assert.equal(pickLanguage('', files, ['pt-PT']), 'pt-BR', 'the language in another region');
  assert.equal(pickLanguage('', files, ['ko', 'de']), 'de', 'the first language that has a file');
  assert.equal(pickLanguage('', files, ['ko']), 'en', 'English when nothing fits');
  assert.equal(pickLanguage('', ['en'], []), 'en');
});
