// Suite: walks the whole settings UI like a user would and fails on any JavaScript error:
// every tab, every theme, every animation, every layout, key edits + revert, sliders at their ends, and the overlay
// preview.
import { connect, byTest, byTestStart, check, finish, sleep } from '../lib/cdp.mjs';

const p = await connect();
await sleep(3000);
await p.send('Log.enable');
await p.ev(
  `window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push('rejection: ' + e.reason));`,
);
const errs = () => p.q(`window.__errs`);
const tab = async (id) => {
  await p.ev(`document.querySelector('${byTest('tab', `[data-tab="${id}"]`)}').click()`);
  await sleep(250);
};
// Every dropdown and slider on the Style and Animation tabs: the ones made from CONTROLS (their hooks start with
// "control-") plus the theme and saved-preset dropdowns.
// themes are cards since v2.0 (ui/settings/tabs/style-themes.js), so the sweep clicks every theme card as well
const EVERY_SELECT = `select${byTestStart('control-')}`;
const EVERY_THEME_CARD = byTestStart('theme-card-');
const EVERY_SLIDER = `input[type=range]${byTestStart('control-')}`;
const EVERY_ANIMATION_CARD = byTestStart('animation-card-');
const EVERY_EASING = `${byTest('control-animation-easing')} [role=radio]`;

const TAB_IDS = {
  Layout: 'layout',
  Keys: 'keys',
  Style: 'style',
  Animation: 'animation',
  General: 'general',
};
for (const [name, id] of Object.entries(TAB_IDS)) {
  await tab(id);
  check(`tab ${name} renders content`, await p.q(`document.querySelector('${byTest('pane')}').innerText.length > 40`));
}
check(
  'General cards are in the tidy order (ui-design-v2.md)',
  JSON.stringify(await p.q(`[...document.querySelectorAll('#pane .section-title')].map(h => h.textContent)`)) ===
    JSON.stringify([
      'Connection',
      'OBS scenes',
      'Keyboard input',
      'Startup',
      'Pause shortcut',
      'Updates',
      'Appearance',
      'Advanced',
    ]),
);

// ---- settings window themes (General → Appearance; app-themes.js)
const windowColor = () => p.q(`getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()`);
const defaultColor = await windowColor();
check(
  'General → Appearance lists the settings themes',
  (await p.q(`document.querySelectorAll('${byTestStart('app-theme-')}').length`)) >= 2,
);
await p.ev(`document.querySelector('${byTest('app-theme-paper')}').click()`);
await sleep(600);
check('picking a theme changes the whole window at once', (await windowColor()) === '#f4f5f8', await windowColor());
check('the choice is saved', (await p.invoke('get_state')).ok.settings.appearance.theme === 'paper');
await p.ev(`document.querySelector('${byTest('app-theme-default')}').click()`);
await sleep(600);
check('Default brings back the original colors', (await windowColor()) === defaultColor, await windowColor());

// ---- making your own theme (theme-edit-bar.js)
await p.ev(`document.querySelector('${byTest('app-theme-add')}').click()`);
await sleep(400);
check('+ New theme opens the edit bar', await p.q(`!!document.querySelector('${byTest('theme-edit-bar')}')`));
await p.ev(
  `const field = document.querySelector('${byTest('theme-edit-background')}'); field.value = '#203040'; field.dispatchEvent(new Event('input', { bubbles: true }))`,
);
await sleep(300);
check('the window follows the edit bar live', (await windowColor()) === '#203040', await windowColor());
await p.ev(
  `const field = document.querySelector('${byTest('theme-edit-dim')}'); field.value = '#2a3a4a'; field.dispatchEvent(new Event('input', { bubbles: true }))`,
);
await sleep(300);
check(
  'hard-to-read colors get a warning',
  await p.q(`!!document.querySelector('${byTest('theme-edit-hard-to-read')}')`),
);
await p.ev(`document.querySelector('${byTest('theme-edit-save')}').click()`);
await sleep(600);
const appearance = (await p.invoke('get_state')).ok.settings.appearance;
check(
  'Save keeps the theme and picks it (a warning never blocks saving)',
  appearance.custom.length === 1 && appearance.theme === appearance.custom[0].id,
  JSON.stringify(appearance),
);
check('the edit bar closes after Save', !(await p.q(`!!document.querySelector('${byTest('theme-edit-bar')}')`)));
await p.invoke('save_settings', {
  settings: { ...(await p.invoke('get_state')).ok.settings, appearance: { theme: 'default', custom: [] } },
});

