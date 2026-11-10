// The network-free parts of `npm run translate` (tools/translate-text.mjs): placeholders survive a service, only new or
// changed English is sent, reviewed texts never are, plural forms follow the language, and the glossary is read.
// Run with: node --test tests/ui/translate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_CONTEXT,
  back,
  byGroup,
  completePlurals,
  contextFor,
  fingerprint,
  flatTexts,
  glossaryFromTbx,
  groupContexts,
  textNotes,
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

test('the comment above each group in en.js is the context its texts are sent with', () => {
  const source = [
    'export default {',
    '  // the tray menu (the menu bar menu on a Mac),',
    '  // built by the app',
    '  appMenu: {',
    "    quit: 'Quit',",
    '  },',
    '',
    '  keys: {',
    "    hide: 'hide',",
    '  },',
    '};',
  ].join('\n');
  const contexts = groupContexts(source);
  assert.deepEqual([...contexts], [['appMenu', 'the tray menu (the menu bar menu on a Mac), built by the app']]);
  assert.match(contextFor('appMenu.quit', contexts), /shown in: the tray menu \(the menu bar menu on a Mac\), built/);
  assert.equal(contextFor('keys.hide', contexts), APP_CONTEXT, 'a group without a comment gets the app context');
  assert.deepEqual(
    [...byGroup(['a.x', 'b.y', 'a.z'])],
    [
      ['a', ['a.x', 'a.z']],
      ['b', ['b.y']],
    ],
  );
});

test('the real en.js gives most groups a context', async () => {
  const { readFileSync } = await import('node:fs');
  const contexts = groupContexts(readFileSync(new URL('../../ui/settings/locales/en.js', import.meta.url), 'utf8'));
  assert.ok(contexts.size >= 30, `${contexts.size} groups with a comment`);
  assert.match(contexts.get('appMenu') ?? '', /tray menu/);
  assert.doesNotMatch(contexts.get('keys') ?? '', /\.js|ui\//, 'file names and paths are left out');
});

test("a comment at the end of a text line is sent as that text's own note", () => {
  const source = [
    '  keys: {',
    "    pan: 'pan', // means: moving the view by dragging",
    "    hide: 'hide', // tests check this",
    '  },',
  ].join('\n');
  const notes = textNotes(source);
  assert.deepEqual([...notes], [['keys.pan', 'moving the view by dragging']]);
  assert.match(contextFor('keys.pan', new Map(), notes), /This text means: moving the view by dragging\.$/);
  assert.equal(contextFor('keys.hide', new Map(), notes), APP_CONTEXT);
});

test('a note on a one-line group of texts covers every text in it', () => {
  const source = [
    '  systemWords: {',
    "    autostart: { windows: 'Start with Windows', macos: 'Open at login' }, // means: a switch: start the app with the computer",
    '  },',
  ].join('\n');
  const notes = textNotes(source);
  assert.deepEqual([...notes.keys()], ['systemWords.autostart']);
  assert.match(contextFor('systemWords.autostart.windows', new Map(), notes), /means: a switch: start the app/);
  assert.match(contextFor('systemWords.autostart.macos', new Map(), notes), /means: a switch/);
});

test('a service that says "too many requests" is asked again after the pause it asks for', async () => {
  const { post } = await import('../../tools/translate-engines.mjs');
  const realFetch = globalThis.fetch;
  const answers = [
    new Response('slow down', { status: 429, headers: { 'Retry-After': '1' } }),
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  ];
  let calls = 0;
  globalThis.fetch = async () => answers[calls++];
  try {
    assert.deepEqual(await post('https://api-free.deepl.com/v2/translate', {}, {}), { ok: true });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});
