// =====================================================================================================================
//  "Test helpers": fake an update, add test layouts and similar.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { addLayoutDialog } from '../dialogs.js';
import { showNotes } from '../notes.js';
import { button, call, el, invoke, note, toast } from '../helpers.js';
import { appVersion } from '../state.js';
import { TEXT } from './shared.js';

export const testHelpers = {
  id: 'test-helpers',
  title: 'Test helpers',
  build() {
    return [
      note('Shortcuts for trying things that are hard to trigger on demand.'),
      el(
        'div',
        { className: 'btns' },
        button('Fake update available', () => invoke('debug_simulate_update', { on: true }), '', 'debug-fake-update'),
        button(
          'Clear fake update',
          () => invoke('debug_simulate_update', { on: false }),
          '',
          'debug-clear-fake-update',
        ),
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
      note(TEXT.fakeUpdateHelp),
    ];
  },
};
