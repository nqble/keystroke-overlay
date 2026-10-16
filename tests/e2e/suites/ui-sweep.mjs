// Suite: walks the whole settings UI like a user would and fails on any JavaScript error:
// every tab, every theme, every animation, every layout, key edits + revert, sliders at their ends, and the overlay
// preview.
import { connect, byTest, byTestStart, check, finish, sleep } from '../lib/cdp.mjs';

const p = await connect();
await sleep(3000);
const errors = [];
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
const EVERY_SELECT = `select${byTestStart('control-')}, ${byTest('style-theme')}, ${byTest('preset-select')}`;
const EVERY_SLIDER = `input[type=range]${byTestStart('control-')}`;

const TAB_IDS = {
  Layout: 'layout',
  Keys: 'keys',
  Style: 'style',
  Animation: 'animation',
  Fonts: 'fonts',
  General: 'general',
};
for (const [name, id] of Object.entries(TAB_IDS)) {
  await tab(id);
  check(`tab ${name} renders content`, await p.q(`document.querySelector('${byTest('pane')}').innerText.length > 40`));
}
check(
  'General sections are in the tidy order',
  JSON.stringify(
    await p.q(`[...document.querySelectorAll('${byTest('section-heading')}')].map(h => h.textContent)`),
  ) === JSON.stringify(['OBS', 'Server', 'Secure link', 'Keyboard input', 'App', 'Program updates']),
);

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
check(
  'maximize toggles (and the glyph follows), restore goes back',
  await (async () => {
    const state = () => p.q(`window.__TAURI__.window.getCurrentWindow().isMaximized()`);
    const maximize = byTest('window-maximize');
    await p.ev(`document.querySelector('${maximize}').click()`);
    await sleep(700);
    const on = await state(),
      glyph1 = await p.q(`document.querySelector('${maximize}').textContent.charCodeAt(0).toString(16)`);
    await p.ev(`document.querySelector('${maximize}').click()`);
    await sleep(700);
    return (
      on === true &&
      glyph1 === 'e923' &&
      (await state()) === false &&
      (await p.q(`document.querySelector('${maximize}').textContent.charCodeAt(0).toString(16)`)) === 'e922'
    );
  })(),
);
await tab('style');
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
  'the Fonts tab no longer has presets',
  await (async () => {
    await tab('fonts');
    return !(await p.q(`!!document.querySelector('.fpre')`));
  })(),
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
  const fit = await p.q(
    `(() => { const m = document.querySelector('${byTest('keymap')}'); return m.scrollWidth <= m.clientWidth + 1 && m.scrollHeight <= m.clientHeight + 1; })()`,
  );
  check(`Keys tab: the whole "${id}" keyboard fits its box (no scrolling)`, fit);
}
check(`all ${ids.length} layouts open in the Keys tab`, (await errs()).length === 0, JSON.stringify(await errs()));
await p.invoke('set_layout', { id: 'tkl' });

// every theme / animation via the saved settings (what presets and the selects do)
const st = (await p.invoke('get_state')).ok;
await tab('animation');
const anims = await p.q(
  `[...document.querySelectorAll('${EVERY_SELECT}')].flatMap(s => [...s.options].map(o => o.value))`,
);
for (const sel of await p.q(`[...document.querySelectorAll('${EVERY_SELECT}')].map((s, i) => i)`)) {
  const opts = await p.q(`[...document.querySelectorAll('${EVERY_SELECT}')][${sel}].options.length`);
  for (let o = 0; o < opts; o++) {
    await p.ev(
      `const s = [...document.querySelectorAll('${EVERY_SELECT}')][${sel}]; s.selectedIndex = ${o}; s.dispatchEvent(new Event('change', { bubbles: true }))`,
    );
    await sleep(120);
  }
}
check(
  'every animation / easing option applies without errors',
  (await errs()).length === 0,
  JSON.stringify(await errs()),
);
await tab('style');
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
