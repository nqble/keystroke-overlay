// Suite: making, deleting, hiding and moving layouts, the custom right-click menu, and "only inputs are selectable".
import { connect, byTest, check, finish, sleep, PORT } from '../lib/cdp.mjs';

const p = await connect();
await sleep(2000);
const tab = (id) => p.ev(`document.querySelector('${byTest('tab', `[data-tab="${id}"]`)}').click()`);
const rightClick = (sel) =>
  p.ev(
    `document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 400 }))`,
  );
const cardOf = (layoutId) => `document.querySelector('${byTest('layout-card', `[data-layout-id="${layoutId}"]`)}')`;
const api = async () => await (await fetch(`http://localhost:${PORT}/api/layouts`)).json();

await tab('layout');
await sleep(400);
// ---- nothing is selectable except inputs
const sel = await p.q(
  `[getComputedStyle(document.querySelector('${byTest('section-heading')}')).userSelect, getComputedStyle(document.querySelector('${byTest('layout-card')}')).userSelect, (() => { const box = document.createElement('input'); document.body.append(box); const value = getComputedStyle(box).userSelect; box.remove(); return value; })()]`,
);
check(
  'labels / cards are not selectable, text boxes still are',
  sel[0] === 'none' && sel[1] === 'none' && sel[2] === 'text',
  sel.join(','),
);
// ---- browser menu is blocked everywhere
check(
  'right-click on plain areas shows no menu at all',
  await p.q(
    `(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.querySelector('${byTest('pane')}').dispatchEvent(e); return e.defaultPrevented && !document.querySelector('${byTest('context-menu')}'); })()`,
  ),
);
// ---- built-in layout: move and hide
const menuLabels = () =>
  p.q(
    `[...document.querySelectorAll('${byTest('context-menu-item')}')].map((b) => b.textContent + (b.disabled ? ' (off)' : '')).join()`,
  );
await rightClick(byTest('layout-card'));
check(
  'right-click on the first built-in layout offers Move left (off), Move right and Hide',
  (await menuLabels()) === 'Move left (off),Move right,Hide',
  await menuLabels(),
);
await p.ev(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
check('clicking elsewhere closes the menu', await p.q(`!document.querySelector('${byTest('context-menu')}')`));
// ---- the dashed + card and the popup
check(
  'a dashed "+ New layout" card comes last, the heading counts 0 / 20, and the old hint text is gone',
  await p.q(
    `(() => { const a = document.querySelector('${byTest('layout-add')}'); return a.parentElement.lastElementChild === a && getComputedStyle(a).borderTopStyle === 'dashed' && document.querySelector('${byTest('layout-count')}').textContent === 'Your layouts: 0 / 20' && !document.querySelector('.previewHint'); })()`,
  ),
);
// ---- Alt+→ moves a card, and the order is saved
await p.ev(`${cardOf('full')}.focus()`);
await p.send('Input.dispatchKeyEvent', {
  type: 'rawKeyDown',
  key: 'ArrowRight',
  code: 'ArrowRight',
  windowsVirtualKeyCode: 39,
  modifiers: 1,
});
await p.send('Input.dispatchKeyEvent', {
  type: 'keyUp',
  key: 'ArrowRight',
  code: 'ArrowRight',
  windowsVirtualKeyCode: 39,
  modifiers: 1,
});
await sleep(1200);
const moved = (await p.invoke('get_state')).ok.settings.layout.order;
check(
  'Alt+→ moves Full size one place right, saves the order and keeps focus on it',
  moved.slice(0, 2).join() === 'tkl,full' && (await p.q(`document.activeElement === ${cardOf('full')}`)),
  moved.join(),
);
// ---- drag a card with the mouse: real mouse events through the browser's input (CDP), as a person would
const centerOf = (layoutId) =>
  p.q(
    `(() => { const r = ${cardOf(layoutId)}.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.left]; })()`,
  );
const mouse = (type, x, y) =>
  p.send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: 'left',
    buttons: type === 'mouseReleased' ? 0 : 1,
    clickCount: 1,
  });
