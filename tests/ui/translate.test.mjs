// The network-free parts of `npm run translate` (tools/translate-text.mjs): placeholders survive a service, only new or
// changed English is sent, reviewed texts never are, plural forms follow the language, and the glossary is read.
// Run with: node --test tests/ui/translate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  back,
  completePlurals,
  fingerprint,
  flatTexts,
  glossaryFromTbx,
  languageFile,
  nest,
  protect,
  sameMarks,
  sourceTexts,
  termsIn,
  toTranslate,
} from '../../tools/translate-text.mjs';

test('placeholders go out as ⟦n⟧ and come back as their names, even moved', () => {
  const { sent, names } = protect('Imported {count} layouts, skipped {skipped}');
  assert.equal(sent, 'Imported ⟦0⟧ layouts, skipped ⟦1⟧');
  assert.equal(back('⟦1⟧ übersprungen, ⟦0⟧ importiert', names), '{skipped} übersprungen, {count} importiert');
});

test('a lost or made-up placeholder makes the translation unusable', () => {
  const { names } = protect('Delete {name}?');
  assert.equal(back('Löschen?', names), null);
  assert.equal(back('⟦0⟧ ⟦1⟧ löschen?', names), null);
});

test('bold marks must come back as often as they went', () => {
  assert.equal(sameMarks('**Off:** any program', '**Aus:** jedes Programm'), true);
  assert.equal(sameMarks('**Off:** any program', '**Aus: jedes Programm'), false);
});

test('plural texts become one text per form the language uses', () => {
  const english = { scenes: { count: { none: 'No scenes', one: '1 scene', other: '{count} scenes' } } };
  assert.deepEqual(
    [...sourceTexts(english, 'de')],
    [
      ['scenes.count.none', 'No scenes'],
      ['scenes.count.one', '1 scene'],
      ['scenes.count.other', '{count} scenes'],
    ],
  );
  assert.deepEqual([...sourceTexts(english, 'ja').keys()], ['scenes.count.none', 'scenes.count.other']);
});

test('only new or changed English is sent, and never a reviewed text', () => {
  const sources = new Map([
    ['a', 'Same'],
    ['b', 'Changed now'],
    ['c', 'New'],
    ['d', 'Changed, but a person fixed it'],
  ]);
  const done = new Map([
    ['a', 'Gleich'],
    ['b', 'Alt'],
    ['d', 'Von Hand'],
  ]);
  const made = { reviewed: ['d'], sources: { a: fingerprint('Same'), b: fingerprint('Changed before'), d: 'x' } };
  assert.deepEqual(toTranslate(sources, done, made), ['b', 'c']);
});

test('a written language file loads back into the same texts, in English order', async () => {
  const flat = new Map([
    ['shared.save', 'Speichern'],
    ['scenes.count.other', '{count} Szenen'],
  ]);
  const texts = nest(flat, ['scenes.count.other', 'shared.save', 'shared.missing']);
  assert.deepEqual(Object.keys(texts), ['scenes', 'shared']);
  const source = languageFile(texts, { engine: 'deepl', reviewed: [], sources: {} });
  const module = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  assert.deepEqual(flatTexts(module.default), new Map([...flat].reverse()));
  assert.equal(module.made.engine, 'deepl');
});

test('the glossary reads a TBX file and keeps only terms the texts use', () => {
  const tbx = `<martif><text><body>
    <termEntry id="1"><langSet xml:lang="en-US"><ntig><termGrp><term>settings</term></termGrp></ntig></langSet>
      <langSet xml:lang="de-de"><ntig><termGrp><term>Einstellungen</term></termGrp></ntig></langSet></termEntry>
    <termEntry id="2"><langSet xml:lang="en-US"><ntig><termGrp><term>taskbar</term></termGrp></ntig></langSet>
      <langSet xml:lang="de-de"><ntig><termGrp><term>Taskleiste</term></termGrp></ntig></langSet></termEntry>
  </body></text></martif>`;
  const glossary = glossaryFromTbx(tbx, 'de-de');
  assert.deepEqual(
    [...glossary],
    [
      ['settings', 'Einstellungen'],
      ['taskbar', 'Taskleiste'],
    ],
  );
  assert.deepEqual([...termsIn(['Open Settings', 'Reset all settings?'], glossary)], [['settings', 'Einstellungen']]);
  assert.equal(termsIn(['Settingsbar'], glossary).size, 0, 'whole words only');
});

test('a plural whose "other" form came back broken is left out whole, so it shows in English', () => {
  const sources = sourceTexts({ kle: { leftOut: { one: '{count} key left', other: '{count} keys left' } } }, 'it');
  const texts = new Map([
    ['kle.leftOut.one', '{count} tasto rimasto'],
    ['kle.leftOut.many', '{count} tasti rimasti'],
  ]);
  assert.deepEqual([...completePlurals(texts, sources).keys()], []);
  texts.set('kle.leftOut.other', '{count} tasti rimasti');
  assert.equal(completePlurals(texts, sources).size, 3);
});
