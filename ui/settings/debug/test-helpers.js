// =====================================================================================================================
//  "Test helpers": fake an update, add test layouts and similar.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { addLayoutDialog } from '../dialogs.js';
import { showNotes } from '../notes.js';
import { button, call, el, invoke, note, tauriEvent, toast } from '../helpers.js';
import { appVersion, platform } from '../state.js';
import { systemWord } from '../system-words.js';
import { TEXT } from './shared.js';

/**
 * A picture of the tray icon exactly as the tray has it now, with the update dot, the first menu entry and the
 * tooltip (debug_tray_state, tray.rs indicator_state), so the update indicator can be checked without finding the tray.
 */
function trayPreview() {
  const trayName = systemWord('trayName', platform);
  const canvas = el('canvas', { test: 'debug-tray-icon' });
  const line = el('span', { test: 'debug-tray-state' });
  const label = el('span', { textContent: TEXT.trayNow(trayName) });
  const element = el('div', { className: 'btns', test: 'debug-tray' }, label, canvas, line);
  const refresh = async () => {
    const state = await invoke('debug_tray_state');
    if (!state?.ready) {
      line.textContent = TEXT.trayNotReady(trayName);
      return;
    }
    line.textContent = TEXT.trayState(state);
    element.dataset.updateShown = String(state.updateShown);
    const { size, rgba } = state.preview;
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(rgba), size, size), 0, 0);
  };
  tauriEvent.listen('update-result', refresh); // a real or fake check changes the tray too
  return { element, refresh };
}

export const testHelpers = {
  id: 'test-helpers',
  title: 'Test helpers',
  build() {
    const tray = trayPreview();
    const fake = async (on) => {
      await invoke('debug_simulate_update', { on });
      tray.refresh();
    };
    tray.refresh();
    return [
      note('Shortcuts for trying things that are hard to trigger on demand.'),
      el(
        'div',
        { className: 'btns' },
        button('Fake update available', () => fake(true), '', 'debug-fake-update'),
        button('Clear fake update', () => fake(false), '', 'debug-clear-fake-update'),
        button(
          'Show “What’s new” popup',
          () => showNotes(appVersion, `What's new in v${appVersion}`),
          '',
          'debug-whats-new',
        ),
        button('New layout popup', () => addLayoutDialog(), '', 'debug-new-layout'),
      ),
      el(
        'div',
        { className: 'btns' },
        button('Toast', () => toast('A normal message'), '', 'debug-toast'),
        button('Error toast', () => toast('An error message', true), '', 'debug-error-toast'),
        button(
          'Restart server',
          async () => {
            await call('restart_server');
            toast('Server restarted');
          },
          '',
          'debug-restart-server',
        ),
        button('Reload this window', () => location.reload(), '', 'debug-reload-window'),
      ),
      tray.element,
      note(TEXT.fakeUpdateHelp(systemWord('trayName', platform))),
    ];
  },
};
