// tools/gen-layouts.mjs must still run and still produce the built-in layouts we ship. It once called a function that a
// refactor had renamed, and nothing noticed because nothing ran it. The script writes into ui/overlay/layouts/ of the
// folder it runs in, so it runs in a temporary folder here. Run with: npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../tools/gen-layouts.mjs', import.meta.url));
const SHIPPED = fileURLToPath(new URL('../../ui/overlay/layouts/', import.meta.url));

test('gen-layouts.mjs runs and writes the same layouts we ship', () => {
  const folder = mkdtempSync(join(tmpdir(), 'gen-layouts-'));
  try {
    const output = join(folder, 'ui', 'overlay', 'layouts');
    mkdirSync(output, { recursive: true });
    execFileSync(process.execPath, [SCRIPT], { cwd: folder });
    const written = readdirSync(output);
    assert.ok(written.length > 0, 'the script wrote no layouts');
    for (const file of written) {
      const generated = JSON.parse(readFileSync(join(output, file), 'utf8'));
      const shipped = JSON.parse(readFileSync(join(SHIPPED, file), 'utf8'));
      assert.deepEqual(generated, shipped, `${file} differs from the shipped layout`);
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
