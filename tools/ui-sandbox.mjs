// Open the real settings window in a normal browser, without Windows, a build or the keyboard hook.
//
//   npm run ui-sandbox                     then open http://127.0.0.1:7882/
//   npm run ui-sandbox -- --port 8000      use another port (the overlay preview uses the next one)
//   http://127.0.0.1:7882/?state=paused-no-obs&tab=general     a state and a tab (the list is in tools/sandbox/fake-app.js)
//
// For people and Claude sessions on any system: change ui/settings/, reload, and see the result; screenshot tests can
// open any state by its address. It serves ui/settings/ exactly as it is, plus tools/sandbox/fake-app.js, which stands in
// for the app (window.__TAURI__ with made-up answers). The live preview comes from tools/preview.mjs, started alongside.
// What it can't show: anything Windows draws (the tray, WebView2 quirks, real key presses). Check those on Windows.
//
// Privacy: it listens on 127.0.0.1 only, makes no network requests and uses only Node's own modules. The privacy check
// (tools/check-privacy.mjs) enforces this, with the same rules as the preview tool. Keep it that way.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SETTINGS_DIR = join(ROOT, 'ui', 'settings');
const LAYOUTS_DIR = join(ROOT, 'ui', 'overlay', 'layouts');
const SANDBOX_DIR = join(ROOT, 'tools', 'sandbox');
const HOST = '127.0.0.1';
const DEFAULT_PORT = 7882; // not the app's 7878, the preview's 7880 or a devbuild's 7881, so all can run at once
const SANDBOX_PREFIX = '/__sandbox__/';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function readPort() {
  const args = process.argv.slice(2);
  return args.includes('--port') ? Number(args[args.indexOf('--port') + 1]) : DEFAULT_PORT;
}

function send(response, status, contentType, body) {
  response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  response.end(body);
}

/** A file from `folder`, never from outside it, whatever the address says (for example "/../../secret"). */
function sendFileFrom(response, folder, relativePath) {
  const filePath = normalize(join(folder, relativePath));
  const inside = filePath.startsWith(folder + sep);
  if (!inside || !existsSync(filePath) || !statSync(filePath).isFile())
    return send(response, 404, 'text/plain', 'not found');
  send(response, 200, CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream', readFileSync(filePath));
}

/** The settings page, with the fake app loaded first, so window.__TAURI__ exists before the page's modules run. */
function sendSettingsPage(response, overlayPort) {
  const page = readFileSync(join(SETTINGS_DIR, 'index.html'), 'utf8');
  const fakeApp =
    `<script>window.__SANDBOX_OVERLAY_PORT__ = ${overlayPort};</script>` +
    `<script src="${SANDBOX_PREFIX}fake-app.js"></script>`;
  send(response, 200, CONTENT_TYPES['.html'], page.replace('<head>', `<head>${fakeApp}`));
}

function sendLayouts(response) {
  const files = readdirSync(LAYOUTS_DIR).filter((name) => name.endsWith('.json'));
  const layouts = files.map((name) => JSON.parse(readFileSync(join(LAYOUTS_DIR, name), 'utf8')));
  send(response, 200, CONTENT_TYPES['.json'], JSON.stringify(layouts));
}

/** The settings themes' file names, as the app's list_app_themes command gives them (commands/appearance.rs). */
function sendAppThemes(response) {
  const files = readdirSync(join(SETTINGS_DIR, 'themes')).filter((name) => name.endsWith('.json'));
  send(response, 200, CONTENT_TYPES['.json'], JSON.stringify(files.sort()));
}

function handleRequest(request, response, overlayPort) {
  const path = new URL(request.url, `http://${HOST}`).pathname;
  if (path === '/' || path === '/index.html') return sendSettingsPage(response, overlayPort);
  if (path === `${SANDBOX_PREFIX}layouts.json`) return sendLayouts(response);
  if (path === `${SANDBOX_PREFIX}app-themes.json`) return sendAppThemes(response);
  if (path.startsWith(SANDBOX_PREFIX)) return sendFileFrom(response, SANDBOX_DIR, path.slice(SANDBOX_PREFIX.length));
  return sendFileFrom(response, SETTINGS_DIR, path.slice(1));
}

function main() {
  const port = readPort();
  const overlayPort = port + 1;
  // The live preview: the overlay preview tool, which already serves ui/overlay/ with fake key presses.
  const preview = spawn(process.execPath, [join(ROOT, 'tools', 'preview.mjs'), '--port', String(overlayPort)], {
    stdio: 'ignore',
  });
  process.on('exit', () => preview.kill());
  process.on('SIGINT', () => process.exit(0));

  const server = createServer((request, response) => handleRequest(request, response, overlayPort));
  server.listen(port, HOST, () => {
    process.stdout.write(`UI sandbox: http://${HOST}:${port}/   (overlay preview on ${overlayPort}; Ctrl+C to stop)\n`);
  });
}

main();
