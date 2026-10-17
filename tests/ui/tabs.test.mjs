// The list of tabs (ui/settings/tabs/index.js) is the one place a tab is added: every entry needs an id, a name and a
// render function that its file really exports. Read as text, because the tab files need the app around them to load.
// Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const TABS_DIR = new URL('../../ui/settings/tabs/', import.meta.url);
const index = readFileSync(new URL('index.js', TABS_DIR), 'utf8');
const entries = [...index.matchAll(/\{ id: '([^']+)', name: '([^']+)', render: (\w+)[ ,}]/g)].map(
  ([, id, name, render]) => ({
    id,
    name,
    render,
  }),
);
const imports = Object.fromEntries(
  [...index.matchAll(/import \{ (\w+) \} from '\.\/([\w-]+\.js)';/g)].map(([, name, file]) => [name, file]),
);

test('there are tabs, each with an id and a name, and no id twice', () => {
  assert.ok(entries.length >= 5);
  const ids = entries.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of entries) assert.ok(entry.name.trim(), entry.id);
});

test("every tab's render function is exported by the file it is imported from", () => {
  for (const { id, render } of entries) {
    if (!(render in imports)) {
      assert.match(index, new RegExp(`const ${render} = `), `${id}: ${render} is neither imported nor defined`);
      continue;
    }
    const source = readFileSync(new URL(imports[render], TABS_DIR), 'utf8');
    assert.match(source, new RegExp(`export (async )?function ${render}\\b`), `${id}: ${imports[render]}`);
  }
});

test('the list is the only list: no second table of tab names anywhere', () => {
  for (const file of ['../state.js', '../settings.js', '../messages.js']) {
    const source = readFileSync(new URL(file, TABS_DIR), 'utf8');
    assert.doesNotMatch(source, /TAB_NAMES|const TABS = \{/, file);
  }
});
