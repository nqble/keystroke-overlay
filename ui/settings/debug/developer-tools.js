// =====================================================================================================================
//  "Developer tools": how to open the full browser inspector.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { call, toast } from '../helpers.js';
import { html } from '../html.js';
import { platform } from '../state.js';
import { inspectorTool } from '../system-words.js';
import { Button, Hint, TEXT } from './shared.js';

const INTRO = 'To inspect this window like a web page (elements, console, network):';
const COMMAND = 'set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222';
// per-system: these steps are for Windows and Linux only; a Mac gets TEXT.inspectorMacSteps
const EDGE_STEPS = [
  'Quit Keystroke Overlay (tray icon → Quit).', // per-system: Windows and Linux only
  'In a Command Prompt, run the line below, then start the app from that same window.',
  TEXT.inspectorStepEdge,
];

async function copyCommand() {
  await call('copy_text', { text: COMMAND });
  toast('Copied');
}

const Steps = ({ steps }) =>
  html`<ol class="dbg-steps">
    ${steps.map((step) => html`<li>${step}</li>`)}
  </ol>`;

function DeveloperTools() {
  // On a Mac the window is a WKWebView: Safari's inspector, in a development build, with no command to copy.
  if (inspectorTool(platform) === 'safari') {
    return html`<${Hint} text=${INTRO} /><${Steps} steps=${TEXT.inspectorMacSteps} /><${Hint}
        text=${TEXT.inspectorDeveloperNote}
      />`;
  }
  return html`<${Hint} text=${INTRO} />
    <${Steps} steps=${EDGE_STEPS} />
    <code class="dbg-cmd">${COMMAND}</code>
    <div class="btns"><${Button} text="Copy command" test="debug-copy-command" onClick=${copyCommand} /></div>
    <${Hint} text=${TEXT.inspectorDeveloperNote} />`;
}

export const developerTools = {
  id: 'developer-tools',
  title: 'Developer tools (full browser inspector)',
  Body: DeveloperTools,
};
