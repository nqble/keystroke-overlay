# Extending the overlay

The easy ways to add something, smallest first. None needs a build step. Why customisation is limited to these data files
and not a general plugin system: [decision 0006](decisions/0006-layouts-themes-animations-are-data-files.md).

## 1. A layout
**In the app:** Layout tab → the dashed **+** card → name it. It starts as the full-size keyboard; hide the keys you don't
want in the Keys tab. **By hand:** write a JSON file; format in [FILE-FORMATS.md](FILE-FORMATS.md). To ship it with the
app, put it in `ui/overlay/layouts/`.

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
  apply: ({ ms, intensity }) => ({
    down: `scaleY(${(1 - 0.15 * intensity).toFixed(3)})`,
    press: { ms: ms * 0.5, ease: 'cubic-bezier(.2,.9,.1,1)' },
    release: { ms: ms * 2, ease: 'cubic-bezier(.16,1,.3,1)' },
  }),
});
```

Animate only `transform` and `opacity`, so the work stays on the graphics card and the overlay stays light.

## 4. A setting
1. Add it to `defaults()` in `src-tauri/src/settings.rs` (plus a range or rule in the sanitiser if it has one).
2. Add a descriptor for its control to `CONTROLS` in `ui/settings/controls.js`.
3. Use it in the overlay (`ui/overlay/overlay.js`).
4. Add a test, and document it in [FILE-FORMATS.md](FILE-FORMATS.md). If you are *renaming or restructuring* a setting, bump
   `CURRENT_VERSION` and add a migration ([decision 0007](decisions/0007-versioned-settings-with-migrations.md)).

## Inside the settings window
- **A tab:** its file in `ui/settings/tabs/`, a line in `TABS` in `settings.js` and its name in `TAB_NAMES` in `state.js`.
- **A popup:** `dialog()` in `ui/settings/popups.js` gives you the frame, focus handling and Esc.
- **A Debug tool:** one entry in `SECTIONS` in `ui/settings/debug.js` ([DEBUGGING.md](DEBUGGING.md)).
- **Words the user reads:** the `TEXT` block of the file that shows them; shared ones are in `ui/settings/text.js`.
- **A colour or size:** a design token in the `:root` block at the top of `ui/settings/settings.css`.

## Before you open a pull request
`npm test` (Rust and UI unit tests, privacy check), `npm run check:format`, `npm run check:types`, `npm run check:style` and
clippy with zero warnings; for anything visible also `npm run test:visual` and, where it applies, `npm run test:e2e`. See
[CONTRIBUTING.md](../CONTRIBUTING.md) and [tests/README.md](../tests/README.md).
