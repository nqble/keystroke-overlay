// Prints the "Which file do I download?" table that starts every release's notes (the release workflow puts it above
// the CHANGELOG entry), so a first-time visitor knows which of the release's files is theirs.
//   node tools/download-table.mjs 2.1.0
// The file names must match what the release workflow attaches (.github/workflows/release.yml; docs/RELEASING.md).
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('usage: node tools/download-table.mjs <version, e.g. 2.1.0>');
  process.exit(1);
}

const DOWNLOADS = [
  ['Windows 10 or 11 (64-bit)', `Keystroke-Overlay_${version}_x64-setup.exe`, 'Run it to install.'],
  [
    'Mac with Apple Silicon (M1 or newer), macOS 11 or newer',
    `Keystroke-Overlay_${version}_macOS-arm64.zip`,
    'Unzip it and move the app to Applications before opening it.',
  ],
  ['Linux (64-bit)', `Keystroke-Overlay_${version}_linux-x86_64.AppImage`, 'Updates itself in the app.'],
  [
    'Linux (Debian, Ubuntu and similar)',
    `Keystroke-Overlay_${version}_linux-amd64.deb`,
    'Install it with your package manager.',
  ],
];

const rows = DOWNLOADS.map(([system, file, note]) => `| ${system} | \`${file}\` | ${note} |`);
const lines = [
  '### Which file do I download?',
  '',
  '| Your computer | Download | |',
  '|---|---|---|',
  ...rows,
  '',
  "You don't need the other files (`latest.json` is for the app's updates, the source code is for developers). The",
  'downloads are not code-signed yet, so Windows or macOS may warn the first time: see',
  '[the user guide](https://github.com/nqble/keystroke-overlay/blob/main/docs/USER-GUIDE.md#requirements).',
  '',
];
console.log(lines.join('\n'));
