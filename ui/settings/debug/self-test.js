// =====================================================================================================================
//  "Self-test": quick yes/no checks of everything the overlay needs.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { html, useState } from '../html.js';
import { runSelfTest } from './checks.js';
import { Button, Check, Hint, TEXT } from './shared.js';

function SelfTest() {
  const [results, setResults] = useState(null); // null: not run yet; 'running'; or the list of checks
  const run = async () => {
    setResults('running');
    setResults(await runSelfTest());
  };
  const list =
    results === 'running'
      ? html`<span class="hint">Running…</span>`
      : (results ?? []).map(
          (check) =>
            html`<${Check}
              ok=${check.ok}
              mark=${check.ok ? '✔' : '✖'}
              name=${check.name}
              detail=${check.detail}
              test="debug-test"
            />`,
        );
  return html`<${Hint} text=${TEXT.selfTestHelp} />
    <div class="btns"><${Button} text="Run self-test" kind="primary" test="debug-self-test-run" onClick=${run} /></div>
    <div class="dbg-tests">${list}</div>`;
}

export const selfTest = { id: 'self-test', title: 'Self-test', Body: SelfTest };
