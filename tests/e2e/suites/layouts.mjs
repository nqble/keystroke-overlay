// Suite: making and deleting layouts, the custom right-click menu, and "only inputs are selectable".
import { connect, check, finish, sleep, PORT } from '../lib/cdp.mjs';

const p = await connect(); await sleep(2000);
const tab = n => p.ev(`[...document.querySelectorAll('nav button')].find(b => b.textContent === '${n}').click()`);
const rightClick = sel => p.ev(`document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 400 }))`);
const cardOf = name => `(() => [...document.querySelectorAll('.card')].find(c => c.querySelector('b')?.textContent === ${JSON.stringify(name)}))()`;
const api = async () => (await (await fetch(`http://localhost:${PORT}/api/layouts`)).json());

await tab('Layout'); await sleep(400);
// ---- nothing is selectable except inputs
const sel = await p.q(`[getComputedStyle(document.querySelector('h2')).userSelect, getComputedStyle(document.querySelector('.card')).userSelect, getComputedStyle(document.getElementById('obsUrl')).userSelect]`);
check('labels / cards are not selectable, text boxes still are', sel[0] === 'none' && sel[1] === 'none' && sel[2] === 'text', sel.join(','));
// ---- browser menu is blocked everywhere
check('right-click on plain areas shows no menu at all', await p.q(`(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.getElementById('pane').dispatchEvent(e); return e.defaultPrevented && !document.querySelector('.ctxmenu'); })()`));
// ---- built-in layout: disabled explanation
await rightClick('.card');
check('right-click on a built-in layout offers only a disabled "can’t be deleted" note', await p.q(`(() => { const b = document.querySelectorAll('.ctxmenu button'); return b.length === 1 && b[0].disabled && /Built-in/.test(b[0].textContent); })()`));
await p.ev(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
check('clicking elsewhere closes the menu', await p.q(`!document.querySelector('.ctxmenu')`));
// ---- the dashed + card and the popup
check('a dashed "+" card comes last, with a 0/20 counter, and the old hint text is gone',
  await p.q(`(() => { const c = [...document.querySelectorAll('.cards > .card')]; const a = c[c.length - 1]; return a.classList.contains('add') && getComputedStyle(a).borderTopStyle === 'dashed' && a.innerText.includes('0/20') && !document.querySelector('.previewHint'); })()`));
const before = (await api()).length;
await p.ev(`document.querySelector('.card.add').click()`); await sleep(300);
check('clicking + opens the New layout popup', await p.q(`!document.getElementById('dlg').hidden && document.getElementById('dTitle').textContent === 'New layout'`));
await p.ev(`const i = document.querySelector('#dBody input'); i.value = 'My Board'; [...document.querySelectorAll('#dFoot button')].find(b => b.textContent === 'Create').click()`); await sleep(1200);
const after = await api(); const mine = after.find(l => l.name === 'My Board');
check('Create adds a copy of the full-size keyboard and closes the popup', after.length === before + 1 && mine && mine.keys.length === after.find(l => l.id === 'full').keys.length && await p.q(`document.getElementById('dlg').hidden`));
const st = (await p.invoke('get_state')).ok;
check('it is selected and the Keys tab opens so keys can be removed', st.settings.layout.id === mine?.id && /Keys/.test(await p.q(`document.querySelector('#pane h2').textContent`)));
// ---- delete through the right-click menu
await tab('Layout'); await sleep(400);
await p.ev(`${cardOf('My Board')}.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 400 }))`);
check('right-click on a user layout shows just "Delete layout"', await p.q(`(() => { const b = document.querySelectorAll('.ctxmenu button'); return b.length === 1 && b[0].textContent === 'Delete layout' && !b[0].disabled; })()`));
await p.ev(`document.querySelector('.ctxmenu button').click()`); await sleep(1200);
const gone = await api(); const st2 = (await p.invoke('get_state')).ok;
check('delete removes it, the selection falls back to a built-in, the card disappears', !gone.some(l => l.name === 'My Board') && st2.settings.layout.id === 'tkl' && !(await p.q(`!!${cardOf('My Board')}`)));
// ---- the 20 layout limit
for (let i = 0; i < 20; i++) await p.invoke('create_layout', { name: 'Fill ' + i });
await tab('Layout'); await sleep(400);
check('the counter reads 20/20', await p.q(`document.querySelector('.card.add').innerText.includes('20/20')`));
await p.ev(`document.querySelector('.card.add').click()`); await sleep(300);
check('at the limit, + shows a "Max layouts reached" popup', await p.q(`document.getElementById('dTitle').textContent === 'Max layouts reached'`));
check('the backend refuses a 21st layout too', /Max layouts/.test((await p.invoke('create_layout', { name: 'one too many' })).err || ''));
finish();
