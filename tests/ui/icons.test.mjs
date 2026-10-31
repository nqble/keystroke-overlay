// The settings window's icons are drawn shapes (ui/settings/icons.js), not text characters: each system's font draws
// characters like ⏸ or ✕ differently, and on Windows the pause icon sat off center. This fails if one creeps back
// into the settings scripts as a button's icon. (The header's status words, such as "⏸ Paused", are text and may keep
// theirs: they're in obs-status.js, which is skipped.) Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SETTINGS = fileURLToPath(new URL('../../ui/settings/', import.meta.url));
const ICON_CHARACTERS = /[⏸▶✕⋯▾▸]/u;
const TEXT_ONLY_FILES = new Set(['obs-status.js']);

/** Every settings script (not the vendored libraries), as a path relative to ui/settings/. */
function settingsScripts(folder = '') {
  const entries = readdirSync(join(SETTINGS, folder), { withFileTypes: true });
  const scripts = [];
  for (const entry of entries) {
    const path = join(folder, entry.name);
    if (entry.isDirectory() && entry.name !== 'vendor') scripts.push(...settingsScripts(path));
    else if (/\.(js|html)$/.test(entry.name)) scripts.push(path);
  }
  return scripts;
}

/** A line that only explains something (a comment) may name the old characters. */
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

test('no text characters are used as icons in the settings window', () => {
  const found = [];
  for (const script of settingsScripts()) {
    if (TEXT_ONLY_FILES.has(script)) continue;
    const lines = readFileSync(join(SETTINGS, script), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (!isComment(line) && ICON_CHARACTERS.test(line)) found.push(`${script}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(found, [], 'use an icon from ui/settings/icons.js instead');
});