const [fromX, fromY] = await centerOf('full'); // Full size is second now (tkl, full, ...)
const [, , firstLeft] = await centerOf('tkl');
const pickedBefore = (await p.invoke('get_state')).ok.settings.layout.id;
await mouse('mousePressed', fromX, fromY);
for (const step of [0.25, 0.5, 0.75, 1]) {
  await mouse('mouseMoved', fromX + (firstLeft + 4 - fromX) * step, fromY);
  await sleep(60);
}
check(
  'while a card is dragged, a line shows where it will land',
  await p.q(`!!document.querySelector('[data-test="layout-cards"] .drop-line')`),
);
await mouse('mouseReleased', firstLeft + 4, fromY);
await sleep(1200);
const dragged = (await p.invoke('get_state')).ok.settings.layout.order;
check(
  'dragging Full size before TKL saves the new order, and the drop does not pick the layout',
  dragged.slice(0, 2).join() === 'full,tkl' && (await p.invoke('get_state')).ok.settings.layout.id === pickedBefore,
  `${dragged.join()} (picked: ${pickedBefore})`,
);
// ---- Hide a built-in, then add it back from New layout's Built-in
await rightClick(`[data-test="layout-card"][data-layout-id="gameplay"]`);
await p.ev(
  `[...document.querySelectorAll('${byTest('context-menu-item')}')].find((b) => b.textContent === 'Hide').click()`,
);
await sleep(1200);
check('Hide takes the card off the tab', !(await p.q(`!!${cardOf('gameplay')}`)));
await p.ev(`document.querySelector('${byTest('layout-add')}').click()`);
await sleep(300);
await p.ev(`document.querySelector('${byTest('new-layout-built-in')}').click()`);
await sleep(300);
await p.ev(
  `document.querySelector('[data-test="other-layouts"] [data-layout-id="gameplay"] ${byTest('other-layout-add')}').click()`,
);
await sleep(1200);
const back = (await p.invoke('get_state')).ok.settings.layout.order;
check(
  'Built-in → Add puts it back at the end',
  back[back.length - 1] === 'gameplay' && (await p.q(`!!${cardOf('gameplay')}`)),
  back.join(),
);
await p.invoke('save_settings', {
  settings: {
    ...(await p.invoke('get_state')).ok.settings,
    layout: { ...(await p.invoke('get_state')).ok.settings.layout, order: ['full', 'tkl', 'gameplay', 'wasd'] },
  },
});
// ---- a small dot marks a layout with key edits (hidden keys, labels, moves); a plain layout has none
const dotOn = (layoutId) => p.q(`!!${cardOf(layoutId)}.querySelector('${byTest('custom-dot')}')`);
const plain = (await p.invoke('get_state')).ok.settings;
await p.invoke('save_settings', {
  settings: {
    ...plain,
    layout: { ...plain.layout, profiles: { ...plain.layout.profiles, wasd: { disabledKeys: ['KeyW'] } } },
  },
});
await p.ev(`await __ko.resync()`);
await tab('layout');
await sleep(400);
check('a layout with a hidden key shows the customized dot', await dotOn('wasd'));
check('a layout with no edits has no dot', !(await dotOn('gameplay')));
check(
  'the dot has a name a screen reader can say',
  (await p.q(`${cardOf('wasd')}.querySelector('${byTest('custom-dot')}').getAttribute('aria-label')`)) === 'Customized',
);
await p.invoke('save_settings', { settings: plain });
await p.ev(`await __ko.resync()`);
await tab('layout');
await sleep(400);
const before = (await api()).length;
await p.ev(`document.querySelector('${byTest('layout-add')}').click()`);
await sleep(300);
check(
  'clicking + opens the New layout popup',
  await p.q(
    `!document.querySelector('${byTest('dialog')}').hidden && document.querySelector('${byTest('dialog-title')}').textContent === 'New layout'`,
  ),
);
await p.ev(
  `const i = document.querySelector('${byTest('dialog-layout-name')}'); i.value = 'My Board'; document.querySelector('${byTest('dialog-create')}').click()`,
);
await sleep(1200);
const after = await api();
const mine = after.find((l) => l.name === 'My Board');
check(
  'Create adds a copy of the full-size keyboard and closes the popup',
  after.length === before + 1 &&
    mine &&
    mine.keys.length === after.find((l) => l.id === 'full').keys.length &&
    (await p.q(`document.querySelector('${byTest('dialog')}').hidden`)),
);
const st = (await p.invoke('get_state')).ok;
check(
  'it is selected and the Keys tab opens so keys can be removed',
  st.settings.layout.id === mine?.id &&
    /Keys/.test(await p.q(`document.querySelector('${byTest('section-heading')}').textContent`)),
);
// ---- delete through the right-click menu
await tab('layout');
await sleep(400);
await p.ev(
  `${cardOf(mine.id)}.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 400 }))`,
);
check(
  'right-click on your own (last) layout offers Move left, Move right (off) and Delete…',
  (await menuLabels()) === 'Move left,Move right (off),Delete…',
  await menuLabels(),
);
await p.ev(
  `[...document.querySelectorAll('${byTest('context-menu-item')}')].find((b) => b.textContent === 'Delete…').click()`,
);
await sleep(300);
check(
  'Delete… asks first, and Cancel keeps the layout',
  await p.q(`document.querySelector('${byTest('dialog-title')}').textContent === 'Delete My Board?'`),
);
await p.ev(`document.querySelector('${byTest('dialog-cancel')}').click()`);
await sleep(800);
check(
  '…the layout is still there',
  (await api()).some((l) => l.name === 'My Board'),
);
await rightClick(`[data-test="layout-card"][data-layout-id="${mine.id}"]`);
await p.ev(
  `[...document.querySelectorAll('${byTest('context-menu-item')}')].find((b) => b.textContent === 'Delete…').click()`,
);
await sleep(300);
await p.ev(`document.querySelector('${byTest('dialog-delete')}').click()`);
await sleep(1200);
const gone = await api();
const st2 = (await p.invoke('get_state')).ok;
check(
  'Delete removes it, the selection moves to the first card, the card disappears',
  !gone.some((l) => l.name === 'My Board') && st2.settings.layout.id === 'full' && !(await p.q(`!!${cardOf(mine.id)}`)),
  st2.settings.layout.id,
);
// ---- the keyboard works on layout cards and the delete menu
const pressKey = async (key, code, windowsVirtualKeyCode) => {
  await p.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode });
  // a real Enter press also produces a "character" event, which is what "presses" a focused button
  if (key === 'Enter')
    await p.send('Input.dispatchKeyEvent', { type: 'char', text: '\r', key, code, windowsVirtualKeyCode });
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
};
const boardId = (await p.invoke('create_layout', { name: 'Keyboard Test' })).ok;
await p.ev(`await __ko.resync()`);
await tab('layout');
await sleep(600);
const boardCard = cardOf(boardId);
await p.ev(`${boardCard}.focus()`);
check(
  'a layout card is a real button that the keyboard can reach',
  await p.q(`${boardCard}.tagName === 'BUTTON' && document.activeElement === ${boardCard}`),
);
check(
  'cards say which layout is picked (aria-pressed)',
  await p.q(
    `[...document.querySelectorAll('${byTest('layout-card')}')].every((card) => (card.getAttribute('aria-pressed') === 'true') === card.classList.contains('sel'))`,
  ),
);
// what the Menu key does on a focused card: a context menu event at the card (a real Menu key press is handled by the browser itself)
await p.ev(
  `const box = ${boardCard}.getBoundingClientRect(); ${boardCard}.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 20 }))`,
);
await sleep(300);
check(
  'the menu takes keyboard focus on its first item',
  await p.q(`document.activeElement === document.querySelector('${byTest('context-menu-item')}')`),
);
await pressKey('Escape', 'Escape', 27);
await sleep(300);
check(
  'Esc closes the menu and gives focus back to the card',
  await p.q(`!document.querySelector('${byTest('context-menu')}') && document.activeElement === ${boardCard}`),
);
await p.ev(
  `const box = ${boardCard}.getBoundingClientRect(); ${boardCard}.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 20 }))`,
);
await sleep(300);
// the card is last, so its menu is Move left, Move right (off), Delete…: one step down skips the grayed-out item
await pressKey('ArrowDown', 'ArrowDown', 40);
await pressKey('Enter', 'Enter', 13);
await sleep(300);
await p.ev(`document.querySelector('${byTest('dialog-delete')}').focus()`);
await pressKey('Enter', 'Enter', 13);
await sleep(1200);
check(
  'Delete… then Enter deletes it, without touching the mouse',
  !(await api()).some((l) => l.name === 'Keyboard Test') && !(await p.q(`!!${boardCard}`)),
);

