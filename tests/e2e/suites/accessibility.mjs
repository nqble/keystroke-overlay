// Suite: accessibility checks with axe-core in the real settings window. It enforces the two basics from
// docs/ACCESSIBILITY.md that lock people out when missed (everything clickable has a name a screen reader can say, and
// can be reached with the keyboard); everything else axe finds (contrast and the rest) is printed as advice, because
// the guide makes those "aim for", never a gate.
// Screens: every tab, the Keys tab with one key selected, and the new-layout popup. Add a screen to SCREENS.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { connect, byTest, check, finish, sleep } from '../lib/cdp.mjs';

const AXE_SOURCE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// The axe rules behind the two basics. A violation of one of these fails the suite.
const BASIC_RULES = new Set([
  'button-name',
  'link-name',
  'label',
  'select-name',
  'input-button-name',
  'aria-command-name',
  'aria-input-field-name',
  'aria-toggle-field-name',
  'image-alt',
  'frame-title',
  'nested-interactive',
  'scrollable-region-focusable',
  'aria-allowed-attr',
  'aria-required-attr',
  'aria-valid-attr',
  'aria-valid-attr-value',
  'aria-hidden-focus',
]);

// Basic-rule findings accepted on purpose, as 'rule-id': 'why'. Keep this empty unless there's a real reason.
const ACCEPTED = {};

const p = await connect();
await sleep(3500); // let the window and the preview frame finish loading
await p.send('Runtime.evaluate', { expression: AXE_SOURCE });

const openTab = async (tab) => {
  await p.ev(`document.querySelector('${byTest('tab', `[data-tab="${tab}"]`)}').click()`);
  await sleep(700);
};
const clickTest = (name) => p.ev(`document.querySelector('${byTest(name)}').click()`);
const clickKey = (code) => p.ev(`document.querySelector('${byTest('key-cell', `[data-code="${code}"]`)}').click()`);

const SCREENS = [
  ['Layout tab', () => openTab('layout')],
  ['Keys tab', () => openTab('keys')],
  ['Keys tab, one key selected', () => clickKey('KeyA')],
  ['Style tab', () => openTab('style')],
  ['Animation tab', () => openTab('animation')],
  ['General tab', () => openTab('general')],
  [
    'New layout popup',
    async () => {
      await openTab('layout');
      await clickTest('layout-add');
    },
  ],
];

/** The violations on the page now, as { id, impact, help, where } with up to three places each. */
const scan = () =>
  p.ev(`
    const result = await axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(WCAG_TAGS)} } });
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      where: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    }));
  `);

for (const [name, setUp] of SCREENS) {
  await setUp();
  await sleep(400);
  const violations = await scan();
  const basics = violations.filter((v) => BASIC_RULES.has(v.id) && !(v.id in ACCEPTED));
  for (const advice of violations.filter((v) => !BASIC_RULES.has(v.id))) {
    console.log(`   advice (${name}): ${advice.id} [${advice.impact}] ${advice.help} at ${advice.where.join(', ')}`);
  }
  check(
    `${name}: every control has a name and can be reached with the keyboard`,
    basics.length === 0,
    JSON.stringify(basics),
  );
  // close the popup if this screen opened one, so it doesn't stay over the next screen
  await p.ev(`document.querySelector('${byTest('dialog-cancel')}')?.click()`);
}
finish();
