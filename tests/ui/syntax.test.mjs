// Every JavaScript file under ui/ (except the copied libraries) and every test script that only runs on Windows or by
// hand (tests/e2e, tests/visual, tests/bench) must at least parse, so one stray quote or a name declared twice can never
// reach a branch: such a file would otherwise only fail on the PC that runs it. Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const UI_FOLDER = 'ui';
const HAND_RUN_TEST_FOLDERS = ['tests/e2e', 'tests/visual', 'tests/bench'];
const SKIPPED_FOLDER = 'vendor'; // copied libraries, checked by their own fingerprint test

function scriptsIn(folder) {
  const found = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory() && entry.name !== SKIPPED_FOLDER) found.push(...scriptsIn(path));
    else if (entry.isFile() && /\.m?js$/.test(entry.name)) found.push(path);
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

test('every test script that runs only on Windows or by hand parses', () => {
  const scripts = HAND_RUN_TEST_FOLDERS.flatMap((folder) => scriptsIn(folder));
  assert.ok(scripts.length > 10, 'the scripts were found');
  for (const script of scripts) {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', script], { stdio: 'pipe' }), script);
  }
});
