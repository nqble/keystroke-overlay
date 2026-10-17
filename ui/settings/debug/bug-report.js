// =====================================================================================================================
//  "Bug report": copies the scrubbed report for an issue or an assistant.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { button, call, el, note, toast } from '../helpers.js';
import { TEXT } from './shared.js';
import { buildReport } from './checks.js';

export const bugReportSection = {
  id: 'bug-report',
  title: 'Bug report',
  build() {
    return [
      note(TEXT.bugReportHelp),
      el(
        'div',
        { className: 'btns' },
        button(
          'Copy bug report',
          async () => {
            await call('copy_text', { text: await buildReport() });
            toast('Bug report copied');
          },
          'primary',
          'debug-bug-report',
        ),
      ),
    ];
  },
};
