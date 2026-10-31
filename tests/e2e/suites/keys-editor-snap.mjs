// Suite: the Keys tab's snap and grid switches, the drag readout and status line, keyboard use and screen-reader
// labels, the keyboard shortcuts, and saved sizes and the even-grid layout style showing up in the overlay.
// The test layout and the shared helpers are in ../lib/keys-editor-kit.mjs.
import { byTest, check, sleep, PORT, finish } from '../lib/cdp.mjs';
import {
  clearSelection,
  clickKey,
  drag,
  eventually,
  flip,
  id,
  keyCell,
  p,
  placeOf,
  press,
  pressOnPage,
  pressed,
  previewKey,
  profile,
  saveProfileEdits,
  selectedCodes,
  shapeEdits,
  state,
} from '../lib/keys-editor-kit.mjs';

// ---- snap and grid switches, drag readout and status line
const editorChoices = async () => (await state()).settings.layout.editor;
const choicesAre = async (snap, grid) => {
  const choices = await editorChoices();
  return choices.snap === snap && choices.grid === grid;
};
check(
  'the Keys tab starts with quarter-key snapping and no grid',
  await choicesAre(0.25, false),
  JSON.stringify(await editorChoices()),
);
check('the Snap switch is on and the Grid switch is off', (await pressed('key-snap')) && !(await pressed('key-grid')));
await clickKey('KeyD');
await sleep(300);
await flip('key-snap');
check(
  'switching Snap off is saved in the settings',
  (await editorChoices()).snap === 0,
  JSON.stringify(await editorChoices()),
);
const beforeFree = await placeOf('KeyD');
await drag('KeyD', 0.37, 0);
await sleep(600);
const afterFree = await placeOf('KeyD');
const moved = afterFree.x - beforeFree.x;
check(
  'with Snap off a drag can land between the grid steps',
  moved > 0.2 && moved < 0.5 && Math.abs(moved * 4 - Math.round(moved * 4)) > 0.05,
  JSON.stringify([beforeFree, afterFree]),
);
await pressOnPage('ArrowRight');
await sleep(500);
const afterFine = await placeOf('KeyD');
check(
  'with Snap off an arrow key moves a fine step (0.05)',
  Math.abs(afterFine.x - (afterFree.x + 0.05)) < 1e-6,
  JSON.stringify([afterFree, afterFine]),
);

await flip('key-snap');
await flip('key-grid');
check('switching Snap on and Grid on is saved', await choicesAre(0.25, true), JSON.stringify(await editorChoices()));
check(
  'the board draws grid dots at the snap spacing',
  await p.q(
    `(() => { const s = getComputedStyle(document.querySelector('${byTest('keymap-canvas')}'), '::before'); return s.backgroundImage.includes('radial-gradient') && parseFloat(s.backgroundSize) > 0; })()`,
  ),
);
await p.ev(`await __ko.resync()`);
await sleep(600);
check(
  'the switches come back after the window re-reads its settings',
  (await pressed('key-snap')) && (await pressed('key-grid')),
);

// while a key is being dragged a small label shows its position; it goes away when the key is dropped
const readoutDuring = await p.ev(`
  const n = document.querySelector('${keyCell('KeyW')}'), r = n.getBoundingClientRect(), board = document.querySelector('${byTest('keymap-canvas')}'), unit = board.getBoundingClientRect().width / Number(board.dataset.boardW);
  const ev = (t, x, y) => new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 11 });
  n.dispatchEvent(ev('pointerdown', r.left + 4, r.top + 4));
  n.dispatchEvent(ev('pointermove', r.left + 4 + unit, r.top + 4));
  const label = document.querySelector('${byTest('key-readout')}');
  return label ? label.textContent : null;`);
check(
  'a label with the key position follows a key while it is dragged',
  /^x [\d.-]+\s+y [\d.-]+$/.test(readoutDuring ?? ''),
  String(readoutDuring),
);
await p.ev(
  `document.querySelector('${keyCell('KeyW')}').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 11 }))`,
);
await sleep(600);
check(
  '...and it disappears when the key is dropped',
  (await p.q(`document.querySelectorAll('${byTest('key-readout')}').length`)) === 0,
);

await clickKey('KeyW');
await sleep(300);
const statusText = await p.q(`document.querySelector('${byTest('key-status')}').textContent`);
check('the toolbar shows how many keys are moved and hidden', /^\d+ moved · \d+ hidden/.test(statusText), statusText);
check(
  'the inspector shows the selected key position and width',
  await p.q(
    `document.querySelector('${byTest('key-x')}').value !== '' && document.querySelector('${byTest('key-width')}').value !== ''`,
  ),
);
await flip('key-grid');
check('snap and grid are put back for the rest of the suite', await choicesAre(0.25, false));

// ---- keyboard use and screen-reader labels
await clearSelection();
check(
  'every key is a tab stop with a button role and a spoken name',
  await p.q(
    `[...document.querySelectorAll('${byTest('key-cell')}')].every(n => n.tabIndex === 0 && n.getAttribute('role') === 'button' && n.getAttribute('aria-label').startsWith(n.dataset.code) && n.hasAttribute('aria-pressed'))`,
  ),
);
const pressOnKey = (code, extra = '') =>
  p.ev(
    `const n = document.querySelector('${keyCell(code)}'); n.focus(); n.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true${extra} }))`,
  );
