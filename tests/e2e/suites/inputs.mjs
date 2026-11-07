// Suite: the mouse input (docs/proposals/mouse-input.md, Tests). Injects real mouse input with SendInput into a small
// window of its own under the pointer (tests/bench/mouse-inject.ps1: every click lands there and nowhere else, the pointer
// only moves a pixel back and forth) and checks the overlay's event stream, the General tab's Mouse card, the saved
// setting and that turning the input off ends it. Windows only (the capture is Raw Input); Linux and macOS have their own.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT, byTest, check, connect, finish, procStats, sleep } from '../lib/cdp.mjs';

const INJECT = join(dirname(fileURLToPath(import.meta.url)), '../../bench/mouse-inject.ps1');
const send = (mode, a, b = 0) =>
  new Promise((done) =>
    spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', INJECT, mode, a, b], {
      stdio: 'ignore',
    }).on('exit', done),
  );

const p = await connect();
await sleep(1500);

/** Every key and mouse name the overlay's stream carries, as "+MouseLeft" / "-MouseLeft". */
const events = [];
const stream = new WebSocket(`ws://localhost:${PORT}/ws`);
stream.onmessage = (message) => {
  const event = JSON.parse(message.data);
  if (event.t === 'd' || event.t === 'u') events.push((event.t === 'd' ? '+' : '-') + event.k);
};
await new Promise((open) => (stream.onopen = open));
const run = async (mode, count) => {
  events.length = 0;
  await send(mode, count);
  await sleep(500);
  return [...events];
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const state = async () => (await p.invoke('get_state')).ok;
const mouseSwitch = `document.querySelector('${byTest('mouse-switch')}')`;
const switchOn = () => p.q(`${mouseSwitch}?.getAttribute('aria-checked') === 'true'`);

// ------------------------------------------------------------ the Mouse card, off by default
await p.ev(`document.querySelector('${byTest('tab', '[data-tab="general"]')}').click()`);
await sleep(500);
check(
  'General has a Mouse card with the Show my mouse switch',
  await p.q(`!!document.querySelector('${byTest('general-mouse')}') && !!${mouseSwitch}`),
);
check('the switch is off at first, and nothing runs', !(await switchOn()) && (await state()).mouseRunning === false);
check('no setting is saved yet', (await state()).settings.inputs.mouse.enabled === false);
const quiet = await run('click', 5);
check('with the input off, clicks send nothing', quiet.length === 0, JSON.stringify(quiet));

// ------------------------------------------------------------ turned on from the card
const threadsOff = procStats()[0];
await p.ev(`${mouseSwitch}.click()`);
await sleep(800);
check(
  'the switch shows on, the capture runs and no error is shown',
  (await switchOn()) &&
    (await state()).mouseRunning === true &&
    !(await p.q(`!!document.querySelector('${byTest('mouse-error')}')`)),
);
check('the setting is saved', (await state()).settings.inputs.mouse.enabled === true);

const clicks = await run('click', 5);
check(
  'every button is a press and a release: left, right, middle, back, forward',
  same(clicks, [
    '+MouseLeft',
    '-MouseLeft',
    '+MouseRight',
    '-MouseRight',
    '+MouseMiddle',
    '-MouseMiddle',
    '+MouseBack',
    '-MouseBack',
    '+MouseForward',
    '-MouseForward',
  ]),
  clicks.join(' '),
);
const wheel = await run('wheel', 2);
check(
  'a wheel notch is one tap, up and then down',
  same(wheel, ['+WheelUp', '-WheelUp', '+WheelDown', '-WheelDown']),
  wheel.join(' '),
);
const moves = await run('move', 2); // two seconds of one-pixel moves at the default rate
check('moving the mouse sends nothing, not a position and not a name', moves.length === 0, JSON.stringify(moves));

// ------------------------------------------------------------ pause and the keyboard
await p.invoke('toggle_pause');
await sleep(300);
const paused = await run('click', 5);
check('paused: clicks send nothing', paused.length === 0, JSON.stringify(paused));
await p.invoke('toggle_pause');
await sleep(300);
const after = await run('click', 1);
check('resumed: clicks arrive again', same(after, ['+MouseLeft', '-MouseLeft']), after.join(' '));

// ------------------------------------------------------------ turned off again
await p.ev(`${mouseSwitch}.click()`);
await sleep(800);
check('the switch shows off and nothing runs', !(await switchOn()) && (await state()).mouseRunning === false);
check('the setting is saved off', (await state()).settings.inputs.mouse.enabled === false);
const silent = await run('click', 5);
check('after turning it off, clicks send nothing', silent.length === 0, JSON.stringify(silent));
await sleep(500);
const threadsEnd = procStats()[0];
check(
  'the thread count is back to what it was before',
  threadsEnd <= threadsOff,
  `${threadsOff} before, ${threadsEnd} after`,
);

// ------------------------------------------------------------ on and off from the command, many times
for (let i = 0; i < 10; i++) {
  await p.invoke('set_mouse_input', { enabled: true });
  await p.invoke('set_mouse_input', { enabled: false });
}
await sleep(500);
check('ten on/off cycles leave no thread behind', procStats()[0] <= threadsOff, `${procStats()[0]} threads`);
check(
  'the mouse input ends off',
  (await state()).mouseRunning === false && (await state()).settings.inputs.mouse.enabled === false,
);

stream.close();
p.close();
finish();
