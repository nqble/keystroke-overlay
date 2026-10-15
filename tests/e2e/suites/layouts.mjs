// Suite: making and deleting layouts, the custom right-click menu, and "only inputs are selectable".
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
  `[getComputedStyle(document.querySelector('${byTest('section-heading')}')).userSelect, getComputedStyle(document.querySelector('${byTest('layout-card')}')).userSelect, getComputedStyle(document.querySelector('${byTest('obs-url')}')).userSelect]`,
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
// ---- built-in layout: disabled explanation
await rightClick(byTest('layout-card'));
check(
  'right-click on a built-in layout offers only a disabled "can’t be deleted" note',
  await p.q(
    `(() => { const b = document.querySelectorAll('${byTest('context-menu-item')}'); return b.length === 1 && b[0].disabled && /Built-in/.test(b[0].textContent); })()`,
  ),
);
await p.ev(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
check('clicking elsewhere closes the menu', await p.q(`!document.querySelector('${byTest('context-menu')}')`));
// ---- the dashed + card and the popup
check(
  'a dashed "+" card comes last, with a 0/20 counter, and the old hint text is gone',
  await p.q(
    `(() => { const a = document.querySelector('${byTest('layout-add')}'); return a.parentElement.lastElementChild === a && getComputedStyle(a).borderTopStyle === 'dashed' && a.innerText.includes('0/20') && !document.querySelector('.previewHint'); })()`,
  ),
);
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
  'right-click on a user layout shows just "Delete layout"',
  await p.q(
    `(() => { const b = document.querySelectorAll('${byTest('context-menu-item')}'); return b.length === 1 && b[0].textContent === 'Delete layout' && !b[0].disabled; })()`,
  ),
);
await p.ev(`document.querySelector('${byTest('context-menu-item')}').click()`);
await sleep(1200);
const gone = await api();
const st2 = (await p.invoke('get_state')).ok;
check(
  'delete removes it, the selection falls back to a built-in, the card disappears',
  !gone.some((l) => l.name === 'My Board') && st2.settings.layout.id === 'tkl' && !(await p.q(`!!${cardOf(mine.id)}`)),
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
  'Reset restores defaults (style, animation, secure link off, plain link)',
  R.settings.style.radius === 8 &&
    R.settings.style.opacity === 1 &&
    R.settings.animation.speed === 120 &&
    R.secureLink === false &&
    R.url === 'http://localhost:7879/',
  JSON.stringify([R.settings.style.radius, R.secureLink, R.url]),
);
check('Reset keeps the layouts you made', (await api()).some((l) => l.id === keep) && R.settings.layout.id === 'tkl');
await p.invoke('delete_layout', { id: keep });

// ---- the 20 layout limit
for (let i = 0; i < 20; i++) await p.invoke('create_layout', { name: 'Fill ' + i });
await tab('layout');
await sleep(400);
check(
  'the counter reads 20/20',
  await p.q(`document.querySelector('${byTest('layout-add')}').innerText.includes('20/20')`),
);
await p.ev(`document.querySelector('${byTest('layout-add')}').click()`);
await sleep(300);
check(
  'at the limit, + shows a "Max layouts reached" popup',
  await p.q(`document.querySelector('${byTest('dialog-title')}').textContent === 'Max layouts reached'`),
);
check(
  'the backend refuses a 21st layout too',
  /Max layouts/.test((await p.invoke('create_layout', { name: 'one too many' })).err || ''),
);
finish();
