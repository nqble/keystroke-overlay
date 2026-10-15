// Starts the app for development with everything a developer wants switched on:
//   npm run dev:debug
//
//   * Debug mode is ON (the Debug tab is there from the first start; same as KEYOVERLAY_DEBUG=1)
//   * the full browser inspector is reachable: open edge://inspect in Edge, add localhost:9222, click "inspect"
//   * it runs as a SEPARATE copy ("com.keyoverlay.dev": its own settings folder and its own port, 7880), so it never
//     clashes with an installed Keystroke Overlay that may be running (installed copy = port 7878)
//
// Close the dev copy with its tray icon -> Quit, or Ctrl+C here.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DEV_ID = 'com.keyoverlay.dev';
const DEV_PORT = 7880;
const dataDir = join(process.env.APPDATA ?? '', DEV_ID);
const settingsFile = join(dataDir, 'settings.json');

// First run only: give the dev copy its own port. After that the settings file is the app's to manage.
if (process.env.APPDATA && !existsSync(settingsFile)) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(settingsFile, JSON.stringify({ version: 2, general: { port: DEV_PORT, autoCheckUpdates: false } }));
}

console.log(`
Keystroke Overlay (development copy)
  overlay address ........ http://localhost:${DEV_PORT}/
  settings + data ........ ${dataDir}
  Debug tab .............. on
  browser inspector ...... edge://inspect  ->  Configure: localhost:9222  ->  inspect
`);

const child = spawn('npx', ['tauri', 'dev', '--config', JSON.stringify({ identifier: DEV_ID })], {
  stdio: 'inherit', shell: true,
  env: { ...process.env, KEYOVERLAY_DEBUG: '1', WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222' },
});
child.on('exit', code => process.exit(code ?? 0));
