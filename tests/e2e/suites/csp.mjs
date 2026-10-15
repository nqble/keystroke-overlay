// Suite: the settings window's content-security policy. It must (1) really block code and pages we did not ship, and
// (2) never get in the way of the normal UI: walking every tab, dialogs, the live preview and an update check must
// produce zero policy violations.
import { connect, check, finish, sleep } from '../lib/cdp.mjs';

const p = await connect(); await sleep(3500);
await p.ev(`window.__csp = []; document.addEventListener('securitypolicyviolation', e => __csp.push(e.violatedDirective + ' ' + (e.blockedURI || 'inline')));`);
const violations = () => p.q(`window.__csp`);
const tab = async n => { await p.ev(`[...document.querySelectorAll('nav button')].find(b => b.textContent === '${n}').click()`); await sleep(300); };

// ---- normal use: no violations
for (const t of ['Layout', 'Keys', 'Style', 'Animation', 'Fonts', 'General', 'Layout']) await tab(t);
await p.ev(`document.querySelector('.card.add').click()`); await sleep(300);
// open and close the New layout dialog
await p.ev(`document.querySelector('#dFoot button').click()`); await sleep(200);
await p.ev(`document.getElementById('copyUrl').click()`); await sleep(200);
await p.ev(`document.querySelector('#dlg') && (document.getElementById('dlg').hidden = true)`);
// the live preview iframe (our own local server)
await p.ev(`frame.src = previewSrc()`); await sleep(2500);
check('normal use of every tab, dialogs and the live preview causes no policy violations', (await violations()).length === 0, JSON.stringify(await violations()));
check('the preview frame still loads under the policy', (await p.evIn('localhost:7879', `return document.querySelectorAll('.key').length`).catch(() => 0)) > 10);
check('inline styles (used by the UI) still work', await p.q(`(() => { const d = document.createElement('div'); d.setAttribute('style', 'width:37px'); document.body.append(d); const w = getComputedStyle(d).width; d.remove(); return w === '37px'; })()`));
check('the UI can still call the app (IPC)', (await p.invoke('get_state')).ok?.version !== undefined);

// ---- the policy must actually block foreign code
await p.ev(`window.__csp.length = 0; window.__hit = 0; const s = document.createElement('script'); s.textContent = 'window.__hit = 1'; document.head.append(s);`); await sleep(300);
check('an injected inline script is blocked', (await p.q(`window.__hit`)) === 0 && (await violations()).some(v => v.startsWith('script-src')));
await p.ev(`const s = document.createElement('script'); s.src = 'https://example.com/x.js'; document.head.append(s);`); await sleep(500);
check('a script from another website is blocked', (await violations()).some(v => v.includes('example.com')));
await p.ev(`const f = document.createElement('iframe'); f.src = 'https://example.com/'; document.body.append(f);`); await sleep(500);
check('embedding another website is blocked', (await violations()).some(v => v.startsWith('frame-src')));
await p.ev(`fetch('https://example.com/').catch(() => {})`); await sleep(500);
check('contacting another website from the page is blocked', (await violations()).some(v => v.startsWith('connect-src')));
await p.ev(`const o = document.createElement('object'); o.data = 'http://localhost:7879/'; document.body.append(o);`); await sleep(400);
check('plug-in style embeds (object) are blocked', (await violations()).some(v => v.startsWith('object-src') || v.startsWith('default-src')));
finish();
