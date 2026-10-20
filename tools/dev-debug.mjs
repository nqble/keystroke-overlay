// Starts the app for development with everything a developer wants switched on:
//   npm run dev:debug
//   npm run dev:debug -- --features gamepad     (anything after -- goes to `tauri dev`, here a cargo feature)
//
//   * Debug mode is ON (the Debug tab is there from the first start; same as KEYOVERLAY_DEBUG=1)
//   * the full browser inspector is reachable: open edge://inspect in Edge, add localhost:9222, click "inspect"
//   * it runs as a SEPARATE copy ("com.keyoverlay.dev": its own settings folder and its own port, 7880), so it never
//     clashes with an installed Keystroke Overlay that may be running (installed copy = port 7878)
//
// Close the dev copy with its tray icon -> Quit, or Ctrl+C here.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { APP } from './app-config.mjs';

const DEV_ID = APP.identifiers.dev;
const DEV_PORT = 7880;
// Where the app keeps its data on each system (Tauri's app data folder), so the dev copy gets its own port everywhere.
const appData =
  process.platform === 'win32'
    ? process.env.APPDATA
    : process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : (process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'));
const dataDir = join(appData ?? '', DEV_ID);
const settingsFile = join(dataDir, 'settings.json');

// First run only: give the dev copy its own port. After that the settings file is the app's to manage.
if (appData && !existsSync(settingsFile)) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(settingsFile, JSON.stringify({ version: 2, general: { port: DEV_PORT, autoCheckUpdates: false } }));
}

console.log(`
Keystroke Overlay (development copy)
  overlay address ........ http://localhost:${DEV_PORT}/
  settings + data ........ ${dataDir}
  Debug tab .............. on
  browser inspector ...... ${
    process.platform === 'darwin'
      ? 'Safari: Settings -> Advanced -> Show features for web developers, then Develop -> this Mac -> Keystroke Overlay'
      : 'edge://inspect  ->  Configure: localhost:9222  ->  inspect'
  }
`);

// The config is JSON, and the shell (needed for npx on Windows) strips the quotes of an argument unless the whole
// argument is quoted and its inner quotes are escaped: that is what stringifying twice produces.
const config = JSON.stringify(JSON.stringify({ identifier: DEV_ID }));
// Extra arguments (e.g. `-- --features gamepad`) go through the same shell, so only plain words are passed on: one with
// spaces or quotes would be split or lose its quotes on Windows, like the --config bug above.
const PLAIN_ARGUMENT = /^[\w=.,:/-]+$/;
const extra = process.argv.slice(2);
const unsafe = extra.find((argument) => !PLAIN_ARGUMENT.test(argument));
if (unsafe !== undefined) {
  console.error(`dev:debug passes on only plain words (letters, digits, = . , : / - _); not: ${unsafe}`);
  process.exit(1);
}
const child = spawn('npx', ['tauri', 'dev', '--config', config, ...extra], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, KEYOVERLAY_DEBUG: '1', WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222' },
});
child.on('exit', (code) => process.exit(code ?? 0));
