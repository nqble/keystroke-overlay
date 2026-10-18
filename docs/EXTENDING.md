# Extending the overlay

The easy ways to add something, smallest first. None needs a build step. Why customisation is limited to these data files
and not a general plugin system: [decision 0006](decisions/0006-layouts-themes-animations-are-data-files.md).

## 1. A layout
**In the app:** Layout tab → the dashed **+ New layout** card → name it. It starts as the full-size keyboard; hide the keys you don't
want in the Keys tab. **By hand:** write a JSON file; format in [FILE-FORMATS.md](FILE-FORMATS.md). To ship it with the
app, put it in `ui/overlay/layouts/`: it appears in the New layout popup's "Other layouts" by itself. To show it on
new installs, add its id to `DEFAULT_ORDER` in `src-tauri/src/layout_order.rs`.

## 2. A theme
A theme is a named bundle of style values and an animation. Create `ui/overlay/themes/my-theme.js`:

```js
import { registerTheme } from '/overlay/registry.js';

registerTheme({
  id: 'my-theme', name: 'My theme',
  style: {
    keyFill: '#101010e6', keyFillPressed: '#ff5a00ff', borderColor: '#ffffff33', borderColorPressed: '#ffffffff',
    borderWidth: 2, radius: 6, fontFamily: 'Consolas', fontSize: 18, fontWeight: 700,
    textColor: '#ffffffff', textColorPressed: '#000000ff', glowColor: '#ff5a00ff', glowSize: 16,
  },
  animation: { type: 'pressdown', speed: 100, easing: 'default', intensity: 1 },
});
```

Every file in `themes/` is loaded automatically. Style fields are the same as a [preset](FILE-FORMATS.md#preset-exported-style-presetsnamejson).

## 3. An animation
Create `ui/overlay/animations/my-anim.js`. It returns how a key should look while pressed (see the comment at the top of
`ui/overlay/registry.js` for every field):

```js
import { registerAnimation } from '/overlay/registry.js';

// Squashes on press, returns smoothly on release.
registerAnimation({
  id: 'squash', name: 'Squash',
  description: 'Squashes flat, then springs back.', // its card's one line (optional)
  usesIntensity: true, // apply() uses intensity, so the Strength slider shows (optional)
  apply: ({ ms, intensity }) => ({
    down: `scaleY(${(1 - 0.15 * intensity).toFixed(3)})`,
    press: { ms: ms * 0.5, ease: 'cubic-bezier(.2,.9,.1,1)' },
    release: { ms: ms * 2, ease: 'cubic-bezier(.16,1,.3,1)' },
  }),
});
```

Animate only `transform` and `opacity`, so the work stays on the graphics card and the overlay stays light.

## 4. A setting
1. Add it to `defaults()` in `src-tauri/src/settings.rs` (plus one line in a table in `src-tauri/src/sanitize.rs` if it needs a range or a rule: `RANGES`, `NUMBER_CHOICES`, `TEXT_RULES`).
2. Add a descriptor for its control to `CONTROLS` in `ui/settings/controls.js`.
3. Use it in the overlay (`ui/overlay/overlay.js`).
4. Copy the new default into `tools/sandbox/default-settings.json` (a Rust test fails until you do).
5. Add a test, and document it in [FILE-FORMATS.md](FILE-FORMATS.md). If you are *renaming or restructuring* a setting, bump
   `CURRENT_VERSION` and add a migration ([decision 0007](decisions/0007-versioned-settings-with-migrations.md)).

## Inside the settings window: where each thing lives

The rule (CLAUDE.md, principle 4): adding, removing or changing a thing touches one place, or as few as possible, and
when it takes more than one, a check or test catches a forgotten one.

| To add, remove or change… | Where | Places |
|---|---|---|
| A layout, theme or animation | one file in `ui/overlay/layouts/`, `themes/` or `animations/` | 1 |
| Words the user reads | the `TEXT` block of the file that shows them (shared ones: `ui/settings/text.js`) | 1 |
| Words that differ per system (Windows / Mac / Linux) | one entry in `ui/settings/system-words.js` (`npm run check:systems` catches a Windows word left elsewhere) | 1 |
| The look of one part of the window | its own CSS file next to `settings.css` (`header.css`, `popups.css`, ...; a new part gets a new file and a `<link>` in `index.html`) | 1–2 |
| A colour, size or spacing | the design tokens at the top of `ui/settings/settings.css` (`npm run check:style` refuses raw colours) | 1 |
| A header status | one rule in `obsStatus()`, `ui/settings/obs-status.js`, plus its test | 1 |
| A new screen or part of one | a Preact component using `html` from `ui/settings/html.js` (docs/proposals/v2-preact.md); plain logic in its own tested function | 1 |
| A popup | `dialog()` in `ui/settings/popup.js` (focus, Esc, Enter and size come with it) | 1 |
| A scrolling area | the class `scroll-fade` on it (the fade and the shared scrollbar come with it; docs/design/ui-design-v2.md, Scrolling) | 1 |
| A Debug tool | a file in `ui/settings/debug/` and its name in `SECTIONS` in `debug/index.js` | 2 |
| A UI sandbox state | one line in `STATES`, `tools/sandbox/fake-app.js` | 1 |
| A release-note section | `NOTE_SECTIONS` in `ui/settings/release-notes.js`, a colour token, a row in RELEASING.md (the release check refuses unknown sections) | 3 |
| A setting | section 4 above (a Rust test catches a missing sandbox copy) | 3 |
| A tab | its file in `ui/settings/tabs/` plus one line in `ui/settings/tabs/index.js` (order, name, Debug-only); `tests/ui/tabs.test.mjs` checks the line | 2 |

## Before you open a pull request
`npm test` (Rust and UI unit tests, privacy check), `npm run check:format`, `npm run check:types`, `npm run check:style` and
clippy with zero warnings; for anything visible also `npm run test:visual` and, where it applies, `npm run test:e2e`. See
[CONTRIBUTING.md](../CONTRIBUTING.md) and [tests/README.md](../tests/README.md).
