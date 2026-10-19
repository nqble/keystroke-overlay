// =====================================================================================================================
//  "Bug report": copies the scrubbed report for an issue or an assistant.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { call, toast } from '../helpers.js';
import { html } from '../html.js';
import { buildReport } from './checks.js';
import { Button, Hint, TEXT } from './shared.js';

async function copyReport() {
  await call('copy_text', { text: await buildReport() });
  toast('Bug report copied');
}

function BugReport() {
  return html`<${Hint} text=${TEXT.bugReportHelp} />
    <div class="btns">
      <${Button} text="Copy bug report" kind="primary" test="debug-bug-report" onClick=${copyReport} />
    </div>`;
}

export const bugReportSection = { id: 'bug-report', title: 'Bug report', Body: BugReport };
