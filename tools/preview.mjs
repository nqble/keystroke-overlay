// Preview the overlay in a normal browser, without building or running the app.
//
//   npm run preview                      then open http://127.0.0.1:7883/
//   npm run preview -- --port 8000       use another port
//   npm run preview -- --layout wasd     start on another built-in layout (tkl, full, gameplay, wasd)
//
// This is a stand-in for the real app, for people working on layouts, themes and animations:
//   * it serves the files in ui/overlay/ exactly like the app does;
//   * it answers the /api/* requests with the built-in layouts and default style (the same shapes as docs/PROTOCOL.md);
//   * it opens a /ws WebSocket and plays FAKE key presses, so you can see your animation without touching the keyboard.
// Every change you save in ui/overlay/ shows up after you reload the page. Nothing here reads your real keyboard.
//
// Privacy: it listens on 127.0.0.1 only, uses no network apart from that, and uses only Node's own modules. The privacy
// check (tools/check-privacy.mjs) enforces both. Keep it that way.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const OVERLAY_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'overlay');
const HOST = '127.0.0.1';
const DEFAULT_PORT = 7883; // not the app's 7878 or the dev copy's 7880 (npm run dev:debug), so all can run at once
const FAKE_KEY_EVERY_MS = 450; // how often a fake key goes down
const FAKE_KEY_HELD_MS = 220; // how long a fake key stays down
const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'; // fixed by the WebSocket standard (RFC 6455)

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// The same defaults as the app (docs/FILE-FORMATS.md). The real ones live in `defaults()` in src-tauri/src/settings.rs.
const DEFAULT_STYLE = {
  keyFill: '#1e222bd9',
  keyFillPressed: '#4f8cffff',
  borderColor: '#ffffff40',
  borderColorPressed: '#ffffffff',
  borderWidth: 2,
  radius: 8,
  fontFamily: 'Segoe UI',
  fontSize: 18,
  fontWeight: 600,
  textColor: '#e6e9f0ff',
  textColorPressed: '#ffffffff',
  glowColor: '#4f8cffff',
  glowSize: 18,
  keySize: 52,
  gap: 6,
  scale: 1.0,
  opacity: 1.0,
};

function readArguments() {
  const args = process.argv.slice(2);
  const valueOf = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
  return { port: Number(valueOf('--port', DEFAULT_PORT)), layout: valueOf('--layout', 'tkl') };
}

function readLayouts() {
  const folder = join(OVERLAY_DIR, 'layouts');
  const files = readdirSync(folder).filter((name) => name.endsWith('.json'));
  return files.map((name) => JSON.parse(readFileSync(join(folder, name), 'utf8')));
}

function listModules(kind) {
  const files = readdirSync(join(OVERLAY_DIR, kind)).filter((name) => name.endsWith('.js'));
  return files.map((name) => `/overlay/${kind}/${name}`);
}

function buildConfig(layoutId) {
  const settings = {
    version: 2,
    general: { port: 0 },
    layout: { id: layoutId, profiles: {} },
    style: DEFAULT_STYLE,
    animation: { type: 'glow', speed: 120, easing: 'default', intensity: 1.0 },
  };
  return { settings, port: 0, paused: false };
}

// ------------------------------------------------------------------ files and the mock API

function sendJson(response, value) {
  response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function sendOverlayFile(response, relativePath) {
  const filePath = normalize(join(OVERLAY_DIR, relativePath));
  // Never leave ui/overlay/, whatever the address says (for example "/overlay/../../secret").
  const insideOverlayFolder = filePath.startsWith(OVERLAY_DIR + sep);
  if (!insideOverlayFolder || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end('not found');
    return;
  }
  const contentType = CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  response.end(readFileSync(filePath));
}

function handleRequest(request, response, options) {
  const path = new URL(request.url, `http://${HOST}`).pathname;
  if (path === '/') return sendOverlayFile(response, 'index.html');
  if (path.startsWith('/overlay/')) return sendOverlayFile(response, path.slice('/overlay/'.length));
  if (path === '/api/config') return sendJson(response, buildConfig(options.layout));
  if (path === '/api/layouts') return sendJson(response, readLayouts());
  if (path === '/api/modules') {
    return sendJson(response, { animations: listModules('animations'), themes: listModules('themes') });
  }
  if (path === '/api/fonts') return sendJson(response, []);
  response.writeHead(404);
  response.end('not found');
}

// ------------------------------------------------------------------ a tiny WebSocket server (text frames, server -> browser only)

function acceptWebSocket(request, socket) {
  const key = request.headers['sec-websocket-key'];
  if (!key) return socket.destroy();
  const accept = createHash('sha1')
    .update(key + WEBSOCKET_GUID)
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
}

function textFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const length = payload.length;
  if (length < 126) return Buffer.concat([Buffer.from([0x81, length]), payload]);
  if (length < 65536) return Buffer.concat([Buffer.from([0x81, 126, length >> 8, length & 255]), payload]);
  throw new Error('preview messages are tiny; a frame this big is a bug');
}

function sendMessage(socket, message) {
  if (!socket.destroyed) socket.write(textFrame(JSON.stringify(message)));
}

// ------------------------------------------------------------------ fake key presses

// Plays a short, repeating "typing" pattern on the keys the layout really has. Runs only while a page is connected.
function startFakeTyping(socket, layoutId) {
  const layout = readLayouts().find((candidate) => candidate.id === layoutId) ?? readLayouts()[0];
  const codes = layout.keys.map((key) => key.code);
  let step = 0;
  const timer = setInterval(() => {
    const code = codes[(step * 7) % codes.length];
    step += 1;
    sendMessage(socket, { t: 'd', k: code });
    setTimeout(() => sendMessage(socket, { t: 'u', k: code }), FAKE_KEY_HELD_MS);
  }, FAKE_KEY_EVERY_MS);
  return () => clearInterval(timer);
}

// ------------------------------------------------------------------ start

function main() {
  const options = readArguments();
  const server = createServer((request, response) => handleRequest(request, response, options));

  server.on('upgrade', (request, socket) => {
    const path = new URL(request.url, `http://${HOST}`).pathname;
    if (path !== '/ws') return socket.destroy();
    acceptWebSocket(request, socket);
    sendMessage(socket, { t: 'snap', down: [] });
    const stopTyping = startFakeTyping(socket, options.layout);
    socket.on('close', stopTyping);
    socket.on('error', () => socket.destroy());
    socket.on('data', () => {}); // the browser sends nothing we need (it is read-only by design)
  });

  server.listen(options.port, HOST, () => {
    process.stdout.write(`Overlay preview: http://${HOST}:${options.port}/   (Ctrl+C to stop)\n`);
  });
}

main();
