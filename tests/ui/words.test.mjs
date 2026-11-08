// The settings window's words (ui/settings/words.js) and the language check (tools/check-locales.mjs): texts come from
// the chosen language with English for any missing one, placeholders are filled in English order even when a
// translation moves them, and the check catches a renamed text or a lost placeholder.
// Run with: node --test tests/ui/words.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeholders, useLanguage, words } from '../../ui/settings/words.js';
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