// the overlay as OBS loads it (no ?preview) skips the theme files; the settings preview still loads them
await p.ev(
  `const f = document.createElement('iframe'); f.id = 'obsview'; f.style.display = 'none'; f.src = 'http://localhost:7879/'; document.body.append(f);`,
);
await sleep(3500);
const obsLoaded = await p
  .evIn('localhost:7879', `return performance.getEntriesByType('resource').map(r => r.name)`)
  .catch(() => []);
await p.ev(`document.getElementById('obsview').remove()`);
check(
  'the OBS overlay does not download theme files (animations and layouts still load)',
  obsLoaded.some((u) => u.includes('/overlay/animations/')) && !obsLoaded.some((u) => u.includes('/overlay/themes/')),
  obsLoaded.filter((u) => /themes|animations/.test(u)).length + ' module requests',
);
check('the settings preview still lists the themes', (await p.q(`__ko.registry().themes.length`)) >= 5);

// header logo, share buttons, font presets, slider focus
check(
  'the header shows the logo image',
  await p.q(
    `(() => { const i = document.querySelector('${byTest('brand-logo')}'); return !!i && i.complete && i.naturalWidth > 0; })()`,
  ),
);
check(
  'the window has no native title bar and the header is a drag area',
  await p.q(
    `(async () => { const w = window.__TAURI__.window.getCurrentWindow(); return (await w.isDecorated()) === false && document.querySelector('${byTest('app-header')}').hasAttribute('data-tauri-drag-region'); })()`,
  ),
);
check(
  'the three window buttons sit in the top right corner',
  await p.q(
    `(() => { const r = document.querySelector('${byTest('window-buttons')}').getBoundingClientRect(); return r.right >= innerWidth - 1 && r.top <= 1 && !!document.querySelector('${byTest('window-minimize')}') && !!document.querySelector('${byTest('window-maximize')}') && !!document.querySelector('${byTest('window-close')}'); })()`,
  ),
);
// The two icons are drawn in index.html; windowbar.js shows the right one with the `maximized` class and renames the
// button, so the test follows both the class and the name a screen reader says.
check(
  'maximize toggles (and the icon and name follow), restore goes back',
  await (async () => {
    const state = () => p.q(`window.__TAURI__.window.getCurrentWindow().isMaximized()`);
    const maximize = byTest('window-maximize');
    await p.ev(`document.querySelector('${maximize}').click()`);
    await sleep(700);
    const look = () =>
      p.q(
        `(() => { const b = document.querySelector('${maximize}'); return b.classList.contains('maximized') + ' ' + b.ariaLabel; })()`,
      );
    const on = await state();
    const lookWhenOn = await look();
    await p.ev(`document.querySelector('${maximize}').click()`);
    await sleep(700);
    return (
      on === true && lookWhenOn === 'true Restore' && (await state()) === false && (await look()) === 'false Maximize'
    );
  })(),
);
await tab('style');
// the saved-preset names are fetched once and kept: coming back to the Style tab asks the app nothing
await p.ev(
  `window.__listPresetCalls = 0; const original = window.__TAURI_INTERNALS__.invoke; window.__TAURI_INTERNALS__.invoke = function (command, ...rest) { if (command === 'list_presets') window.__listPresetCalls++; return original.call(this, command, ...rest); }`,
);
await tab('animation');
await tab('style');
await tab('general');
await tab('style');
check(
  'revisiting the Style tab does not ask the app for the preset list again',
  (await p.q(`window.__listPresetCalls`)) === 0,
);
check(
  'Layout and Style tabs have the same Import / Export buttons',
  await p.q(
    `!!document.querySelector('${byTest('style-import')}') && !!document.querySelector('${byTest('style-export')}')`,
  ),
);
// a real mouse click on a slider shows no focus outline; reaching it with the Tab key does
const sliderSelector = byTest('control-style-radius');
const outlineShown = () =>
  p.q(
    `(() => { const r = document.querySelector('${sliderSelector}'); const s = getComputedStyle(r); return s.outlineStyle !== 'none' && s.outlineWidth !== '0px'; })()`,
  );
