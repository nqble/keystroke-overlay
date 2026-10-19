// Copies the settings window's two small libraries (Preact and htm) into ui/settings/vendor/, pinned and checked.
// They are copied in, never loaded from the internet. Plan: docs/for-claude/proposals/done/v2-preact.md.
//
//   node tools/vendor.mjs            download the versions in LIBRARIES, verify them, copy them, write VENDOR.json
//   node tools/vendor.mjs --check    no changes: list newer versions and known security advisories (the weekly Security
//                                    scan runs this, because copied-in files are invisible to Dependabot and npm audit)
//
// To update: change a version below, run the tool, review the diff of ui/settings/vendor/, commit. Never edit the copied
// files by hand: tests/ui/vendor.test.mjs fails if one doesn't match the fingerprint in VENDOR.json.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VENDOR_DIR = 'ui/settings/vendor';
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** What we copy: the package, its exact version, and which file goes where (file inside the package -> copied name). */
const LIBRARIES = [
  {
    name: 'preact',
    version: '10.29.8',
    files: {
      'dist/preact.module.js': 'preact.module.js',
      'hooks/dist/hooks.module.js': 'hooks.module.js',
      LICENSE: 'preact.LICENSE.txt', // MIT
    },
  },
  // Apache-2.0: its license text must ship with it, so it is copied too
  { name: 'htm', version: '3.1.1', files: { 'dist/htm.module.js': 'htm.module.js', LICENSE: 'htm.LICENSE.txt' } },
];

/**
 * The first of only two changes made to a copied file: the hooks import "preact" by its bare name, which only works with
 * a bundler or an inline import map (the window's security policy blocks inline scripts). It becomes a path to the copy.
 */
const IMPORT_REWRITES = { 'hooks.module.js': [['from"preact"', 'from"./preact.module.js"']] };

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const npm = (...args) => execFileSync(NPM, args, { encoding: 'utf8', shell: process.platform === 'win32' });

/** Downloads one package with npm (which checks the registry's integrity hash) and unpacks it into `folder`. */
function download(library, folder) {
  const packed = JSON.parse(npm('pack', `${library.name}@${library.version}`, '--json', '--pack-destination', folder));
  execFileSync('tar', ['-xzf', join(folder, packed[0].filename), '-C', folder]);
  return { integrity: packed[0].integrity, root: join(folder, 'package') };
}

/**
 * The second change: the line pointing at a source map is removed, because the maps aren't copied (the line would make the
 * developer tools ask for a missing file).
 */
const SOURCE_MAP_LINE = /\n?\/\/# sourceMappingURL=\S+\s*$/;

function rewriteImports(copiedName, text) {
  let rewritten = text.replace(SOURCE_MAP_LINE, '\n');
  for (const [from, to] of IMPORT_REWRITES[copiedName] ?? []) {
    if (!rewritten.includes(from))
      throw new Error(`${copiedName}: expected to find ${from}; the library changed, check it`);
    rewritten = rewritten.split(from).join(to);
  }
  return rewritten;
}

function copyAll() {
  const folder = mkdtempSync(join(tmpdir(), 'ko-vendor-'));
  const record = [];
  try {
    for (const library of LIBRARIES) {
      const { integrity, root } = download(library, folder);
      for (const [inside, copiedName] of Object.entries(library.files)) {
        const text = rewriteImports(copiedName, readFileSync(join(root, inside), 'utf8'));
        writeFileSync(join(VENDOR_DIR, copiedName), text);
        record.push({
          file: copiedName,
          from: `${library.name}@${library.version}/${inside}`,
          npmIntegrity: integrity,
          sha256: sha256(text),
        });
      }
      rmSync(root, { recursive: true, force: true });
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
  writeFileSync(join(VENDOR_DIR, 'VENDOR.json'), JSON.stringify(record, null, 2) + '\n');
  console.log(`copied ${record.length} files into ${VENDOR_DIR} and wrote VENDOR.json`);
}

async function checkForUpdates() {
  for (const library of LIBRARIES) {
    const latest = npm('view', library.name, 'version').trim();
    console.log(`${library.name}: using ${library.version}, latest ${latest}`);
  }
  const versions = Object.fromEntries(LIBRARIES.map((library) => [library.name, [library.version]]));
  const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(versions),
  });
  const advisories = await response.json();
  const found = Object.entries(advisories).flatMap(([name, list]) =>
    list.map((advisory) => `${name}: ${advisory.title}`),
  );
  if (found.length) {
    console.error('Known security advisories for the copied libraries:\n  ' + found.join('\n  '));
    process.exit(1);
  }
  console.log('no known security advisories for the copied libraries');
}

if (process.argv.includes('--check')) await checkForUpdates();
else copyAll();
