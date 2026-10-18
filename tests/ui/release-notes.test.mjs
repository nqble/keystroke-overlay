// Unit tests for the release notes' sections (ui/settings/release-notes.js). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headingOf, sectionOf, sectionProblems } from '../../ui/settings/release-notes.js';

test('knows every section, with or without the emoji mark and a free note', () => {
  assert.equal(sectionOf('✨ New').kind, 'new');
  assert.equal(sectionOf('🛠️ Improved').kind, 'improved');
  assert.equal(sectionOf('⚡ Performance — v1.3.0 vs v1.2.1').kind, 'perf');
  assert.equal(sectionOf('🧰 Under the hood').kind, 'hood');
  assert.equal(sectionOf('Fixed'), null);
});

test('reads headings in the new format and the old bold lines', () => {
  assert.equal(headingOf('### 🐛 Fixed'), '🐛 Fixed');
  assert.equal(headingOf('**🐛 Fixed**'), '🐛 Fixed');
  assert.equal(headingOf('**v1.3.0 — free key placement**'), null);
  assert.equal(headingOf('- **Place keys anywhere.** In the Keys tab'), null);
});

test('a well-formed entry has no problems', () => {
  const entry = '### ✨ New\n- a\n\n### 🐛 Fixed\n- b\n\n### ⚡ Performance — v1.4.0 vs v1.3.0\n- c';
  assert.deepEqual(sectionProblems(entry), []);
});

test('the release check names unknown, misplaced, repeated and old-style sections', () => {
  assert.deepEqual(sectionProblems('### 🐛 Fixed\n- a\n### ✨ New\n- b'), ['"New" must come before "Fixed"']);
  assert.deepEqual(sectionProblems('### ✨ New\n### ✨ New'), ['"New" appears twice']);
  assert.deepEqual(sectionProblems('### 🚀 Shiny'), ['unknown section "🚀 Shiny"']);
  assert.deepEqual(sectionProblems('**✨ New**\n- a'), ['write "✨ New" as a heading: ### ✨ New']);
});
