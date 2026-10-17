// =====================================================================================================================
//  "Settings (raw)": the settings as the app holds them, editable to try odd values.
//  Part of the Debug tab (debug/index.js lists every section). PRIVACY: nothing here is saved or sent anywhere.
// =====================================================================================================================
import { flatten, redactSettings } from '../debug-report.js';
import { button, call, el, invoke, note, toast } from '../helpers.js';
import { resync } from '../messages.js';
import { settings } from '../state.js';
import { TEXT } from './shared.js';

export const rawSettings = {
  id: 'raw-settings',
  title: 'Settings (raw)',
  build() {
    const box = el('textarea', {
      className: 'dbg-json',
      test: 'debug-json',
      spellcheck: false,
      value: JSON.stringify(redactSettings(settings), null, 2),
    });
    const result = el('div', { className: 'dbg-tests', test: 'debug-raw-result' });
    const apply = async () => {
      let typed;
      try {
        typed = JSON.parse(box.value);
      } catch (e) {
        toast('That is not valid JSON: ' + e.message, true);
        return;
      }
      try {
        await invoke('save_settings', { settings: typed });
      } catch (e) {
        toast(String(e), true);
        return;
      }
      const kept = (await invoke('get_state')).settings;
      const before = flatten(typed),
        after = flatten(kept);
      const changes = Object.keys(after).filter((k) => before[k] !== after[k] && k !== 'general.linkKey');
      await resync();
      box.value = JSON.stringify(redactSettings(settings), null, 2);
      result.replaceChildren(
        el(
          'div',
          { className: 'dbg-test ' + (changes.length ? 'bad' : 'good') },
          el('b', { textContent: changes.length ? '!' : '✔' }),
          el('span', {
            textContent: changes.length
              ? `The app corrected ${changes.length} value(s) you typed:`
              : 'Applied exactly as typed.',
          }),
        ),
        ...changes
          .slice(0, 20)
          .map((settingPath) =>
            el(
              'div',
              { className: 'dbg-test' },
              el('b'),
              el('span', { textContent: settingPath }),
              el('i', { textContent: `typed ${before[settingPath] ?? '(missing)'}  →  kept ${after[settingPath]}` }),
            ),
          ),
      );
    };
    return [
      note(TEXT.rawSettingsHelp),
      box,
      el(
        'div',
        { className: 'btns' },
        button('Apply', apply, 'primary', 'debug-raw-apply'),
        button(
          'Reload from app',
          async () => {
            await resync();
            box.value = JSON.stringify(redactSettings(settings), null, 2);
            result.replaceChildren();
          },
          '',
          'debug-raw-reload',
        ),
        button(
          'Copy',
          async () => {
            await call('copy_text', { text: box.value });
            toast('Settings copied');
          },
          '',
          'debug-raw-copy',
        ),
      ),
      result,
    ];
  },
};
