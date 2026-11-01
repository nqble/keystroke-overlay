// The overlay page's content-security policy (ui/overlay/index.html): custom themes and animations run in that page and
// can see the key presses, so the page may load and contact nothing but this app's own server (PRIVACY.md).
// Run with: node --test tests/ui/overlay-csp.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../../ui/overlay/index.html', import.meta.url), 'utf8');
const policy = page.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? '';
const directives = Object.fromEntries(
  policy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .filter((words) => words[0])
    .map(([name, ...sources]) => [name, sources]),
);
// Sources that stay on this computer.
const LOCAL = new Set(["'self'", "'none'", "'unsafe-inline'", 'data:', 'ws://127.0.0.1:*', 'ws://localhost:*']);

test('the overlay page has a policy that starts from nothing allowed', () => {
  assert.ok(policy, 'a Content-Security-Policy meta tag');
  assert.deepEqual(directives['default-src'], ["'none'"]);
});

test('every source the policy allows stays on this computer', () => {
  for (const [name, sources] of Object.entries(directives)) {
    for (const source of sources) assert.ok(LOCAL.has(source), `${name} allows ${source}`);
  }
  assert.deepEqual(directives['script-src'], ["'self'"], 'scripts only from the app itself, none inline');
  assert.ok(directives['connect-src'].includes("'self'"));
});
