// Tidying a layout's edits (ui/settings/profiles.js tidyProf): a profile that no longer differs from the layout file is
// forgotten, but one that holds the inputs hidden with the eye button (eye-button.js) is kept, or the keyboard would
// reappear in OBS after an unrelated change. Run with: node --test tests/ui/profiles-tidy.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setLayouts, setSettings, settings } from '../../ui/settings/state.js';
import { isCustom, tidyProf } from '../../ui/settings/profiles.js';

beforeEach(() => {
  setLayouts([{ id: 'mine', name: 'Mine', keys: [{ code: 'KeyW', x: 0, y: 0 }] }]);
  setSettings({ layout: { id: 'mine', profiles: {} } });
});

test('a profile with nothing left in it is forgotten', () => {
  settings.layout.profiles.mine = { disabledKeys: [], labels: {} };
  tidyProf();
  assert.deepEqual(settings.layout.profiles, {});
});

test('a profile that only hides inputs with the eye button is kept, and is not "customized"', () => {
  settings.layout.profiles.mine = { disabledKeys: [], labels: {}, hiddenInputs: ['keyboard'] };
  tidyProf();
  assert.deepEqual(settings.layout.profiles.mine.hiddenInputs, ['keyboard']);
  assert.equal(isCustom('mine'), false);
});