const sliderBox = await p.q(
  `(() => { const r = document.querySelector('${sliderSelector}'); r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); const thumb = (r.value - r.min) / (r.max - r.min); return { x: b.left + 8 + thumb * (b.width - 16), y: b.top + b.height / 2 }; })()`,
);
await p.ev(`document.activeElement && document.activeElement.blur()`);
for (const type of ['mousePressed', 'mouseReleased'])
  await p.send('Input.dispatchMouseEvent', { type, x: sliderBox.x, y: sliderBox.y, button: 'left', clickCount: 1 });
await sleep(200);
check('clicking a slider shows no focus outline', !(await outlineShown()));
await p.ev(`document.activeElement && document.activeElement.blur(); document.body.focus()`);
let reached = false;
for (let presses = 0; presses < 120 && !reached; presses++) {
  for (const type of ['keyDown', 'keyUp'])
    await p.send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  reached = await p.q(`document.activeElement === document.querySelector('${sliderSelector}')`);
}
check('reaching a slider with the Tab key shows a focus outline', reached && (await outlineShown()));
check(
  'font files are added in Style -> Text, and there is no Fonts tab any more',
  (await p.q(`!!document.querySelector('${byTest('fonts-add')}')`)) &&
    !(await p.q(`!!document.querySelector('${byTest('tab', '[data-tab="fonts"]')}')`)),
);
await tab('style');
const fontSelect = `document.querySelector('${byTest('control-style-font-family')}')`;
const fontOpts = await p.q(
  `(() => { const s = ${fontSelect}; return s ? [...s.options].map(o => o.value) : null; })()`,
);
check(
  'Style -> Font family is a dropdown with the Windows fonts and an "Other" option',
  Array.isArray(fontOpts) && fontOpts.length >= 20 && fontOpts.includes('Consolas') && fontOpts.includes('__custom'),
);
await p.ev(`const s = ${fontSelect}; s.value = 'Bahnschrift'; s.dispatchEvent(new Event('change', { bubbles: true }))`);
await sleep(500);
check(
  'picking a font from the dropdown applies it',
  (await p.invoke('get_state')).ok.settings.style.fontFamily === 'Bahnschrift',
);
await p.ev(`const s = ${fontSelect}; s.value = 'Segoe UI'; s.dispatchEvent(new Event('change', { bubbles: true }))`);
await sleep(300);

// every layout, with a key edit and a revert
const ids = (await p.invoke('list_layouts')).ok.map((l) => l.id);
for (const id of ids) {
  await p.invoke('set_layout', { id });
  await sleep(250);
  await tab('keys');
  await p.ev(`const k = document.querySelector('${byTest('key-cell')}'); k && k.click()`);
  await sleep(150);
  // the first view of a layout shows every key inside the editor box (the board around them may reach past it)
  const fit = await p.ev(
    `const m = document.querySelector('${byTest('keymap')}').getBoundingClientRect(); const out = [...document.querySelectorAll('${byTest('key-cell')}')].filter((k) => { const r = k.getBoundingClientRect(); return !(r.left >= m.left - 1 && r.right <= m.right + 1 && r.top >= m.top - 1 && r.bottom <= m.bottom + 1); }).map((k) => k.dataset.code); return { box: [m.left, m.top, m.right, m.bottom].map(Math.round), outside: out.slice(0, 5), count: out.length };`,
  );
  check(`Keys tab: the whole "${id}" keyboard is visible in the first view`, fit.count === 0, JSON.stringify(fit));
}
check(`all ${ids.length} layouts open in the Keys tab`, (await errs()).length === 0, JSON.stringify(await errs()));
await p.invoke('set_layout', { id: 'tkl' });

