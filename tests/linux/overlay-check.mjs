// Checks a running copy of the app from outside, the way OBS sees it, for the Linux tests workflow
// (.github/workflows/linux-tests.yml, docs/LINUX-PORT.md). The workflow starts the installed app and a way to type.
//
//   node tests/linux/overlay-check.mjs keys -- <command that types w a s d>
//       Connects to the overlay's key stream, runs the command, and checks that each key arrives pressed, then released.
//   node tests/linux/overlay-check.mjs labels -- <command that switches to a French layout>
//       Checks that the key labels follow the keyboard layout: the key in the Q position is labeled A in French (AZERTY).
//
// Exits 1 with a reason when a check fails. Uses only Node's own WebSocket and fetch.
import { spawnSync } from 'node:child_process';

const PORT = 7878; // the default port (settings.rs)
const BASE = `http://127.0.0.1:${PORT}`;
const TYPED = ['KeyW', 'KeyA', 'KeyS', 'KeyD']; // what the typing commands type; the uinput helper in linux_devices.rs types the same
const WAIT_MS = 5000;
const STEP_MS = 200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(reason) {
  console.error(`FAILED: ${reason}`);
  process.exit(1);
}

/** Runs the command given after `--`. */
function run(command) {
  if (command.length === 0) fail('no command given after --');
  const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit' });
  if (result.status !== 0) fail(`${command.join(' ')} exited with ${result.status}`);
}

/** Waits until the app's server answers, since the workflow starts the app just before this script. */
async function waitForApp() {
  for (let waited = 0; waited < 30000; waited += STEP_MS) {
    const answered = await fetch(`${BASE}/api/config`).then(
      (response) => response.ok,
      () => false,
    );
    if (answered) return;
    await sleep(STEP_MS);
  }
  fail(`the app did not answer on port ${PORT}`);
}

async function checkKeys(command) {
  const socket = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const changes = [];
  socket.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.t === 'd' || data.t === 'u') changes.push(`${data.t} ${data.k}`);
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('the key stream refused the connection'));
  }).catch((error) => fail(error.message));

  run(command);
  const expected = TYPED.flatMap((code) => [`d ${code}`, `u ${code}`]);
  for (let waited = 0; waited < WAIT_MS && changes.length < expected.length; waited += STEP_MS) await sleep(STEP_MS);
  socket.close();
  const got = changes.join(', ');
  if (got !== expected.join(', ')) fail(`expected ${expected.join(', ')}; got ${got || 'nothing'}`);
  console.log(`keys arrived: ${got}`);
}

/** The label the overlay shows on the key in the Q position, from the full-size layout. */
async function labelOfQ() {
  const layouts = await (await fetch(`${BASE}/api/layouts`)).json();
  const keys = layouts.flatMap((layout) => layout.keys);
  return keys.find((key) => key.code === 'KeyQ')?.label;
}

async function checkLabels(command) {
  const before = await labelOfQ();
  if (before?.toUpperCase() !== 'Q') fail(`the Q key should be labeled Q on a US layout; it is ${before}`);
  run(command);
  let after = before;
  for (let waited = 0; waited < WAIT_MS && after === before; waited += STEP_MS) {
    await sleep(STEP_MS);
    after = await labelOfQ();
  }
  if (after?.toUpperCase() !== 'A') fail(`after switching to French the Q key should be labeled A; it is ${after}`);
  console.log(`labels follow the layout: Q became ${after}`);
}

const [mode, separator, ...command] = process.argv.slice(2);
if (separator !== '--') fail('usage: overlay-check.mjs keys|labels -- <command>');
await waitForApp();
if (mode === 'keys') await checkKeys(command);
else if (mode === 'labels') await checkLabels(command);
else fail(`unknown check ${mode}`);
