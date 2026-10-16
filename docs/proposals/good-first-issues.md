# Draft: "good first issue" tickets and labels

**Status: DRAFT for Jordan's approval. Nothing here has been posted to GitHub.** CLAUDE.md says to ask before posting on GitHub, so
the issues and labels below are only text until you say "post them". Edit or delete anything you do not like first.

Every issue below is small, touches one to three files, needs no network access, and never stores or logs key presses. Every file
path mentioned was checked to exist on 2026-10-15 (files an issue asks someone to **create** are marked "(new)"). Links inside the issue texts are written from the repository root on purpose (they
are pasted into GitHub, not read from this folder); turn them into full GitHub links when posting.

## Suggested labels

GitHub already creates some of these in every new repository (marked "default"). Only the others need creating. The two
issue templates in `.github/ISSUE_TEMPLATE/` already use `bug` and `enhancement`.

| Name | Colour (hex) | Description | Note |
|---|---|---|---|
| `good first issue` | `#7057ff` | Small, self-contained and explained step by step. Good for a first contribution. | default |
| `help wanted` | `#008672` | The maintainer would welcome a pull request for this. | default |
| `documentation` | `#0075ca` | Improvements or additions to the docs. | default |
| `enhancement` | `#a2eeef` | A new feature or improvement. | default |
| `bug` | `#d73a4a` | Something is not working. | default, used by the bug template |
| `layout` | `#1d76db` | A keyboard layout file (`ui/overlay/layouts/`). | new |
| `theme` | `#c5def5` | A theme file (`ui/overlay/themes/`). | new |
| `animation` | `#fbca04` | An animation file (`ui/overlay/animations/`). | new |
| `tests` | `#bfd4f2` | Adds or improves automated tests. | new |
| `needs privacy review` | `#d93f0b` | Touches the network, disk writes or key handling. A maintainer must look before any code is written. | new (a guard rail, not a topic) |

## How the drafts are written

- Each issue gives plain context, says exactly what to change and in which files, how to check it by hand, and what "done" looks like.
- Each ends with a short "Before you start" note, so a newcomer does not need to hunt through the docs.
- For issues 1 to 3, a test that already exists covers the new file automatically: `tests/e2e/suites/ui-sweep.mjs` opens **every**
  layout in the Keys tab and applies **every** theme and animation. So no new test code is needed (the maintainer runs that
  suite before a release; contributors only need `npm run dev` and a quick look).

---

## Issue 1: Add an "Arrow keys" layout

**Labels:** `good first issue`, `layout`, `enhancement`

**Title:** Add a built-in "Arrow keys" layout (just the four arrow keys)

**Body:**

### Context
Keystroke Overlay ships four layouts: Full size, Tenkeyless, WASD gameplay and Gameplay (left hand). People who play on the arrow
keys (platformers, rhythm games, fighting games) have no small layout for them, so today they have to hide about 100 keys by
hand. A layout is one plain JSON file, so this is a good first change.

### What to change
Create one new file, `ui/overlay/layouts/arrows.json` (new), in the same format as `ui/overlay/layouts/wasd.json`. The four
arrows form an upside-down "T". Positions are in key units (1 = one normal key):

```json
{
  "id": "arrows",
  "name": "Arrow keys",
  "keys": [
    { "code": "ArrowUp", "label": "↑", "x": 1, "y": 0 },
    { "code": "ArrowLeft", "label": "←", "x": 0, "y": 1 },
    { "code": "ArrowDown", "label": "↓", "x": 1, "y": 1 },
    { "code": "ArrowRight", "label": "→", "x": 2, "y": 1 }
  ]
}
```

