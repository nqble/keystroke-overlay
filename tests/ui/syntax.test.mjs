// Every JavaScript file under ui/ (except the copied libraries) must at least parse, so one stray quote can never reach a
// branch: a file that no other test imports would otherwise only fail in the running app. Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const UI_FOLDER = 'ui';
const SKIPPED_FOLDER = 'vendor'; // copied libraries, checked by their own fingerprint test

function scriptsIn(folder) {
  const found = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory() && entry.name !== SKIPPED_FOLDER) found.push(...scriptsIn(path));
    else if (entry.isFile() && entry.name.endsWith('.js')) found.push(path);
  }
  return found;
}

test('every script under ui/ parses', () => {
  const scripts = scriptsIn(UI_FOLDER);
  assert.ok(scripts.length > 50, 'the scripts were found');
  for (const script of scripts) {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', script], { stdio: 'pipe' }), script);
  }
});