// ---- reset all settings (keeps layouts), and the Export / Import buttons exist
await tab('layout');
await sleep(300);
check(
  'Layout tab has Import and Export buttons',
  await p.q(
    `!!document.querySelector('${byTest('layout-import')}') && !!document.querySelector('${byTest('layout-export')}')`,
  ),
);
const keep = (await p.invoke('create_layout', { name: 'Keep Me' })).ok;
const S1 = (await p.invoke('get_state')).ok.settings;
await p.invoke('save_settings', {
  settings: { ...S1, style: { ...S1.style, radius: 33, opacity: 0.4 }, animation: { ...S1.animation, speed: 400 } },
});
await p.invoke('set_secure_link', { enabled: true });
await sleep(1500);
await tab('general');
await sleep(300);
await p.ev(`document.querySelector('${byTest('general-reset')}').click()`);
await sleep(300);
check(
  'Reset opens a confirmation popup in the shared dialog style',
  await p.q(
    `!document.querySelector('${byTest('dialog')}').hidden && document.querySelector('${byTest('dialog-title')}').textContent === 'Reset all settings?'`,
  ),
);
await p.ev(`document.querySelector('${byTest('dialog-cancel')}').click()`);
await sleep(200);
check('Cancel changes nothing', (await p.invoke('get_state')).ok.settings.style.radius === 33);
await p.ev(`document.querySelector('${byTest('general-reset')}').click()`);
await sleep(300);
await p.ev(`document.querySelector('${byTest('dialog-reset-confirm')}').click()`);
await sleep(2500);
const R = (await p.invoke('get_state')).ok;
check(
  'Reset restores defaults (style, animation) and keeps the secure link and port as they were',
  R.settings.style.radius === 8 &&
    R.settings.style.opacity === 1 &&
    R.settings.animation.speed === 120 &&
    R.secureLink === true && // the suite switched it on above; a reset keeps it
    R.url.startsWith('http://localhost:7879/?key='),
  JSON.stringify([R.settings.style.radius, R.secureLink, R.url]),
);
await p.invoke('set_secure_link', { enabled: false }); // the rest of the suite reads the plain address
check('Reset keeps the layouts you made', (await api()).some((l) => l.id === keep) && R.settings.layout.id === 'tkl');
await p.invoke('delete_layout', { id: keep });

// ---- the 20 layout limit
for (let i = 0; i < 20; i++) await p.invoke('create_layout', { name: 'Fill ' + i });
await tab('layout');
await sleep(400);
check(
  'the counter reads 20 / 20',
  await p.q(`document.querySelector('${byTest('layout-count')}').textContent === 'Your layouts: 20 / 20'`),
);
await p.ev(`document.querySelector('${byTest('layout-add')}').click()`);
await sleep(300);
check(
  'at the limit, New layout says so instead of asking for a name (built-ins can still be added)',
  await p.q(
    `/the most allowed/.test(document.querySelector('${byTest('dialog')}').textContent) && !document.querySelector('${byTest('dialog-layout-name')}')`,
  ),
);
check(
  'the backend refuses a 21st layout too',
  /Max layouts/.test((await p.invoke('create_layout', { name: 'one too many' })).err || ''),
);
finish();
