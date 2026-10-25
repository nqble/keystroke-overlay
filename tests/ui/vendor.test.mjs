// The copied libraries (ui/settings/vendor/) must be exactly what tools/vendor.mjs copied: a hand edit, a corrupted copy
// or a file swapped in fails here. Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const VENDOR = new URL('../../ui/settings/vendor/', import.meta.url);
const record = JSON.parse(readFileSync(new URL('VENDOR.json', VENDOR), 'utf8'));
const sha256 = (file) =>
  createHash('sha256')
    .update(readFileSync(new URL(file, VENDOR), 'utf8'))
    .digest('hex');

test('every copied file matches its fingerprint in VENDOR.json', () => {
  for (const entry of record) assert.equal(sha256(entry.file), entry.sha256, `${entry.file} was changed by hand`);
});

test('nothing in the folder is missing from VENDOR.json', () => {
  const listed = new Set([...record.map((entry) => entry.file), 'VENDOR.json', 'LICENSES.md']);
  for (const file of readdirSync(VENDOR)) assert.ok(listed.has(file), `${file} is not from tools/vendor.mjs`);
});

test('the copies load each other by path, never by a bare name or a web address', () => {
  for (const entry of record.filter((e) => e.file.endsWith('.js'))) {
    const text = readFileSync(new URL(entry.file, VENDOR), 'utf8');
    for (const [, from] of text.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) {
      assert.ok(from.startsWith('./'), `${entry.file} imports "${from}"`);
    }
  }
});