Then add the new name to the **Layout** row of the Settings table in `README.md` (it currently lists "Full size, Tenkeyless,
WASD, Gameplay").

You do not need to register the file anywhere. Every file in `ui/overlay/layouts/` is picked up automatically
(see [docs/EXTENDING.md](docs/EXTENDING.md), section 1, and [docs/FILE-FORMATS.md](docs/FILE-FORMATS.md)).

### Files
- `ui/overlay/layouts/arrows.json` (new)
- `README.md` (one table row)
- For reference only: `ui/overlay/layouts/wasd.json`, `docs/schemas/layout.schema.json`

### How to test
1. Run `npm run dev`. The built-in layouts are packed into the app when it is built, so it has to be rebuilt; this command does that.
2. Open the settings window, go to the **Layout** tab and pick **Arrow keys**. The live preview at the top should show an
   upside-down "T" of four keys.
3. Click the keys in the preview: each should light up. Press the real arrow keys: they should light up too.
4. Open the **Keys** tab: the whole keyboard should fit in its box without scrolling.
5. Right-click the layout card: **Delete layout** should be greyed out (built-in layouts cannot be deleted).
6. Run `npm run format` and `npm run check:style`.

### Acceptance criteria
- [ ] `ui/overlay/layouts/arrows.json` exists, is valid JSON, and its `id` is exactly the file name without `.json` (`arrows`).
- [ ] It follows `docs/schemas/layout.schema.json` (`name` at most 30 characters, labels at most 16, key `code`s spelled as in
      [docs/PROTOCOL.md](docs/PROTOCOL.md): `ArrowUp`, `ArrowLeft`, `ArrowDown`, `ArrowRight`).
- [ ] The layout appears in the Layout tab and in the tray menu's **Layout** list, and all four keys light up.
- [ ] `README.md` mentions it.
- [ ] No Rust or settings code was changed.

### Before you start
Read [CONTRIBUTING.md](CONTRIBUTING.md). You need Windows 10/11, Rust and Node.js 20+ to run the app. Comment on this issue to say
you are working on it. Keep the pull request to these two files.

---

## Issue 2: Add a "High contrast" theme

**Labels:** `good first issue`, `theme`, `enhancement`

**Title:** Add a built-in "High contrast" theme (easy to read on busy game footage)

**Body:**

### Context
A theme is a named bundle of colours, fonts and one animation. We ship Default, Glass, Minecraft, Minimal light and Neon glow. None
of them is built for **maximum readability**: big bold text, thick borders, and a pressed colour that stands out sharply against
the idle colour. That helps viewers on small screens and people with low vision.

### What to change
Create one file, `ui/overlay/themes/high-contrast.js` (new). Copy `ui/overlay/themes/minimal-light.js`, then change the id, the
name and the values. A starting point (colours are `#rrggbb` or `#rrggbbaa`):

```js
import { registerTheme } from '/overlay/registry.js';

registerTheme({
  id: 'high-contrast',
  name: 'High contrast',
  style: {
    keyFill: '#000000ff',
    keyFillPressed: '#ffe600ff',
    borderColor: '#ffffffff',
    borderColorPressed: '#ffffffff',
    borderWidth: 3,
    radius: 6,
    fontFamily: 'Segoe UI',
    fontSize: 20,
    fontWeight: 800,
    textColor: '#ffffffff',
    textColorPressed: '#000000ff',
    glowColor: '#ffe600ff',
    glowSize: 10,
  },
  animation: { type: 'pressdown', speed: 100, easing: 'default', intensity: 1 },
});
```

You may adjust the numbers, but keep pressed and idle keys clearly different, and keep the text easy to read in both states. The
allowed range for every value is in [docs/FILE-FORMATS.md](docs/FILE-FORMATS.md) (see "Numbers are clamped to these ranges").
The animation `type` must be one that exists: `none`, `pressdown`, `glow`, `fade`, `bounce` or `scale`.

Every file in `ui/overlay/themes/` is loaded automatically, so nothing else needs registering
(see [docs/EXTENDING.md](docs/EXTENDING.md), section 2).

### Files
- `ui/overlay/themes/high-contrast.js` (new)
- For reference only: `ui/overlay/themes/minimal-light.js`, `ui/overlay/themes/neon.js`, `ui/overlay/registry.js`

### How to test
1. Run `npm run dev`.
2. In the settings window, open the **Style** tab and choose **High contrast** from **Built-in theme**.
3. The preview should change to white-on-black keys. Click keys in the preview, or press real keys: the pressed colour should be a clear,
   different colour, and the text should stay readable.
4. Try other animations in the **Animation** tab (it should still look fine), then switch back to another theme.
5. Run `npm run format` and `npm run check:style`.

### Acceptance criteria
- [ ] `ui/overlay/themes/high-contrast.js` exists, calls `registerTheme` once, and its `id` is `high-contrast`.
- [ ] It sets every style field that `minimal-light.js` sets (none missing), with values inside the documented ranges.
- [ ] It appears in **Style → Built-in theme**, and picking it changes the preview.
- [ ] Pressed and idle keys are easy to tell apart, and the text is readable in both states.
- [ ] No other file was changed.

### Before you start
Read [CONTRIBUTING.md](CONTRIBUTING.md). Comment on this issue to say you are working on it. Please include a screenshot of the
preview in your pull request.

---

## Issue 3: Add a "Squash" animation

**Labels:** `good first issue`, `animation`, `enhancement`

**Title:** Ship the "Squash" animation that the docs already describe

**Body:**

### Context
[docs/EXTENDING.md](docs/EXTENDING.md) (section 3) shows how to write an animation, using a "Squash" example (the key flattens a
little when pressed and springs back smoothly). That example is only text in the docs: there is no matching file in
`ui/overlay/animations/`, so nobody can pick it in the app. Let's make it real.

### What to change
Create `ui/overlay/animations/squash.js` (new), starting from the example in the docs. Look at `ui/overlay/animations/scale.js` and
`ui/overlay/animations/pressdown.js` for the house style (a short comment at the top saying what the animation looks like):

```js
import { registerAnimation } from '/overlay/registry.js';

// Squashes on press, returns smoothly on release.
registerAnimation({
  id: 'squash',
  name: 'Squash',
  apply: ({ ms, intensity }) => ({
    down: `scaleY(${(1 - 0.15 * intensity).toFixed(3)})`,
    press: { ms: ms * 0.5, ease: 'cubic-bezier(.2,.9,.1,1)' },
    release: { ms: ms * 2, ease: 'cubic-bezier(.16,1,.3,1)' },
  }),
});
```

Then:
- In `README.md`, add "squash" to the **Animation** row of the Settings table (it currently lists "Press down, glow, fade, bounce,
  scale, or none").
- In `docs/EXTENDING.md`, add one sentence under the example saying this one ships as `ui/overlay/animations/squash.js`.

**Important rule:** animations may change **only `transform` and `opacity`**. That keeps the work on the graphics card so the overlay
stays light (one of the project's promises, see [CLAUDE.md](CLAUDE.md)). The list of fields an animation can return is at the top of
`ui/overlay/registry.js`.

### Files
- `ui/overlay/animations/squash.js` (new)
- `README.md` (one table row)
- `docs/EXTENDING.md` (one sentence)
- For reference only: `ui/overlay/registry.js`, `ui/overlay/animations/scale.js`

### How to test
1. Run `npm run dev`.
2. Open the **Animation** tab and choose **Squash** from the animation list.
3. Click keys in the preview (or press real keys): the key should flatten vertically while held and spring back when released.
4. Move the **Intensity** and **Speed** sliders to both ends: nothing should break, and at intensity 0 the key should not move.
5. Run `npm run format` and `npm run check:style`.

### Acceptance criteria
- [ ] `ui/overlay/animations/squash.js` exists, registers id `squash` and name `Squash`, and uses only `transform` and `opacity`.
- [ ] **Squash** appears in the Animation tab and works at every speed and intensity.
- [ ] `README.md` and `docs/EXTENDING.md` mention it, and the docs example still matches the file.
- [ ] No Rust, settings or other overlay code was changed.

### Before you start
Read [CONTRIBUTING.md](CONTRIBUTING.md). Comment on this issue to say you are working on it.

---

## Issue 4: Add a unit test that checks every built-in layout

**Labels:** `good first issue`, `tests`, `help wanted`

**Title:** Add a test that fails if a built-in layout file is broken

**Body:**

### Context
When the app builds its list of layouts (`layouts()` in `src-tauri/src/server.rs`), it **silently skips** any layout file that is
not valid (it uses `.filter(valid_layout)`). That is a good safety net for files users add, but it means a typo in a built-in
layout (for example a missing comma or a misspelt `"code"`) would make the layout vanish from the app with no error and no failing
test. Today all four built-in layouts (`full`, `gameplay`, `tkl`, `wasd`) are fine, so the test should pass from the start and
only fail if someone breaks one later.

### What to change
Add **one test function** to the existing `mod tests` block at the bottom of `src-tauri/src/server.rs`. The built-in files are
available in that module as `OVERLAY.get_dir("layouts")` (the same value `layouts()` reads). For each file the test should check:

1. The file is valid JSON (`serde_json::from_slice::<Value>`) and passes the existing `valid_layout` function.
2. Its `"id"` equals the file name without `.json` (for example `wasd.json` has id `wasd`).
3. No two built-in layouts share the same `"id"`.
4. No key `"code"` appears twice inside one layout.

Use `assert!` with a message that names the file, like the existing tests do (for example `assert!(valid_layout(&v), "{name}")`), so a
failure tells the next person exactly which layout is wrong. Keep the function under about 40 lines, use descriptive names, and
add a short comment saying **why** the test exists (the silent skip above).

### Files
- `src-tauri/src/server.rs` (the `mod tests` block at the bottom; also read `valid_layout` and `layouts` above it)
- For reference only: `ui/overlay/layouts/*.json`, `docs/schemas/layout.schema.json`

### How to test
1. Run `npm test` (the Rust tests plus the privacy check). The new test should pass.
2. Prove it can fail: temporarily break one layout (for example change `"id": "wasd"` to `"id": "wasd2"` in
   `ui/overlay/layouts/wasd.json`), run `npm test` again, and check that the new test fails and **names the file**. Then undo your
   change. Do not include that change in your pull request.
3. Run `npm run format` (it also formats the Rust code) and
   `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` (must show zero warnings).

### Acceptance criteria
- [ ] One new test in `src-tauri/src/server.rs` that covers the four checks above.
- [ ] It passes on the current layouts, and fails with a message that names the file when a layout is broken.
- [ ] `npm test`, `npm run check:format` and clippy all pass with zero warnings.
- [ ] No changes outside the test module, and no new dependencies.

### Before you start
Read [CONTRIBUTING.md](CONTRIBUTING.md) and [tests/README.md](tests/README.md). This one needs Rust installed, and the first build takes
a few minutes. Comment on this issue to say you are working on it. Ask if you are not sure how the `include_dir` folder works: you
only need its `.files()` and `.path()` methods.

---

## Issue 5: Add a "key names" cheat sheet to the layout docs

**Labels:** `good first issue`, `documentation`

**Title:** Docs: list every key name a layout can use

**Body:**

### Context
Anyone making a layout by hand has to know the exact key name to write in `"code"` (for example `KeyW`, `ShiftLeft` or
`NumpadEnter`). Today the docs only say "standard key names" and point at the Rust file `src-tauri/src/keyboard/keymap.rs`, which is
hard to read for a newcomer. A short table in the docs would remove the guesswork. It should also say which keys are **not**
supported (for example `F13` to `F24`), because a layout that uses a name the app never reports will simply never light up.

### What to change
Add a section called **Key names** to `docs/FILE-FORMATS.md`, just after the "Layout" section. Use a small table grouped like the
one below, and check every name against `src-tauri/src/keyboard/keymap.rs` (the names in that file are the only ones the app can ever
report). The table is a starting point written from the code on the day this issue was drafted, so please re-check it yourself.

| Group | Names |
|---|---|
| Letters | `KeyA` to `KeyZ` |
| Number row | `Digit0` to `Digit9` |
| Function keys | `F1` to `F12` |
| Modifiers | `ShiftLeft`, `ShiftRight`, `ControlLeft`, `ControlRight`, `AltLeft`, `AltRight`, `MetaLeft` (left Windows key), `MetaRight` |
| Arrows and navigation | `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`, `Insert`, `Delete` |
| Number pad | `Numpad0` to `Numpad9`, `NumpadAdd`, `NumpadSubtract`, `NumpadMultiply`, `NumpadDivide`, `NumpadDecimal`, `NumpadEnter`, `NumLock` |
| Punctuation | `Backquote`, `Minus`, `Equal`, `BracketLeft`, `BracketRight`, `Backslash`, `Semicolon`, `Quote`, `Comma`, `Period`, `Slash` |
| Other | `Escape`, `Tab`, `CapsLock`, `Enter`, `Backspace`, `Space`, `ContextMenu`, `PrintScreen`, `ScrollLock`, `Pause` |

Also:
- Say that the names follow the browser's `KeyboardEvent.code` standard (the same as [docs/PROTOCOL.md](docs/PROTOCOL.md) says), and that
  they name the **physical key position** (`KeyQ` is the key where Q sits on a US keyboard, even if your keyboard prints a different
  letter there). What is drawn on the key is set separately by the layout's `"label"`.
- Add one linking sentence to the "Layout" section of `docs/FILE-FORMATS.md`, and one to the "By hand" paragraph of `README.md` (under
  "Make your own layout").

### Files
- `docs/FILE-FORMATS.md` (new section plus one linking sentence)
- `README.md` (one linking sentence in "Make your own layout")
- For checking: `src-tauri/src/keyboard/keymap.rs`, `docs/PROTOCOL.md`

### How to test
1. For each name in your table, search for it in `src-tauri/src/keyboard/keymap.rs` (with your editor's find). Every name must be
   found, and every name that file produces should be in your table.
2. Write a small hand-made layout using a few names from the table, put it in the app's `layouts` folder (**General → App → Open data
   folder → layouts**), restart the app, and check that the keys light up when you press them.
3. Check that your links work when you view the files on GitHub.

### Acceptance criteria
- [ ] The new section lists every name that `keymap.rs` can produce, and no others.
- [ ] It says which common names are **not** supported (for example `F13` to `F24`).
- [ ] `README.md` and the existing "Layout" section link to it.
- [ ] Plain, friendly English that a beginner can follow. No code changes.

### Before you start
Read [CONTRIBUTING.md](CONTRIBUTING.md). This one needs no programming. Comment on this issue to say you are working on it.

---

## Notes for Jordan (not part of any issue)

- **Posting is up to you.** Nothing was created on GitHub. When you approve, create the labels (Issues → Labels), then paste each
  issue in with its labels.
- **Ideas left out on purpose:** anything that needs the network, anything that stores or logs keys, and the items in
  `docs/decisions/ideas-not-decided.md`. Those need a decision record first, so they are not good first issues.
- **Issue 4 edits `src-tauri/`**, so unlike issues 1 to 3 it is not a "plain file" change. It is still small, but the contributor needs
  Rust installed.
