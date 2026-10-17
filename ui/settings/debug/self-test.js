// =====================================================================================================================
//  "Self-test": quick yes/no checks of everything the overlay needs.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { button, el, note } from '../helpers.js';
import { TEXT } from './shared.js';
import { runSelfTest } from './checks.js';

export const selfTest = {
  id: 'self-test',
  title: 'Self-test',
  build() {
    const results = el('div', { className: 'dbg-tests' });
    const run = async () => {
      results.replaceChildren(el('span', { className: 'hint', textContent: 'Running…' }));
      const tests = await runSelfTest();
      results.replaceChildren(
        ...tests.map((testResult) =>
          el(
            'div',
            { className: 'dbg-test ' + (testResult.ok ? 'good' : 'bad'), test: 'debug-test' },
            el('b', { textContent: testResult.ok ? '✔' : '✖' }),
            el('span', { textContent: testResult.name }),
            el('i', { textContent: testResult.detail }),
          ),
        ),
      );
    };
    return [
      note(TEXT.selfTestHelp),
      el('div', { className: 'btns' }, button('Run self-test', run, 'primary', 'debug-self-test-run')),
      results,
    ];
  },
};
