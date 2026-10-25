// =====================================================================================================================
//  "Test helpers": fake an update, add test layouts and similar.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { addLayoutDialog } from '../dialogs.js';
import { call, invoke, tauriEvent, toast } from '../helpers.js';
import { html, useEffect, useLayoutEffect, useRef, useState } from '../html.js';
import { showNotes } from '../notes.js';
import { appVersion, platform } from '../state.js';
import { systemWord } from '../system-words.js';
import { Button, Hint, TEXT } from './shared.js';

/**
 * A picture of the tray icon exactly as the tray has it now, with the update dot, the first menu entry and the
 * tooltip (debug_tray_state, tray.rs indicator_state), so the update indicator can be checked without finding the tray.
 * `version` changes whenever the helpers above may have changed the tray, which asks again.
 */
function TrayPreview({ version }) {
  const trayName = systemWord('trayName', platform);
  const canvas = useRef(null);
  const [state, setState] = useState(null);
  const refresh = async () => setState(await invoke('debug_tray_state'));
  useEffect(() => {
    refresh();
  }, [version]);
  useEffect(() => {
    const pending = tauriEvent.listen('update-result', refresh); // a real or fake check changes the tray too
    return () => pending.then((stop) => stop());
  }, []);
  useLayoutEffect(() => {
    if (!state?.ready || !canvas.current) return;
    const { size, rgba } = state.preview;
    canvas.current.width = size;
    canvas.current.height = size;
    canvas.current.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(rgba), size, size), 0, 0);
  }, [state]);
  const line = state && !state.ready ? TEXT.trayNotReady(trayName) : state ? TEXT.trayState(state) : '';
  return html`<div
    class="btns"
    data-test="debug-tray"
    data-update-shown=${state?.ready ? String(state.updateShown) : null}
  >
    <span>${TEXT.trayNow(trayName)}</span>
    <canvas data-test="debug-tray-icon" ref=${canvas}></canvas>
    <span data-test="debug-tray-state">${line}</span>
  </div>`;
}

async function restartServer() {
  await call('restart_server');
  toast('Server restarted');
}

function TestHelpers() {
  const [trayVersion, setTrayVersion] = useState(0);
  const fake = async (on) => {
    await invoke('debug_simulate_update', { on });
    setTrayVersion((n) => n + 1);
  };
  const whatsNew = () => showNotes(appVersion, `What's new in v${appVersion}`);
  return html`<${Hint} text="Shortcuts for trying things that are hard to trigger on demand." />
    <div class="btns">
      <${Button} text="Fake update available" test="debug-fake-update" onClick=${() => fake(true)} />
      <${Button} text="Clear fake update" test="debug-clear-fake-update" onClick=${() => fake(false)} />
      <${Button} text="Show “What’s new” popup" test="debug-whats-new" onClick=${whatsNew} />
      <${Button} text="New layout popup" test="debug-new-layout" onClick=${() => addLayoutDialog()} />
    </div>
    <div class="btns">
      <${Button} text="Toast" test="debug-toast" onClick=${() => toast('A normal message')} />
      <${Button} text="Error toast" test="debug-error-toast" onClick=${() => toast('An error message', true)} />
      <${Button} text="Restart server" test="debug-restart-server" onClick=${restartServer} />
      <${Button} text="Reload this window" test="debug-reload-window" onClick=${() => location.reload()} />
    </div>
    <${TrayPreview} version=${trayVersion} />
    <${Hint} text=${TEXT.fakeUpdateHelp(systemWord('trayName', platform))} />`;
}

export const testHelpers = { id: 'test-helpers', title: 'Test helpers', Body: TestHelpers };
