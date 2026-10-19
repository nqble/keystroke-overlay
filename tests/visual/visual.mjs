// Visual tests: a picture of every settings screen, compared with the picture saved last time.
//
//   npm run test:visual               compare every screen with tests/visual/baselines/ and say which ones changed
//   npm run test:visual -- --update   take new baselines (only when the look was changed ON PURPOSE; show Jordan before and after)
//
// The pictures come from the real settings window, over the same debugging connection the end-to-end tests use. The window is
// given a fixed size and 100% scaling, and everything that changes from run to run (the version, the overlay size, animations,
// the blinking text cursor) is frozen or hidden. A few differing pixels are allowed for anti-aliasing (the smoothing of
// letter edges). The baselines come from Jordan's PC; they are local, not part of CI.
// Run through tests/e2e/run.mjs (which builds and starts the test copy of the app); it is not part of the normal "all suites" run.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { byTest, check, connect, finish, sleep } from '../e2e/lib/cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINES = join(HERE, 'baselines');
const DIFFS = join(HERE, 'diff'); // written when a screen changed (not saved in git)
const UPDATE = process.env.VISUAL_UPDATE === '1';

const WINDOW = { width: 1060, height: 1100 }; // tall enough to show a whole tab without scrolling
const PIXEL_COLOUR_TOLERANCE = 0.02; // pixelmatch: how different two pixels may look before they count as different (0 to 1)
// Two runs on the same PC give identical pictures (0 pixels differ), so only a tiny allowance is needed, for the smoothing of
// letter edges. Keep it small: a change to one small element (a one-color outline) changes a few hundred pixels.
const ALLOWED_DIFFERENT_PIXELS = 20;

// What changes from run to run, or that animates, is frozen or hidden before every picture.
const FREEZE_CSS = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; scroll-behavior: auto !important; }
  ${['app-version', 'general-size-note'].map((name) => byTest(name)).join(', ')} { visibility: hidden !important; }
`;

const p = await connect();
await sleep(3500);
await p.send('Emulation.setDeviceMetricsOverride', { ...WINDOW, deviceScaleFactor: 1, mobile: false });
await p.ev(
  `const s = document.createElement('style'); s.textContent = ${JSON.stringify(FREEZE_CSS)}; document.head.append(s)`,
);

const openTab = async (tab) => {
  await p.ev(`document.querySelector('${byTest('tab', `[data-tab="${tab}"]`)}').click()`);
  await sleep(700);
};
const clickKey = (code, ctrl = false) =>
  p.ev(
    `document.querySelector('${byTest('key-cell', `[data-code="${code}"]`)}').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: ${ctrl} }))`,
  );
const clickTest = (name) => p.ev(`document.querySelector('${byTest(name)}').click()`);

/** The overlay as the live preview shows it, for one built-in theme, with W and Space held (a fixed, repeatable look). */
const PORT = 7879;
const overlayWithTheme = (themeId) => async () => {
  await openTab('layout'); // any tab shows the preview; this one is quiet
  const state = (await p.invoke('get_state')).ok.settings;
  const theme = JSON.parse(
    await p.ev(`return JSON.stringify(window.__ko.registry().themes.find((t) => t.id === ${JSON.stringify(themeId)}))`),
  );
  Object.assign(state.style, theme.style);
  Object.assign(state.animation, theme.animation);
  await p.invoke('save_settings', { settings: state });
  await p.ev(`await window.__ko.resync()`);
  await sleep(1200); // the preview applies the theme
  await p.evIn(
    `localhost:${PORT}`,
    `for (const code of ['KeyW', 'Space']) document.querySelector('.key[data-code="' + code + '"]')?.classList.add('down')`,
  );
  await sleep(1200); // any press animation has settled
};

/** Every screen: its file name, and how to get the window into that state. */
const SCREENS = [
  ['layout-tab', () => openTab('layout')],
  ['keys-nothing-selected', () => openTab('keys')],
  ['keys-one-key-selected', () => clickKey('KeyA')],
  [
    'keys-several-keys-selected',
    async () => {
      for (const [index, code] of ['KeyW', 'KeyA', 'KeyS', 'KeyD'].entries()) await clickKey(code, index > 0);
    },
  ],
  ['style-tab', () => openTab('style')],
  ['animation-tab', () => openTab('animation')],
  ['general-tab', () => openTab('general')],
  [
    'popup-new-layout',
    async () => {
      await openTab('layout');
      await clickTest('layout-add');
    },
  ],
  // the overlay itself, one picture per built-in theme: the settings window's work must never change these
  ...['default', 'glass', 'minecraft', 'minimal-light', 'neon'].map((id) => [
    `overlay-${id}`,
    overlayWithTheme(id),
    '#previewBox',
  ]),
];

const takePicture = async (clipTo = null) => {
  await p.ev(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
  await sleep(400);
  const clip = clipTo
    ? await p.ev(
        `const r = document.querySelector('${clipTo}').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 }`,
      )
    : undefined;
  const shot = await p.send('Page.captureScreenshot', { format: 'png', clip });
  return PNG.sync.read(Buffer.from(shot.result.data, 'base64'));
};

mkdirSync(BASELINES, { recursive: true });
mkdirSync(DIFFS, { recursive: true });
const changed = [];

for (const [name, setUp, clipTo] of SCREENS) {
  await setUp();
  await sleep(500);
  const picture = await takePicture(clipTo);
  const file = join(BASELINES, `${name}.png`);

  if (UPDATE || !existsSync(file)) {
    writeFileSync(file, PNG.sync.write(picture));
    console.log(`  ${UPDATE ? 'updated' : 'new baseline'}: ${name}`);
    check(`${name}: baseline ${UPDATE ? 'updated' : 'saved (there was none)'}`, true);
  } else {
    const baseline = PNG.sync.read(readFileSync(file));
    const sameSize = baseline.width === picture.width && baseline.height === picture.height;
    let differing = Infinity;
    if (sameSize) {
      const diff = new PNG({ width: picture.width, height: picture.height });
      differing = pixelmatch(baseline.data, picture.data, diff.data, picture.width, picture.height, {
        threshold: PIXEL_COLOUR_TOLERANCE,
      });
      if (differing > 0) writeFileSync(join(DIFFS, `${name}.diff.png`), PNG.sync.write(diff));
    }
    const allowed = sameSize ? ALLOWED_DIFFERENT_PIXELS : 0;
    const ok = sameSize && differing <= allowed;
    if (!ok) {
      changed.push(name);
      writeFileSync(join(DIFFS, `${name}.new.png`), PNG.sync.write(picture));
    }
    const detail = sameSize
      ? `${differing} pixels differ (up to ${allowed} allowed)`
      : 'the picture has a different size';
    check(`${name} looks the same as its baseline`, ok, detail);
  }
  // close the popup if this screen opened one, so it does not appear in the next picture
  await p.ev(`document.querySelector('${byTest('dialog-cancel')}')?.click()`);
}

await p.send('Emulation.clearDeviceMetricsOverride');
if (changed.length) {
  console.log(
    `\nScreens that changed: ${changed.join(', ')}\nPictures of the differences are in tests/visual/diff/ (name.diff.png marks the changed pixels, name.new.png is what the window looks like now).`,
  );
}
finish();