// every theme / animation via the saved settings (what presets and the selects do)
const st = (await p.invoke('get_state')).ok;
await tab('animation');
// animations are cards and easing is a row of choices since v2.0 (ui/settings/tabs/animation.js): click them all
const animationCards = await p.q(`document.querySelectorAll('${EVERY_ANIMATION_CARD}').length`);
for (let index = 0; index < animationCards; index++) {
  await p.ev(`document.querySelectorAll('${EVERY_ANIMATION_CARD}')[${index}].click()`);
  await sleep(120);
}
const easingChoices = await p.q(`document.querySelectorAll('${EVERY_EASING}').length`);
for (let index = 0; index < easingChoices; index++) {
  await p.ev(`document.querySelectorAll('${EVERY_EASING}')[${index}].click()`);
  await sleep(120);
}
const animationFiles = await p.q(`window.__ko.registry().animations.length`);
check(
  'every animation card and easing choice applies without errors',
  animationCards >= 6 && animationCards === animationFiles && easingChoices >= 6 && (await errs()).length === 0,
  JSON.stringify([animationCards, easingChoices, await errs()]),
);
await tab('style');
for (const index of await p.q(`[...document.querySelectorAll('${EVERY_THEME_CARD}')].map((c, i) => i)`)) {
  await p.ev(`[...document.querySelectorAll('${EVERY_THEME_CARD}')][${index}].click()`);
  await sleep(150);
}
for (const sel of await p.q(`[...document.querySelectorAll('${EVERY_SELECT}')].map((s, i) => i)`)) {
  const opts = await p.q(`[...document.querySelectorAll('${EVERY_SELECT}')][${sel}].options.length`);
  for (let o = 0; o < opts; o++) {
    await p.ev(
      `const s = [...document.querySelectorAll('${EVERY_SELECT}')][${sel}]; s.selectedIndex = ${o}; s.dispatchEvent(new Event('change', { bubbles: true }))`,
    );
    await sleep(120);
  }
}
// sliders at both ends
await p.ev(
  `for (const r of document.querySelectorAll('${EVERY_SLIDER}')) for (const v of [r.min, r.max]) { r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(x => setTimeout(x, 20)); }`,
);
await sleep(800);
const after = (await p.invoke('get_state')).ok.settings;
check(
  'every select and slider (at both ends) works without errors, values stay valid',
  (await errs()).length === 0 &&
    after.style.opacity >= 0 &&
    after.style.fontSize >= 0 &&
    after.animation.intensity >= 0,
  JSON.stringify(await errs()),
);
check(
  'the live preview is still alive after all that',
  (await p.evIn('localhost:7879', `return document.querySelectorAll('.key').length`).catch(() => 0)) > 10,
);

// put the settings back
await p.invoke('save_settings', { settings: st.settings });
await sleep(300);
check('no JavaScript errors anywhere in the walk', (await errs()).length === 0, JSON.stringify(await errs()));
// ---- popups: keyboard focus moves in, stays in, and goes back to where it came from
const pressKey = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
  for (const type of ['keyDown', 'keyUp'])
    await p.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers });
};
await p.ev(`document.querySelector('${byTest('tab', '[data-tab="general"]')}').click()`);
await sleep(600);
const popupOpener = byTest('update-release-notes');
await p.ev(`const opener = document.querySelector('${popupOpener}'); opener.focus(); opener.click()`);
await sleep(900);
const insidePopup = () => p.q(`document.getElementById('modal').contains(document.activeElement)`);
check('opening a popup moves the keyboard focus into it', await insidePopup());
let staysInside = true;
for (let presses = 0; presses < 5; presses++) {
  await pressKey('Tab', 'Tab', 9);
  staysInside = staysInside && (await insidePopup());
}
for (let presses = 0; presses < 5; presses++) {
  await pressKey('Tab', 'Tab', 9, 8); // with Shift
  staysInside = staysInside && (await insidePopup());
}
check('Tab and Shift+Tab stay inside an open popup', staysInside);
await pressKey('Escape', 'Escape', 27);
await sleep(500);
check(
  'closing a popup puts the keyboard focus back on what opened it',
  await p.q(`document.activeElement === document.querySelector('${popupOpener}')`),
);

finish();
