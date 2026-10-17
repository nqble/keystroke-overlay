// =====================================================================================================================
//  "Developer tools": how to open the full browser inspector.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { button, call, el, note, toast } from '../helpers.js';
import { TEXT } from './shared.js';

export const developerTools = {
  id: 'developer-tools',
  title: 'Developer tools (full browser inspector)',
  build() {
    const command = 'set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222';
    return [
      note('To inspect this window like a web page (elements, console, network):'),
      el(
        'ol',
        { className: 'dbg-steps' },
        el('li', { textContent: 'Quit Keystroke Overlay (tray icon → Quit).' }),
        el('li', {
          textContent: 'In a Command Prompt, run the line below, then start the app from that same window.',
        }),
        el('li', { textContent: TEXT.inspectorStepEdge }),
      ),
      el('code', { className: 'dbg-cmd', textContent: command }),
      el(
        'div',
        { className: 'btns' },
        button(
          'Copy command',
          async () => {
            await call('copy_text', { text: command });
            toast('Copied');
          },
          '',
          'debug-copy-command',
        ),
      ),
      note(TEXT.inspectorDeveloperNote),
    ];
  },
};
