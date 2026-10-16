// Unit tests for the devbuild's header label (tools/devbuild-title.mjs). Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addDevbuildLabel } from '../../tools/devbuild-title.mjs';

test('finds the title in the real settings page and adds the label once', () => {
  const page = readFileSync(new URL('../../ui/settings/index.html', import.meta.url), 'utf8');
  const changed = addDevbuildLabel(page);
  assert.equal(changed.match(/devbuild<\/small>/g)?.length, 1);
  assert.match(changed, /data-test="brand-title"[^>]*>Keystroke Overlay <small[^>]*>devbuild<\/small><\/span>/);
});

test('still works when the formatter wraps the tag or attributes move', () => {
  const wrapped = '<span\n  data-tauri-drag-region\n  data-test="brand-title"\n>\n  Keystroke Overlay\n</span>';
  assert.match(addDevbuildLabel(wrapped), /Keystroke Overlay <small/);
});

test('stops the build when the title is gone', () => {
  assert.throws(() => addDevbuildLabel('<span>Something else</span>'), /header markup changed/);
});