await pressOnKey('KeyA');
await sleep(500);
check(
  'Enter on a focused key selects it and says so (aria-pressed)',
  JSON.stringify(await selectedCodes()) === '["KeyA"]' &&
    (await p.q(`document.querySelector('${keyCell('KeyA')}').getAttribute('aria-pressed')`)) === 'true',
);
check(
  'the keyboard focus stays on the key after the picture is redrawn',
  (await p.q(
    `document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.code : null`,
  )) === 'KeyA',
);
await pressOnKey('KeyS', ', ctrlKey: true');
await sleep(500);
check(
  'Ctrl+Enter on another key adds it to the selection',
  JSON.stringify(await selectedCodes()) === '["KeyA","KeyS"]',
);
check(
  'the spoken name says whether a key is selected',
  (await p.q(`document.querySelector('${keyCell('KeyA')}').getAttribute('aria-label')`)).includes('selected'),
);
check(
  'the toolbar groups are named for assistive technology',
  (await p.q(
    `[...document.querySelectorAll('${byTest('key-tool-group')}')].map(g => g.getAttribute('aria-label')).join('|')`,
  )) === 'History|View|Tidy',
);
check(
  'the status line is announced politely when it changes',
  (await p.q(`document.querySelector('${byTest('key-status')}').getAttribute('aria-live')`)) === 'polite',
);
await clearSelection();

// ---- keyboard shortcuts (Delete, Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y, Ctrl+A, Esc)
const hiddenKeys = async () => (await profile(id)).disabledKeys ?? [];
check(
  'the hint line lists the shortcuts',
  /Del/.test(await p.q(`document.querySelector('${byTest('keys-shortcut-hint')}').textContent`)) &&
    /Scroll/.test(await p.q(`document.querySelector('${byTest('keys-shortcut-hint')}').textContent`)) &&
    /Space \+ drag/.test(await p.q(`document.querySelector('${byTest('keys-shortcut-hint')}').textContent`)),
);
await clickKey('KeyD');
await sleep(400);
await press('Delete');
await sleep(600);
check('Delete hides the selected key', (await hiddenKeys()).includes('KeyD'));
await press('z', ', ctrlKey: true');
await sleep(600);
check('Ctrl+Z undoes it', !(await hiddenKeys()).includes('KeyD'));
await press('Z', ', ctrlKey: true, shiftKey: true');
await sleep(600);
check('Ctrl+Shift+Z redoes it', (await hiddenKeys()).includes('KeyD'));
await press('z', ', ctrlKey: true');
await sleep(600);
await press('y', ', ctrlKey: true');
await sleep(600);
check('Ctrl+Y also redoes', (await hiddenKeys()).includes('KeyD'));
await press('z', ', ctrlKey: true');
await sleep(600);
check('...and Ctrl+Z puts it back for the rest of the suite', !(await hiddenKeys()).includes('KeyD'));
await clickKey('KeyD');
await sleep(400);
await press('Delete', '', `document.querySelector('${byTest('key-label')}')`);
await sleep(500);
check('shortcuts are ignored while typing in the label field', !(await hiddenKeys()).includes('KeyD'));
await press('a', ', ctrlKey: true');
await sleep(500);
check(
  'Ctrl+A selects every key',
  (await selectedCodes()).length === (await p.q(`document.querySelectorAll('${byTest('key-cell')}').length`)),
);
await press('Escape');
await sleep(500);
check('Esc clears the selection', (await selectedCodes()).length === 0);

// ---- saved sizes and the even-grid layout style show up in the overlay (settings version 3)
const previewWidth = (code) =>
  p
    .evIn(
      `localhost:${PORT}`,
      `const e = document.querySelector('[data-code="${code}"]'); return e ? parseFloat(e.style.width) : null`,
    )
    .catch(() => null);
await saveProfileEdits({ styles: { shape: { sizes: { KeyW: { w: 3 } } } } });
const wide = await eventually(async () => {
  const [w, a] = [await previewWidth('KeyW'), await previewWidth('KeyA')];
  return { ok: !!w && !!a && Math.abs(w - (3 * (a + 6) - 6)) < 0.5, w, a };
});
check('a saved width makes the key wider in the overlay (3 keys wide)', wide.ok, JSON.stringify(wide));
check(
  'a saved width survives the app cleaning the settings',
  shapeEdits(await profile(id)).sizes?.KeyW?.w === 3,
  JSON.stringify(shapeEdits(await profile(id))),
);
await saveProfileEdits({ styles: { shape: { sizes: { KeyW: { w: 0.01 }, KeyA: { w: 1e9 }, KeyS: { w: 'wide' } } } } });
const cleanedSizes = shapeEdits(await profile(id)).sizes ?? {};
check(
  'hostile widths are clamped or dropped by the app',
  cleanedSizes.KeyW?.w === 0.25 && cleanedSizes.KeyA?.w === 100 && !cleanedSizes.KeyS,
  JSON.stringify(cleanedSizes),
);

await saveProfileEdits({ layoutStyle: 'grid' });
const gridLook = await eventually(async () => {
  const [a, s, space, aWidth] = [
    await previewKey('KeyA'),
    await previewKey('KeyS'),
    await previewWidth('Space'),
    await previewWidth('KeyA'),
  ];
  return {
    ok:
      !!a &&
      !!s &&
      !!space &&
      !!aWidth &&
      Math.abs(space - aWidth) < 0.5 &&
      Math.abs(s.left - a.left - (aWidth + 6)) < 0.5,
    a,
    s,
    space,
    aWidth,
  };
});
check('the even-grid style draws every key one key wide in neat columns', gridLook.ok, JSON.stringify(gridLook));
await saveProfileEdits({ layoutStyle: 'nonsense' });
check('an unknown layout style means the default shape', (await profile(id)).layoutStyle === undefined);
await saveProfileEdits({});

await p.invoke('delete_layout', { id });
finish();
