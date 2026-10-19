# Proposal: Import from KLE

Status: **Proposed** (2026-10-19, Advisory session research; not approved)

Lets someone turn a layout they drew on keyboard-layout-editor.com (KLE) into one of their own layouts in one step, and then
link any key the app couldn't recognize on the Keys tab. It is the base for the other keyboard files in
[keyboard-files.md](keyboard-files.md) (VIA definitions are KLE inside).

## Goal

1. In the **New layout** popup, a **From a KLE file…** button reads a file saved with KLE's **Download → Download JSON** and
   makes a layout of your own from it: same keys, same places, same sizes.
2. Every key whose legend names a key the app can see (`Esc`, `Q`, `!` over `1`, `Shift`, `↑`, `Num Lock`, ...) is linked
   to it by itself. Most standard 60%, TKL and full-size files need nothing else.
3. Keys the app could not link (an `Fn` key, a macro key, a blank key, a key with an icon it doesn't know) are kept in the
   layout, drawn like any other key, and marked **Not linked** on the Keys tab, where you link each one by pressing it or
   picking it from a list.
4. Everything the file contains is cleaned by the app's Rust side before it is saved, exactly as for **Import…** today.

## Non-goals

- **Turned keys stay turned.** Our layout format has no rotation. Turned keys (Ergodox thumbs, Alice-style boards) are
  placed straight, at the same center. Adding rotation to the format, overlay and key editor is its own proposal.
- **No odd shapes.** An ISO Enter, a big-ass Enter or a stepped Caps Lock becomes one rectangle (the key's main one), like
  `tkl-iso.json` already draws the ISO Enter.
- **No colors, fonts, profiles, switch types, backgrounds or notes** from the file. The overlay's look comes from the Style tab.
- **No export to KLE**, and no live link to the KLE website (the app never goes online for this; see Privacy).
- **No KLE "Raw data" paste in the first version** (see Open questions); the downloaded JSON file only.
- **No multiple layers.** A KLE key's other legends (the shifted symbol, an Fn-layer legend) only help find the key; the
  key gets one label.

## How it works

### What the user sees

1. **Layout → + New layout.** Below the name field and above "Other layouts" there is a second way to start:
   **From a KLE file…** with one line under it: "Drew a keyboard on keyboard-layout-editor.com? Save it there with
   Download → Download JSON, then pick the file." When the 20-layout limit is reached the popup already shows only the
   limit message; the button is not shown either.
2. The system file picker opens (JSON files). Canceling it does nothing.
3. If the file can't be used, a toast says why in one sentence (wording in the TEXT block below) and the New layout popup
   stays open.
4. Otherwise a small popup **Import from KLE** shows the layout's picture (the same `LayoutPicture` the layout cards use),
   a **Name** box filled with the file's own name (KLE's `name`, else the file name without `.json`, else "Imported
   layout"), and up to four short lines:
   - "61 keys."
   - "58 linked to your keyboard." (always shown)
   - "3 not linked yet. You'll link them on the Keys tab." (only when some aren't)
   - "8 turned keys shown straight." / "4 keys left out: decorations and extra layout choices." (only when it happened)

   Buttons: **Cancel** and **Create layout** (primary).
5. **Create layout** saves the layout, selects it and opens the **Keys** tab, like **Create** does today. If any key isn't
   linked, the first one is selected, and the inspector shows the linking section (below). The toolbar's status adds
   "· 3 not linked", next to "N moved · N hidden".

### Linking a key on the Keys tab

For a layout you made (never a built-in one), the inspector's one-key view gets a **Key** row:

- A linked key: "Linked to: W" (the friendly name) and a small **Change…** button.
- A key that isn't linked: "Not linked yet: it won't light up." and a **Link to a key…** button. On an `Fn` key the line
  says: "Fn can't light up: your keyboard handles it itself, so the computer never sees it."
- **Link to a key…** / **Change…** starts listening, the same way the pause shortcut field does
  (`ui/settings/tabs/general-hotkey.js`, `toggleListening` in `shortcut.js`): "Press the key on your keyboard." The next
  key press in the settings window links it; pressing the button again stops listening. Esc does not cancel here, because
  Esc is a key you may want to link; the button and clicking elsewhere do. While listening, `preventDefault()` keeps Tab,
  Space and the arrows from moving focus or the board.
- Under it, **or choose it from the list**: a dropdown of every key the app can see, grouped (Letters, Numbers, Function
  keys, Modifiers, Navigation, Number pad, Other) with friendly names. It covers keys the system takes before the window
  sees them (see Every system).
- A key name that is already on this layout is refused: "That key is already on this layout. Select it to change it."
  (Keys must be unique: the overlay finds keys by name, and key edits are saved by name.)
- Linking saves at once. It rewrites the layout file (new command `relink_key`), and moves the key's edits (label, hidden,
  moved, resized, in both layout styles) to the new name, so nothing the user did to that key is lost.

Linking is not part of the Keys tab's undo history in the first version: undo covers key edits saved in the settings, and
linking changes the layout file. **Change…** puts it right. (Open question 5.)

### What happens to each kind of key

| In the KLE file | In our layout |
|---|---|
| A normal key | A key with its code, position, size and one label |
| Legend matches nothing, or the key is blank (not a space bar), or two keys would get the same code | Kept, with a placeholder code `Unlinked1`, `Unlinked2`, ... (never lights up; shown as **Not linked**) |
| `Fn` | Kept as a placeholder (it is part of how the keyboard looks), with the Fn note |
| Decal (`d: true`: legend only, no keycap) | Left out (we can't draw text without a key) |
| Ghost (`g: true`: drawn faint, usually an alternative) | Left out |
| Smaller than a quarter key in either direction | Left out (the app's minimum key size) |
| Turned (`r` ≠ 0) | Placed straight at the same center; a key turned closer to 90° than to 0° has its width and height swapped |
| ISO / big-ass / stepped shapes (`x2`, `y2`, `w2`, `h2`, `l`) | The main rectangle only (`x`, `y`, `w`, `h`) |
| Colors, fonts, profile, nub, switches, metadata other than `name` | Ignored, never stored |

### Where the code lives: JavaScript to read, Rust to clean and save

**Recommended: the reading and the key matching are plain JavaScript in `ui/settings/`, with unit tests in `tests/ui/`.
The Rust side keeps the job it has today: it picks the file, cleans what comes back and writes the layout.**

Why:

- **The review needs the result in the window anyway.** The summary popup draws the picture and the counts before
  anything is saved; the Keys tab links keys afterwards. With the parser in Rust we would send the whole parsed layout to
  the window and back, and have the label tables in Rust while the friendly names live in JavaScript.
- **Readable by a newcomer (principle 2).** KLE's own reader is JavaScript (kle-serial, TypeScript). A JavaScript port
  can be checked against it line by line, and a JavaScript developer can follow the format without knowing Rust.
- **Testable the way the rest of the window's logic is:** pure functions with `node --test`, like `keys-board.js` and
  `layout-order.js`. Fixture files sit in `tests/ui/fixtures/kle/`.
- **Privacy (principle 1) is unchanged.** A KLE file holds a keyboard drawing, never keystrokes. It is read from disk by
  the existing kind of Rust file-picker command, parsed in memory in the window, and nothing goes on the network (the UI
  privacy check already forbids external addresses, and the reader never loads `background` or `css` from the file).
- **The cleaning in Rust still runs on every key** (below), so a hostile or broken file can't get past it whatever the
  JavaScript did. The Rust side never trusts the window.

The alternative (all in Rust inside `commands/assets.rs`) would grow a file that is already 570 lines, past the ~400-line
rule, and still need the same JavaScript for the popup and the linking.

### The Rust side

- **A new module `src-tauri/src/commands/layout_import.rs`** (not `assets.rs`, which is already over the size rule), with:
  - `pick_layout_source() -> Option<{ fileName, text }>`: the file picker (filter "Keyboard layouts", `json`), the same
    2 MB cap and "That file is too big to be a layout file" message as `import_layouts`, and the text returned as it is.
  - `add_layout(name, keys) -> id`: the layout limit, a free id from the name (the existing `slug()` plus the
    "add a number" loop, shared with `create_layout` instead of copied a third time), the keys cleaned, the file written,
    the tray and overlay told, the layout selected. The same steps `create_layout` takes, with the keys given instead of
    copied from `full`.
  - `relink_key(layoutId, from, to)`: only for a layout in the user's `layouts/` folder; `to` must be a known key code
    or a placeholder, and not already on the layout; rewrites the file and renames the key in that layout's profile
    (`disabledKeys`, `labels`, `styles.*.positions`, `styles.*.sizes`), then saves settings and announces.
- **One shared key cleaner, `clean_layout_keys(raw) -> Vec<Value>` in `sanitize.rs`**, used by `add_layout` **and** by
  the existing `import_doc` (which today cleans keys inline). It keeps today's rules (at most 300 keys, codes of 1–40
  characters, labels cut to 16 characters) and adds the ones layout keys don't have yet:
  - `x`, `y` must be finite and are limited to `MIN_POSITION`..`MAX_POSITION` (−100..100); `w`, `h` to
    `MIN_KEY_WIDTH`..`MAX_KEY_WIDTH` (0.25..100); all rounded to 2 decimals (the existing `round_to_hundredths`).
  - A code that is already in the list is dropped (the first key keeps it).

  Found while researching: today `import_doc` and `server::valid_layout` accept any number for a layout key's `x`, `y`,
  `w`, `h` (for example `1e9`, which would make the Keys tab's board a billion keys wide) and duplicate codes. The shared
  cleaner closes that for imports, and gets a test that fails without it. (Loading hand-made files from the folder is
  left as it is; see Open question 7.)

### The JavaScript side

Three plain-logic files and one component file, each with one job and under 400 lines:

| File | Job |
|---|---|
| `ui/settings/kle.js` | The KLE reader: rows of the file → a flat list of keys with absolute `x`, `y`, `w`, `h`, rotation, flags and up to 12 legends in reading order, plus the metadata. A port of kle-serial's `deserialize` (MIT; notice in the header), with KLE's own rotation-cluster rule (Format details). No imports. |
| `ui/settings/key-names.js` | Every key code the app can see, each with a friendly name and a group (for the dropdown), and the legend table: which legends name which key. |
| `ui/settings/kle-layout.js` | KLE keys → our layout: geometry (main rectangle, straightening turned keys, moving the layout to 0, 0, rounding), leaving out decals, ghosts and tiny keys, picking each key's code and label, placeholders. Returns `{ name, keys, report }`, where `report` holds the counts the popup shows. |
| `ui/settings/kle-import-popup.js` | The **Import from KLE** popup (Preact with `html`, built on `dialog()` from `popup.js`), its TEXT block, and the call to `add_layout`. |

Plus small changes: the button in `dialogs.js`, the **Key** row in `tabs/keys-inspector.js`, the "not linked" count in
`tabs/keys-toolbar.js`, and a `not-linked` look for such keys on the board (`editor/` sets a class; the look is a token
in `keys.css`).

### Picking each key's code

KLE files have legends (what is printed on the keycap), not key codes. The app's codes are `KeyboardEvent.code` names,
which name a key by its **place** on a US keyboard (`KeyQ` is the key right of Tab, whatever it prints). Matching runs in
this order; each step is one small function with its own tests.

1. **Clean each legend.** Remove HTML tags (KLE allows HTML in legends), turn `&amp;`, `&lt;`, `&gt;`, `&quot;`,
   `&#NNN;` and `&#xHH;` into characters, collapse spaces, trim, lower case for matching. A KLE icon (`<i class='kb
   kb-Arrows-Up'></i>`) is read by its class name through a short table (below) before the tags go.
2. **Look up every legend of the key** in the legend table. Each entry gives a code and a rank: **1** for a key's own
   name, letter or digit (`q`, `1`, `enter`, `num lock`), **2** for an unshifted symbol (`,`, `-`, `;`), **3** for a
   shifted symbol (`<`, `_`, `!`). The key gets the best rank found; on a tie, the legend that comes first in reading
   order. So `"!\n1"` → `Digit1`, `"<\n,"` → `Comma`, `"7\nHome"` → `Digit7` (step 4 turns it into `Numpad7`).
3. **Letters and punctuation follow your keyboard.** Before the US table, the legend is matched against what each
   typing key prints on **your** keyboard: the labels the app already knows for `style.keyLabels` (`key_labels.rs`,
   exposed by a small new command `keyboard_labels`). On a German keyboard a KLE German file's `Z` is linked to `KeyY`
   and its `Ü` to `BracketLeft`. Keys whose legend is the same everywhere (`Esc`, `F1`, arrows) don't depend on it.
4. **Number pad.** If the layout has a Num Lock key, keys at or right of its left edge and below it are number-pad keys:
   `Digit0`..`Digit9` → `Numpad0`..`Numpad9`, `Enter` → `NumpadEnter`, `Equal` (`+`) → `NumpadAdd`, `Minus` →
   `NumpadSubtract`, `Digit8` (`*`) → `NumpadMultiply`, `Slash` → `NumpadDivide`, `Period` → `NumpadDecimal`. The
   second legends printed on number-pad keys map the same way, so `".\nDel"` (where `Del` outranks `.`) still ends up
   right: `Insert` → `Numpad0`, `End` → `Numpad1`, `ArrowDown` → `Numpad2`, `PageDown` → `Numpad3`, `ArrowLeft` →
   `Numpad4`, `ArrowRight` → `Numpad6`, `Home` → `Numpad7`, `ArrowUp` → `Numpad8`, `PageUp` → `Numpad9`, `Delete` →
   `NumpadDecimal`. Without a Num Lock key, only the **second** key that would get one of these codes becomes the
   number-pad one.
5. **Left and right.** A legend that only says `Shift`, `Ctrl`, `Alt` or `Win` (or `⌘`, `Super`, ...) is resolved by
   place: of two, the left one is `...Left` and the right one `...Right`; a single one is `...Left` when its center is in
   the left half of the layout. `AltGr` is always `AltRight`. Explicit legends (`LShift`, `Right Ctrl`) win.
6. **Space bar.** A key without any legend that is at least 3 keys wide and in the lowest row is `Space` (KLE space bars
   are usually blank). Only one key gets it.
7. **ISO keys by place.** If the layout has an ISO Enter (a key matched to `Enter` that is at least 1.5 keys tall and at
   most 1.5 keys wide), the 1-key-wide key directly left of Enter's lower half is `Backslash`, and the key between left
   Shift and `KeyZ` is `IntlBackslash`, whatever their legends say (UK `#~`, German `#'`, `<>|` legends differ by
   language; the places don't).
8. **Only keys the app can see.** A code not in `key-names.js` (for example `F13`, a media key) is not used: the key
   becomes a placeholder, so it never claims to work.
9. **No code twice.** If two keys still end up with the same code, the first in reading order (top to bottom, left to
   right) keeps it and the other becomes a placeholder.
10. **The label.** The key's label is the legend that matched (cleaned, as written in the file, at most 16 characters),
    else its first non-empty legend in reading order, else empty. With **Key labels: Your keyboard** (the default) the
    overlay shows your keyboard's letters on typing keys anyway; a label the user types in the Keys tab always wins.

### The legend table (first version)

Lower case, after cleaning. "Rank" as in step 2. Codes are exactly the names in `src-tauri/src/keyboard/keymap.rs`.

| Legends | Code | Rank |
|---|---|---|
| `a` … `z` | `KeyA` … `KeyZ` | 1 |
| `0` … `9` | `Digit0` … `Digit9` | 1 |
| `f1` … `f12` | `F1` … `F12` | 1 |
| `esc`, `escape` | `Escape` | 1 |
| `` ` `` / `~` | `Backquote` | 2 / 3 |
| `!` `@` `#` `$` `%` `^` `&` `*` `(` `)` | `Digit1` … `Digit0` | 3 |
| `-` / `_` | `Minus` | 2 / 3 |
| `=` / `+` | `Equal` | 2 / 3 |
| `backspace`, `back space`, `bksp`, `bkspc`, `bs`, `⌫` | `Backspace` | 1 |
| `tab`, `⇥`, `↹` | `Tab` | 1 |
| `[` / `{`, `]` / `}`, `\` / `\|` | `BracketLeft`, `BracketRight`, `Backslash` | 2 / 3 |
| `caps lock`, `capslock`, `caps`, `⇪` | `CapsLock` | 1 |
| `;` / `:`, `'` / `"` | `Semicolon`, `Quote` | 2 / 3 |
| `enter`, `return`, `ret`, `↵`, `⏎`, `⌤` | `Enter` | 1 |
| `,` / `<`, `.` / `>`, `/` / `?` | `Comma`, `Period`, `Slash` | 2 / 3 |
| `shift`, `⇧` (+ `lshift`, `left shift`, `rshift`, `right shift`) | `Shift` (resolved in step 5) or `ShiftLeft` / `ShiftRight` | 1 |
| `ctrl`, `control`, `ctl`, `strg`, `⌃` (+ left/right forms) | `Control` → `ControlLeft` / `ControlRight` | 1 |
| `alt`, `option`, `opt`, `⌥` (+ left/right forms); `altgr`, `alt gr` | `Alt` → `AltLeft` / `AltRight`; `AltRight` | 1 |
| `win`, `windows`, `super`, `meta`, `gui`, `os`, `cmd`, `command`, `⌘`, `❖`, `◆` (+ left/right forms) | `Meta` → `MetaLeft` / `MetaRight` | 1 |
| `menu`, `app`, `apps`, `application`, `context menu`, `≣`, `▤` | `ContextMenu` | 1 |
| `space`, `spacebar`, `space bar` | `Space` | 1 |
| `print screen`, `prtsc`, `prt sc`, `prtscn`, `prt scr`, `print`, `psc`, `sys rq` | `PrintScreen` | 1 |
| `scroll lock`, `scrlk`, `scr lk`, `slck`, `scroll` | `ScrollLock` | 1 |
| `pause`, `pause break`, `break` | `Pause` | 1 |
| `insert`, `ins` / `delete`, `del`, `⌦` / `home` / `end` | `Insert` / `Delete` / `Home` / `End` | 1 |
| `page up`, `pgup`, `pg up`, `pageup` / `page down`, `pgdn`, `pg dn`, `pagedown` | `PageUp` / `PageDown` | 1 |
| `↑` `up`, `↓` `down`, `←` `left`, `→` `right` | `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight` | 1 |
| `num lock`, `numlock`, `num`, `nlck` | `NumLock` | 1 |
| `fn` | none: a placeholder with the Fn note | — |

KLE icon classes (from KLE's `kbd-webfont.css`): `kb-Arrows-Up` / `-Down` / `-Left` / `-Right` → arrows;
`kb-Unicode-BackSpace-DeleteLeft-*` → `Backspace`; `kb-Unicode-DeleteRight-*` → `Delete`; `kb-Unicode-Enter-*`,
`kb-Return-*` → `Enter`; `kb-Tab-*` → `Tab`; `kb-Unicode-Escape-*` → `Escape`; `kb-Unicode-Insert-*` → `Insert`;
`kb-Unicode-Page-Up-*` / `-Down-*` → `PageUp` / `PageDown`; `kb-Line-Start` / `kb-Line-End` → `Home` / `End`;
`kb-Hamburger-Menu` → `ContextMenu`; `kb-logo-windows-*`, `kb-logo-apple*`, `kb-Unicode-Command-*` → `Meta`;
`kb-Unicode-Option-*`, `kb-Unicode-Alternate-*` → `Alt`; `kb-Unicode-Control-*` → `Control`.

A test checks that every code in the table (and every friendly name in `key-names.js`) is one `keymap.rs` produces,
the same way `tests/ui/layouts.test.mjs` already reads `keymap.rs`, so the two can't drift apart (principle 4).

### Every system

| | Windows | Mac | Linux |
|---|---|---|---|
| File picker | the system's own (Tauri dialog), as **Import…** | the same | the same |
| Legends `Win`, `Cmd`, `⌘`, `Super`, `Option` | all link to `MetaLeft`/`MetaRight` and `AltLeft`/`AltRight`: the app's names are the same on every system | same | same |
| Friendly names in the dropdown | Win, Alt, Ctrl | ⌘, ⌥, ⌃ (from `ui/settings/system-words.js`, like the key labels) | Super, Alt, Ctrl |
| Keys the window may not see when pressed | Win (opens Start on release, but the press arrives first), Print Screen (Windows sends only its release: listen for `keyup` too) | Fn, Caps Lock (arrives, only on the switch), keys the system takes (⌘ Tab, ⌘ Space) | Super when the desktop takes it |
| `PrintScreen`, `ScrollLock` | exist | not on Mac keyboards (macos_keys.rs has no such keys); still selectable for a file made for a PC | exist |

The dropdown is the fallback everywhere. New text naming a system-specific key comes from `system-words.js`, so
`npm run check:systems` stays green.

### The words (TEXT block in `kle-import-popup.js`, and the Keys tab's own)

```js
const TEXT = {
  fromFile: 'From a KLE file…',
  fromFileHelp: 'Drew a keyboard on keyboard-layout-editor.com? Save it there with Download → Download JSON, then pick the file.',
  title: 'Import from KLE',
  name: 'Name',
  keys: (count) => `${plural(count, 'key')}.`,
  linked: (count) => `${count} linked to your keyboard.`,
  notLinked: (count) => `${count} not linked yet. You'll link them on the Keys tab.`,
  straightened: (count) => `${plural(count, 'turned key')} shown straight.`,
  leftOut: (count) => `${plural(count, 'key')} left out: decorations and extra layout choices.`,
  cancel: 'Cancel',
  create: 'Create layout',
  // errors, each a toast
  notKle: "This file isn't a KLE layout. In KLE, use Download → Download JSON.",
  noKeys: 'This KLE file has no keys.',
  tooManyKeys: (count, max) => `This layout has ${count} keys. A layout can have at most ${max}.`,
  brokenFile: "This file couldn't be read. Is it the JSON file from KLE?",
};
// Keys tab (keys-inspector.js)
//   linkedTo: (name) => `Linked to: ${name}`, change: 'Change…', notLinked: "Not linked yet: it won't light up.",
//   link: 'Link to a key…', listening: 'Press the key on your keyboard.', orChoose: 'or choose it from the list',
//   fnNote: "Fn can't light up: your keyboard handles it itself, so the computer never sees it.",
//   taken: 'That key is already on this layout. Select it to change it.',
//   cantSee: "The app can't show that key yet. Choose another, or leave this one unlinked."
// keys-toolbar.js status: (count) => `${count} not linked`
```

"That file is too big to be a layout file" and the 20-layout message (`TEXT.layoutLimitReached`) are reused as they are.
The button and popup get `data-test` hooks: `dialog-from-kle`, `kle-import-name`, `kle-import-create`,
`keys-link-key`, `keys-link-choose`, plus `data-linked="false"` on board keys that aren't linked (listed in `tests/README.md`).

## Files to change

| File | Change |
|---|---|
| `ui/settings/kle.js` (new) | KLE reader (ported from kle-serial, MIT notice in the header) |
| `ui/settings/key-names.js` (new) | Known key codes, friendly names, groups, the legend table and icon table |
| `ui/settings/kle-layout.js` (new) | KLE keys → layout keys, codes and labels, the report |
| `ui/settings/kle-import-popup.js` (new) | The Import from KLE popup and its TEXT |
| `ui/settings/dialogs.js` | The **From a KLE file…** button and its help line in the New layout popup |
| `ui/settings/tabs/keys-inspector.js` | The **Key** row: linked to, Change…, Link to a key…, the dropdown |
| `ui/settings/tabs/keys-toolbar.js` | "· N not linked" in the status |
| `ui/settings/editor/` (the file that draws key elements) + `ui/settings/keys.css` | A `not-linked` class and its look (a token from `settings.css`) |
| `src-tauri/src/commands/layout_import.rs` (new) + `commands/mod.rs` + `main.rs` | `pick_layout_source`, `add_layout`, `relink_key`, registered in `generate_handler!` |
| `src-tauri/src/sanitize.rs` | `clean_layout_keys` (ranges, rounding, duplicates) |
| `src-tauri/src/commands/assets.rs` | `import_doc` uses `clean_layout_keys`; `create_layout` uses `slug()` and the shared free-id helper |
| `src-tauri/src/key_labels.rs` | `keyboard_labels` command: the current keyboard's labels for the typing keys (already in memory) |
| `tools/sandbox/fake-app.js` | Fake `pick_layout_source`, `add_layout`, `relink_key`, `keyboard_labels`, and a state with a not-linked key |
| `tests/ui/fixtures/kle/` (new) | The fixture files and `SOURCES.txt` |

## Format details

### What a KLE file is

KLE's **Download JSON** writes strict JSON: an array. The first item may be an object (the keyboard's metadata: `name`,
`author`, `notes`, `background`, `radii`, `switchMount`, `switchBrand`, `switchType`, `backcolor`, `css`, `pcb`, `plate`);
every other item is a **row**, an array of strings (one per key: its legends, joined by `\n`) and objects (properties
that apply to the keys after them). KLE's **Raw data** tab shows the same rows without the outer `[ ]` and with unquoted
property names; that is not JSON.

The reader keeps a "current key" and walks the rows (this is kle-serial's `deserialize`):

| Property | Meaning | Lasts |
|---|---|---|
| `x`, `y` | move the cursor right / down by this many keys (added, may be negative) | this key |
| `w`, `h` | width and height of the next key (also sets `w2`, `h2`) | next key, then back to 1 |
| `x2`, `y2`, `w2`, `h2` | the second rectangle of an odd-shaped key, relative to the key's top-left | next key |
| `l` | stepped key | next key |
| `n` | homing nub | next key |
| `d` | decal: legend only | next key |
| `g` | ghost | until changed |
| `r` | rotation in degrees, clockwise (screen coordinates, y down) | until changed |
| `rx`, `ry` | the point the key turns around, in keys from the layout's top-left | until changed |
| `a` | legend alignment 0–7: how the key string's lines map to the 12 legend places | until changed |
| `f`, `f2`, `fa` | legend sizes | until changed |
| `c`, `t` | key and legend colors | until changed |
| `p` | keycap profile | until changed |
| `sm`, `sb`, `st` | switch mount, brand, type | until changed |

After each key the cursor moves right by its width. After each row, `y` goes up by 1 and `x` goes back to the current
`rx`. `r`, `rx` and `ry` are only allowed on the first item of a row (anything else is an error).

**The rotation cluster.** In KLE itself, giving `rx` or `ry` also moves the cursor to (`rx`, `ry`), and the row's offsets
(`x`, `y`) count from there. kle-serial 0.15.1 (the published package, 2019) only stores `rx`/`ry` and keeps counting `y`
from the rows above, which puts a second rotated cluster in the wrong place; ergogen's MIT fork of kle-serial fixes it to
match KLE (`current.x = cluster.x; current.y = cluster.y`), and VIA's reader does the same. **We follow KLE**, and the
Atreus fixture (two clusters, `r: 10, rx: 1` and `r: -10, rx: 7, ry: 0.965`) tests it.

**Legend places.** The 12 places in reading order: 0 top-left, 1 top-center, 2 top-right, 3 center-left, 4 center,
5 center-right, 6 bottom-left, 7 bottom-center, 8 bottom-right, 9 front-left, 10 front-center, 11 front-right. The key
string's lines are put in places by kle-serial's table for the current `a` (default 4):

```
a=0: 0 6 2 8 9 11 3 5 1 4 7 10      a=4: 0 6 2 8 10 – 3 5 1 4 7 –
a=1: 1 7 – – 9 11 4 – – – – 10      a=5: 1 7 – – 10 – 4 – – – – –
a=2: 3 – 5 – 9 11 – – 4 – – 10      a=6: 3 – 5 – 10 – – – 4 – – –
a=3: 4 – – – 9 11 – – – – – 10      a=7: 4 – – – 10 – – – – – – –
```

(line *i* of the key string goes to the place in column *i*; "–" drops it). With the default `a=4`, `"!\n1"` puts `!`
top-left and `1` bottom-left. Front legends (9–11) are used for matching only after the top ones (they usually hold an
Fn-layer function such as "Vol+").

### KLE positions → our positions

Both use the same unit: **1 = one standard key** (KLE's "1u", 19.05 mm on a real keyboard; ours is one key size plus
the gap from the Style tab). So no scaling: `w` and `h` are copied, and positions are moved so the layout starts at 0, 0.

For each kept key:

1. Its main rectangle: `x`, `y`, `w`, `h` as the reader worked them out (absolute, in keys). The second rectangle is not
   used.
2. If it is turned (`r` ≠ 0), its center is turned around (`rx`, `ry`):
   `cx = x + w/2`, `cy = y + h/2`, `θ = r × π / 180`,
   `cx' = rx + (cx − rx)·cos θ − (cy − ry)·sin θ`, `cy' = ry + (cx − rx)·sin θ + (cy − ry)·cos θ`.
   If `r` (taken from −180 to 180) is within 45° of ±90°, `w` and `h` are swapped. Then `x = cx' − w/2`, `y = cy' − h/2`.
3. After all keys: subtract the smallest `x` and smallest `y` from every key, so the layout's top-left is 0, 0, like the
   built-in files.
4. Round `x`, `y`, `w`, `h` to 2 decimals (Rust does it again). KLE's eighth-key steps (0.125, 0.375, 0.875) become
   0.13, 0.38, 0.88: at most 0.005 key off, below the Keys tab's 0.01 overlap tolerance, so no false overlaps.
5. `w` and `h` below 0.25 → the key is left out.

Straightened keys that end up overlapping (likely in thumb clusters turned 25–30°) are not moved: the Keys tab already
shows overlaps with a red ring and "N keys overlap", and the user drags them apart. (Open question 3.)

### Limits

| Limit | Value | Where it is enforced |
|---|---|---|
| Layouts you made | 20 (`MAX_LAYOUTS` in `state.js`, `MAX_USER_LAYOUTS` in `assets.rs`) | the button is hidden at 20; `add_layout` refuses |
| File size | 2 MB | `pick_layout_source` |
| Keys | 300 | the popup refuses a file with more (with the count), `clean_layout_keys` caps it |
| Code | 1–40 characters (placeholders `Unlinked1`…`Unlinked300` fit) | `clean_layout_keys` |
| Label | 16 characters | `kle-layout.js` and `clean_layout_keys` |
| Name | 30 characters | the Name box (`maxLength`) and `add_layout` |
| Position | −100..100 keys | `clean_layout_keys` |
| Size | 0.25..100 keys | `clean_layout_keys` |

### Placeholder codes

`Unlinked` followed by a number, unique within the layout. They never collide with keyboard names (`KeyboardEvent.code`
has none like it) nor with the reserved mouse and controller names in
[future-inputs.md](../../design/future-inputs.md), which gets a row reserving the prefix. No capture method produces
them, so they never light up. The format doesn't change: a placeholder is an ordinary `code`.

## Tests

Unit tests (`node --test`), one file per module:

- `tests/ui/kle.test.mjs`: every case in `kle-serial-snippets.json` (offsets, sizes reset, `w2`/`h2` defaults, flags,
  ghost lasting, rotation only first in a row, legend places for all 8 alignments, metadata only first, an object row
  that isn't an array); the rotation cluster with the Atreus fixture (its first keys at the places KLE draws them);
  non-array input, strings where objects are expected, `NaN`-like values, 10 000-row inputs (no crash, a clear error).
- `tests/ui/kle-layout.test.mjs`: the **round trips**: `ansi-60.kle.json` and `iso-tkl.kle.json` (made from
  `compact-60.json` and `tkl-iso.json`) import to exactly the original codes, positions and sizes; turned keys keep their
  centers and swap sizes near 90°; decals, ghosts and tiny keys are left out and counted; duplicates and unknown legends
  become `Unlinked1`, `Unlinked2`...; the space-bar, number-pad, left/right and ISO rules each have a small case; labels
  are cleaned (HTML, entities, 16 characters); a German-keyboard label map links `Z` to `KeyY`; the numpad raw-data
  sample, once wrapped in `[ ]` with quoted names by the test, gets `Numpad7` and so on.
- `tests/ui/key-names.test.mjs`: every code in the tables is one `keymap.rs` produces; every known code has a friendly
  name and a group; no legend is listed twice.
- Rust (`sanitize.rs` / `layout_import.rs`): `clean_layout_keys` limits ranges, rounds, drops duplicates and bad keys
  (a test that fails on today's `import_doc`); `add_layout` respects the 20 limit and never reuses an id; `relink_key`
  refuses built-in layouts, unknown codes and codes already present, and moves labels, hidden keys, positions and sizes
  in both styles; the existing hostile-input test gets `add_layout` and `relink_key` cases.
- e2e (`layouts` suite): New layout → From a KLE file (the e2e harness answers the file picker the way it does for
  **Import…**) → Create → the Keys tab shows the not-linked count → link one key by choosing it from the list → the
  count drops and the key lights up in the live preview.
- Visual (`npm run test:visual`): the New layout popup with the new button, the Import from KLE popup, the inspector's
  Key row (linked and not linked), a not-linked key on the board. Before and after shown to Jordan.

## Docs to update

| Doc | What |
|---|---|
| `docs/USER-GUIDE.md` | Layout tab: "From a KLE file…", what happens to turned and odd-shaped keys, linking keys on the Keys tab |
| `docs/FILE-FORMATS.md` | Layout keys are now cleaned like key edits (ranges, rounding, one key per code); `Unlinked<n>` codes |
| `docs/ARCHITECTURE.md` | The new files in the folder map; `layout_import.rs` in `commands/` |
| `docs/EXTENDING.md` | Section 1 (A layout): a third way, from a KLE file |
| `docs/design/future-inputs.md` | Reserve the `Unlinked` prefix in the names table |
| `docs/design/key-editor.md` | Section 7 (inspector): the Key row; section 4: the not-linked look |
| `PRIVACY.md` | "What the app saves": a layout made from a file you pick is saved like any layout you made; the file itself is only read |
| `tests/README.md` | The new `data-test` hooks |
| `CHANGELOG.md` / `docs/for-claude/NEXT-RELEASE.md` | The feature, under the release it ships in |
| `docs/for-claude/README.md` | List this plan; move it to `proposals/done/` when built |
| Third-party notices | kle-serial's MIT notice (see below) |

## Privacy and licenses

- **No keystrokes involved in reading the file.** A KLE file is a drawing of a keyboard. It is read from a file the
  user picks, parsed in memory, and turned into a layout file in the user's `layouts/` folder, like **Import…** today.
- **Nothing goes on the network.** The app never opens KLE's website, never fetches the file's `background` image or
  `css`, and never stores the file's other metadata. The UI privacy check already fails on any external address in
  `ui/` (a domain without `https://` in help text is allowed; it is not a link).
- **Linking by pressing a key** reads one key press in the settings window, while the user is looking at the
  **Link to a key…** button, the way the pause shortcut field already does. Only the key's name is kept, as the layout
  key's `code`. Nothing about it is logged or sent. PRIVACY.md describes the pause shortcut and the Debug tab's Key
  monitor but not the window reading a press while a field listens; one sentence covering both the shortcut field and
  this button is added.
- **Untrusted file.** Legends may contain HTML: they are stripped to text and only ever put on the page as text
  (`textContent`, as the overlay does). Rust cleans every key again.
- **kle-serial is MIT** (Copyright (c) 2013-2019 Ian Prest). **Recommended: port its `deserialize` logic** (about 100
  lines, including its legend-place table) into `kle.js`, with the MIT notice in the file's header comment and the
  library listed in the app's third-party notices. That keeps us compatible with KLE's own reader, which kle-serial says
  is "the same code that KLE itself uses". The rotation-cluster fix comes from ergogen's fork (also MIT, same copyright)
  and from KLE's documented behavior.
- **Not the KLE website's code.** keyboard-layout-editor's own license is "All rights reserved" (its notes ask people not to
  fork the site). We don't copy anything from it, its presets or its samples. We only read how it treats the format,
  which is needed for files to come out right. Its author says he "claims no ownership over the input (your keyboard
  layouts)", so users' own KLE files are theirs to import.
- **Writing our own reader instead** (from the property table above) is possible and avoids the notice, but it would
  be the same logic written from memory, with more chance of corner-case mismatches. Not recommended.
- **Third-party notices today only list Rust crates** (`cargo about`) and the vendored Preact/htm
  (`ui/settings/vendor/LICENSES.md`). A ported file needs a home for its notice in the installer's notices page:
  either a hand-kept "Code adapted from" section in `src-tauri/about.hbs`, or a small list in `tools/notices.mjs`.
  (Open question 2.)
- **Fixtures** come only from MIT sources or our own layouts (see `kle-samples/README.md`); none from KLE's site, VIA
  (GPL-3.0) or QMK (GPL-2.0).

## Risks

| Risk | What we do |
|---|---|
| Wrong guesses link a key to the wrong code (an unusual legend, a non-US file on a US keyboard) | The popup says how many are linked; **Change…** fixes one key; the round-trip tests cover standard boards |
| Turned clusters overlap once straightened | Shown by the Keys tab's existing overlap ring and count; rotation support is a separate proposal |
| The DOM's key name differs from the app's for some keys (WebKit on Mac ISO keyboards is known to swap `IntlBackslash` and `Backquote`) | Only known codes are accepted; the dropdown is always there; e2e on Windows, a manual check on a Mac ISO keyboard before release |
| Keys the system takes before the window sees them (Fn, media keys, ⌘ Tab) | The dropdown; the Fn note |
| Placeholder codes reach the overlay and tray | They are ordinary codes that never light up; a test draws a layout with them |
| `relink_key` rewrites a user's layout file | Write to a temporary file and rename, like `settings::save` does; refuse anything but the user's own layouts; the hostile-input test |
| `clean_layout_keys` changes what **Import…** accepts (ranges, duplicates) | Only files that would have broken the Keys tab change; a test with today's exported files shows they import the same |
| `ui/settings/` gets four new files | Each has one job and a header; ARCHITECTURE.md lists them |

## Work order (small commits)

Each commit passes `npm test`, the format, type, docs and style checks, and clippy with zero warnings. Stop and report on
any failure.

1. `test(layouts): add KLE fixtures` — the five files in `tests/ui/fixtures/kle/` with `SOURCES.txt`.
2. `fix(layouts): limit imported key positions, sizes and duplicates` — `clean_layout_keys` in `sanitize.rs`, used by
   `import_doc`, with the failing-then-passing test. (Useful on its own; can ship before the rest.)
3. `feat(layouts): read KLE files` — `kle.js` (MIT notice) + `kle.test.mjs`. No UI yet.
4. `feat(layouts): list the keys the app can see` — `key-names.js` + its test against `keymap.rs`.
5. `feat(layouts): turn KLE keys into a layout` — `kle-layout.js` (geometry, codes, labels, placeholders, report) +
   `kle-layout.test.mjs` with the round trips.
6. `refactor(layouts): share the free layout id` — `create_layout` uses `slug()` and a `free_id()` helper (no change
   in behavior; its own commit).
7. `feat(layouts): add_layout and pick_layout_source commands` — `layout_import.rs`, `mod.rs`, `main.rs`, Rust tests,
   sandbox fakes.
8. `feat(layouts): keyboard_labels command` — in `key_labels.rs`, used by step 5's matching.
9. `feat(layouts): import from KLE in the New layout popup` — `kle-import-popup.js`, the button in `dialogs.js`,
   `data-test` hooks, visual baselines.
10. `feat(keys): relink_key command` — Rust, with the profile move and its tests.
11. `feat(keys): link a key from the inspector` — the Key row, the listening, the dropdown, the not-linked look and
    count, visual baselines, e2e.
12. `docs(layouts): import from KLE` — every doc in the table above, the notices entry, this plan's Status, moved to
    `proposals/done/`.

## Effort

About **5–6 working days** of a session, plus Jordan's reviews: reader and its tests 0.5 day; key names, matching and
geometry 1.5 days; Rust commands and cleaning 1 day; the popup 0.5 day; linking on the Keys tab 1.5 days; docs, visual
baselines and e2e 0.5–1 day. Steps 1–5 can be reviewed before any UI exists.

## Open questions for Jordan

1. **Approve the approach:** reading in JavaScript (`ui/settings/`), cleaning in Rust, a new `commands/layout_import.rs`?
   Moving the existing import/export code out of `assets.rs` (570 lines) into it would be a refactor of its own; do you
   want that planned too?
2. **kle-serial's notice:** port with the MIT notice (recommended) or write our own reader? And where should the notice
   live in the installer's third-party page?
3. **Turned keys:** is "straight at the same center" enough for the first version, or should rotation be added to the
   layout format (a field `r`, drawn with a wrapper element so animations keep their own `transform`), as a follow-up
   proposal?
4. **Not-linked keys:** keep them in the layout, drawn and never lit (recommended: an Fn key is part of how a 60% looks),
   or leave them out?
5. **Undo for linking:** fine to leave it out of undo in the first version (Change… fixes a mistake), or should
   `keys-history.js` learn layout-file changes?
6. **Labels:** keep the legend from the file (recommended: the user drew it), or always use our standard label for a
   linked key (`Bksp`, `Caps`), for a uniform look?
7. **Hand-made layout files in the folder** are not range-checked when loaded (`server::valid_layout`). Clean them with
   the same `clean_layout_keys` at load time too?
8. **Raw data paste:** worth a later step (a "Paste raw data" box with our own small reader for KLE's unquoted
   format, no new dependency), or is the downloaded file enough?
9. **One door or two:** should the Layout tab's **Import…** also recognize a KLE file and send it to this flow, so
   nobody has to know which button to use?
