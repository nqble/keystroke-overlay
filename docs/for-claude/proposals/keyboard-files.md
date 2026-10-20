# Proposal: Import VIA, QMK and NohBoard keyboard files

Status: **NohBoard only, Windows only; VIA and QMK dropped** (Jordan, 2026-10-20: VIA and QMK files rarely say which key is which, so most keys would need linking by hand, which isn't the seamless result the app aims for. NohBoard files are made on Windows and imported on Windows, so its import is a Windows-only feature that hides itself on other systems. Waits for the KLE decision. The VIA and QMK sections below are kept as research)

Lets someone start a layout from the keyboard file they already have: a VIA definition, a QMK `info.json` /
`keyboard.json`, or a NohBoard `keyboard.json`. Builds on [kle-import.md](kle-import.md), which must come first: this plan
reuses its popup, its Rust cleaning, its key linking on the Keys tab and its legend table.

## Goal

1. The **From a KLE file…** button of kle-import.md becomes **From a keyboard file…** and recognizes four kinds of file
   by their contents: KLE, VIA, QMK and NohBoard. No one has to know which kind they have.
2. Each becomes a layout of your own with the keyboard's real key places and sizes.
3. Keys are linked by themselves wherever the file says which key is which (NohBoard always does; QMK does with its
   keymap file; KLE and VIA when their legends say so). The rest are **Not linked** and linked on the Keys tab, exactly
   as in kle-import.md.
4. These files are only ever **read from a file the user picks**. None of them is shipped with the app or copied into the
   repository (they are GPL; see Privacy and licenses).

## Non-goals

- No firmware features: layers, macros, encoders (knobs), RGB, matrix rows and columns are not kept.
- No mouse elements from NohBoard yet (`MouseKey`, `MouseScroll`, `MouseSpeedIndicator`): they wait for mouse support
  ([design/future-inputs.md](../../design/future-inputs.md)), which reserves `MouseLeft` and the other names.
- No rotation (QMK says its `r`, `rx`, `ry` are "currently not implemented"; VIA's come from KLE): turned keys are placed
  straight at the same center, as in kle-import.md.
- No download of definitions from VIA's or QMK's websites, and no list of keyboards to pick from: the app stays offline.
- No reading of QMK's C keymaps (`keymap.c`) in the first version (Open question 4).

## How it works

### One button, four formats

`ui/settings/keyboard-files.js` (new, plain logic) looks at the parsed file and says which kind it is. The first rule
that matches wins:

| Kind | Recognized by |
|---|---|
| Our own export | `format` is `keystroke-overlay-layouts`, or a top-level `keys` array: "This is a Keystroke Overlay file. Use **Import…** on the Layout tab." (or handled directly; Open question 6) |
| VIA definition | an object with `layouts.keymap` (an array) and `matrix` |
| QMK `info.json` / `keyboard.json` | an object with `layouts` whose values have a `layout` array of `{ matrix, x, y }` |
| NohBoard keyboard | an object with `Elements` (an array) and `Version` |
| KLE | a top-level array (kle-import.md) |
| anything else | the toast "This file isn't a keyboard file the app knows: KLE, VIA, QMK or NohBoard." |

Each kind then has its own small module that returns the same thing `kle-layout.js` returns, `{ name, keys, report }`,
and everything after that (the popup, `add_layout`, the Rust cleaning, linking on the Keys tab) is shared.

### Choices before creating

Some files hold more than one keyboard shape. The import popup gets one extra row when needed:

- **VIA layout options** (`layouts.labels`): one control per option, drawn from the file. A plain string ("Split
  Backspace") is a switch, off by default; an array (`["Bottom Row", "ANSI", "7U", "WKL", "HHKB"]`) is a dropdown whose
  first choice is the default. The picture updates as you choose.
- **QMK layouts** (`layouts`): a dropdown of the layout names (`LAYOUT_60_ansi`, `LAYOUT_60_iso`, ...), with the names
  from `layout_aliases` shown as well. Default: `LAYOUT` if present, else the first.

### What the user sees per format

| Format | Keys linked by themselves | What usually needs linking |
|---|---|---|
| NohBoard | all keys (the file has Windows key codes) | none, or a few odd keys |
| QMK + its keymap file | all keys on the first layer | Fn / layer keys (`MO(1)`), which are placeholders with the Fn note |
| QMK alone | only keys with a usable `label` (often none in newer files) | most keys |
| VIA | only keys with a name after the matrix position (some files have `"0,0\nESC"`) | most keys |

For "most keys", the Keys tab's linking is the way: select a key, **Link to a key…**, press it. A **Link keys one by one**
button (new, in the inspector when two or more keys are not linked) walks through them in reading order: the key lights
up on the board, you press the matching key on your keyboard, the next one lights up; **Skip** moves on. A 60% board takes
about a minute. It is useful for KLE files too, so it is built in step 1 below.

## Files to change

| File | Change |
|---|---|
| `ui/settings/keyboard-files.js` (new) | Recognizes the kind of file; calls the right reader |
| `ui/settings/via-layout.js` (new) | VIA → KLE keys (via `kle.js`) → layout options → `{ name, keys, report }` |
| `ui/settings/qmk-layout.js` (new) | QMK `layouts` (+ optional keymap file) → `{ name, keys, report }`; the QMK keycode table |
| `ui/settings/nohboard-layout.js` (new) | NohBoard elements → `{ name, keys, report }`; the pixel-to-key geometry |
| `ui/settings/key-names.js` | The Windows virtual-key table (for NohBoard) next to the legend table |
| `ui/settings/kle-import-popup.js` → `ui/settings/import-popup.js` | The shared popup, with the VIA options and QMK layout choice; its TEXT block |
| `ui/settings/dialogs.js` | **From a KLE file…** becomes **From a keyboard file…** |
| `ui/settings/tabs/keys-inspector.js` | **Link keys one by one** |
| `ui/settings/json-lenient.js` (new, small) | Reads JSON with a byte-order mark or trailing commas (NohBoard's reader accepts both) |
| `src-tauri/src/platform.rs` | Windows only: the scancode for a virtual key on the current keyboard (`MapVirtualKeyW`), for NohBoard's letter and punctuation keys; other systems: "not available", so the US table is used |
| `src-tauri/src/commands/layout_import.rs` | `pick_layout_source` accepts the extra file names; a second pick for the QMK keymap file |
| `tools/sandbox/fake-app.js` | Fakes for the new picks |

No change to the layout format, the overlay or the Rust cleaning: all four end in `add_layout` and `clean_layout_keys`
from kle-import.md.

## Format details

### VIA definitions (`v3/<vendor>/<keyboard>.json`)

What it contains: `name`, `vendorId`, `productId`, `matrix` (`rows`, `cols`), `layouts` with `keymap` (a KLE layout as
JSON: rows of strings and property objects, exactly the KLE format) and an optional `labels` (the layout options), plus
`menus`, `keycodes` and `customKeycodes` (ignored).

How to map it:

1. Read `layouts.keymap` with `kle.js` (kle-import.md). Positions, sizes, rotation, decals and ghosts follow KLE's rules.
2. Each key's legends mean something else in VIA (VIA's specification at caniusevia.com):
   - place 0 (top-left): the matrix position `"row,col"`, never a key name. Not used for linking.
   - place 8 (bottom-right): the layout option `"group,choice"`, for keys that belong to an option.
   - place 4 (center): `e0`, `e1`, ... marks an encoder (a knob). Left out.
   - any other legend (for example `"0,0\nESC"`, where `ESC` lands in place 6): a key name, matched with the legend table.
3. **Layout options.** For each group, keep only the keys of the chosen choice. VIA draws the alternatives beside the
   board; a chosen alternative is moved so its group's top-left lands on the top-left of choice 0's keys. We do the same
   (the offset is the difference between the two groups' smallest `x` and `y`), so the result looks like the real
   keyboard. Keys of choices not chosen are left out and counted ("extra layout choices").
4. Name: VIA's `name`.

Example (GH60 Rev C, from VIA's repository; GPL, read for research only): `"0,13\n\n\n0,0"` is matrix 0,13 in option
group 0 ("Split Backspace") choice 0 (off); `{ "x": 1.25, "w": 1.25, "h": 2, "w2": 1.5, "h2": 1, "x2": -0.25 },
"2,13\n\n\n1,1"` is the ISO Enter, shown when "ISO Enter" is on.

### QMK `info.json` and `keyboard.json`

What it contains (QMK's `docs/reference_info_json.md`): `keyboard_name`, `manufacturer`, `layout_aliases`, and `layouts`:
an object of named layouts, each with a `layout` array of keys. Each key is stateless (unlike KLE):
`matrix` `[row, col]` (required), `x`, `y` (required, absolute, in keys), `w`, `h` (default 1), `label` (optional: "What
to name the key... should usually correspond to the keycode for the first layer of the default keymap"), `r`, `rx`, `ry`
(documented as not implemented), `encoder`, `hand`. QMK draws an ISO Enter as a 1.25 × 2 key, as our layouts do.

How to map it:

1. The chosen layout's keys are copied straight: `x`, `y`, `w`, `h` are already our units. Move the layout to 0, 0 and
   round, as for KLE. Turned keys are straightened like KLE's (rare: QMK doesn't draw them either). Keys with `encoder`
   are left out.
2. `label`, when present and not a matrix name like `k00` or `K0E`, goes through the legend table.
3. **The keymap file (optional, recommended).** QMK's layout arrays are in the same order as the arguments of the
   keyboard's `LAYOUT_...` macro, so a keymap's first layer lists one keycode per key, in the same order. After
   creating, the popup offers **Add its keymap file…** for a `keymap.json` (QMK Configurator → Export, or a keyboard's
   `keymaps/default/keymap.json`): `{ "keyboard", "keymap", "layout", "layers": [[ "KC_ESC", "KC_1", ... ], ...] }`.
   The first layer is read; if its length differs from the layout's keys, or its `layout` names another layout, the app
   says so and links nothing.
4. QMK keycodes → our codes, a table in `qmk-layout.js`. QMK's basic keycodes are USB HID usages, and the W3C
   [UI Events KeyboardEvent code values](https://www.w3.org/TR/uievents-code/) specification lists each code's USB usage, so
   the table follows a public standard:

   | QMK | Code |
   |---|---|
   | `KC_A`…`KC_Z`, `KC_1`…`KC_0` | `KeyA`…`KeyZ`, `Digit1`…`Digit0` |
   | `KC_ENT`/`KC_ENTER`, `KC_ESC`/`KC_ESCAPE`, `KC_BSPC`, `KC_TAB`, `KC_SPC` | `Enter`, `Escape`, `Backspace`, `Tab`, `Space` |
   | `KC_MINS`, `KC_EQL`, `KC_LBRC`, `KC_RBRC`, `KC_BSLS`, `KC_SCLN`, `KC_QUOT`, `KC_GRV`, `KC_COMM`, `KC_DOT`, `KC_SLSH` | `Minus`, `Equal`, `BracketLeft`, `BracketRight`, `Backslash`, `Semicolon`, `Quote`, `Backquote`, `Comma`, `Period`, `Slash` |
   | `KC_NUHS` (ISO `#`) / `KC_NUBS` (ISO `\`) | `Backslash` / `IntlBackslash` |
   | `KC_CAPS`, `KC_F1`…`KC_F12`, `KC_PSCR`, `KC_SCRL`/`KC_SLCK`, `KC_PAUS` | `CapsLock`, `F1`…`F12`, `PrintScreen`, `ScrollLock`, `Pause` |
   | `KC_INS`, `KC_HOME`, `KC_PGUP`, `KC_DEL`, `KC_END`, `KC_PGDN`, `KC_UP`, `KC_DOWN`, `KC_LEFT`, `KC_RGHT` | `Insert`, `Home`, `PageUp`, `Delete`, `End`, `PageDown`, arrows |
   | `KC_NUM`/`KC_NLCK`, `KC_PSLS`, `KC_PAST`, `KC_PMNS`, `KC_PPLS`, `KC_PENT`, `KC_P0`…`KC_P9`, `KC_PDOT` | `NumLock`, `NumpadDivide`, `NumpadMultiply`, `NumpadSubtract`, `NumpadAdd`, `NumpadEnter`, `Numpad0`…`Numpad9`, `NumpadDecimal` |
   | `KC_LCTL`, `KC_LSFT`, `KC_LALT`, `KC_LGUI` and the `R` forms; `KC_APP` | `ControlLeft`, `ShiftLeft`, `AltLeft`, `MetaLeft`, ...; `ContextMenu` |
   | Wrapped keycodes: `LT(1, KC_SPC)`, `MT(MOD_LSFT, KC_A)`, `LSFT_T(KC_A)`, `LCTL(KC_C)` | the inner `KC_` keycode (the key it types when tapped) |
   | `MO(n)`, `TG(n)`, `TT(n)`, `OSL(n)`, `QK_BOOT`, `KC_TRNS`, `KC_NO`, `F13` and above, media and mouse keycodes | placeholders (layer keys get the Fn note) |

   The short and long aliases (`KC_ENT` and `KC_ENTER`) are both listed. Only the keycode **names** are written in our
   table; nothing is copied from QMK's GPL source (its `data/constants/keycodes/*.hjson` is GPL data).
5. Name: `keyboard_name`, else the file's folder name.

### NohBoard keyboard files (`keyboards/<category>/<name>/keyboard.json`)

What it contains (NohBoard's `KeyboardDefinition.cs` and its example files): `Version` (2), `Width`, `Height` (the window,
in pixels), and `Elements`, a list. Each element has `__type` (`KeyboardKey`, `MouseKey`, `MouseScroll`,
`MouseSpeedIndicator`), `Id`, `Boundaries` (a polygon: a list of `{ X, Y }` points in pixels, any number of points),
`KeyCodes` (a list of numbers), `Text`, `ShiftText`, `TextPosition` and `ChangeOnCaps`. A style is a separate file
(`*.style`), ignored. The name is the folder's, which the file picker gives us (`<name>/keyboard.json`).

Reading it: NohBoard reads its files with .NET, which accepts more than strict JSON: 5 of the 209 files in NohBoard's own
repository end a list with a trailing comma, which `JSON.parse` refuses, and a file saved by a Windows editor may start
with a byte-order mark. `json-lenient.js` drops a leading byte-order
mark and any comma directly before `]` or `}` outside strings, then uses `JSON.parse`. Nothing else is relaxed.

**Key codes.** `KeyCodes` holds Windows virtual-key codes as NohBoard's low-level hook reports them, with one exception:
NohBoard turns the number pad's Enter (Enter with the "extended" flag) into **1025**. It ignores the extended flag
otherwise, so the navigation keys and the number pad with Num Lock off share codes. `keymap.rs` names keys by scancode,
not by virtual key, so it can't be used as it is; `key-names.js` gets a virtual-key table instead:

| Virtual key (decimal) | Code |
|---|---|
| 8, 9, 13, 19, 20, 27, 32 | `Backspace`, `Tab`, `Enter`, `Pause`, `CapsLock`, `Escape`, `Space` |
| 33, 34, 35, 36 | `PageUp`, `PageDown`, `End`, `Home` |
| 37, 38, 39, 40 | `ArrowLeft`, `ArrowUp`, `ArrowRight`, `ArrowDown` |
| 44, 45, 46 | `PrintScreen`, `Insert`, `Delete` |
| 48–57 | `Digit0`–`Digit9` |
| 65–90 | `KeyA`–`KeyZ` (but see "letters" below) |
| 91, 92, 93 | `MetaLeft`, `MetaRight`, `ContextMenu` |
| 96–105 | `Numpad0`–`Numpad9` |
| 106, 107, 109, 110, 111 | `NumpadMultiply`, `NumpadAdd`, `NumpadSubtract`, `NumpadDecimal`, `NumpadDivide` |
| 112–123 | `F1`–`F12` (124–135, F13–F24, are not keys the app can see: placeholders) |
| 144, 145 | `NumLock`, `ScrollLock` |
| 160, 161, 162, 163, 164, 165 | `ShiftLeft`, `ShiftRight`, `ControlLeft`, `ControlRight`, `AltLeft`, `AltRight` |
| 16, 17, 18 (either side) | `ShiftLeft`, `ControlLeft`, `AltLeft`, or `...Right` by place, as KLE's left/right rule |
| 186, 187, 188, 189, 190, 191, 192 | `Semicolon`, `Equal`, `Comma`, `Minus`, `Period`, `Slash`, `Backquote` (US) |
| 219, 220, 221, 222, 226 | `BracketLeft`, `Backslash`, `BracketRight`, `Quote`, `IntlBackslash` (US) |
| 1025 | `NumpadEnter` |
| 223 (OEM 8) and anything else | placeholder |

**Letters and punctuation depend on the keyboard language the file was made with.** On a French keyboard, Windows gives
virtual key 65 (`A`) to the key at the US `Q` place, so a NohBoard AZERTY file says 65 there. We want the place
(`KeyQ`). So for the typing keys (48–57, 65–90, 186–192, 219–223, 226):

- **On Windows** the app asks the system which scancode that virtual key has on the current keyboard (`MapVirtualKeyW`,
  in `platform.rs`, the only place for OS calls), then names it with `keymap::code_name`. NohBoard is a Windows program,
  so the file was almost always made on this PC with this keyboard. A small command returns the table once per import.
- **On a Mac and Linux** (`platform.rs`: "not available on this system yet"), letters are matched through the keyboard's
  own labels (`keyboard_labels`, kle-import.md step 3), and punctuation uses the US table above.
- Either way the review shows the result, and **Change…** fixes a key.

Navigation and number-pad keys use the fixed table on every system (asking Windows for virtual key 36 would give the
number pad's 7).

A key with several `KeyCodes` (a NohBoard key that lights for both Shifts) takes the first code that maps; a second key
with the same code becomes a placeholder.

**Geometry: pixels → keys.**

1. Each element's box: its polygon's smallest and largest `X` and `Y`. For a polygon that isn't a rectangle (an ISO Enter
   drawn with 6 points), keep the part that runs the key's full height: cut the polygon into horizontal bands at each
   point's `Y`; the key's left edge is the largest left edge of any band and its right edge the smallest right edge. If
   that leaves nothing, use the whole box. (For an ISO Enter this gives the 1.25 × 2 rectangle our layouts use.)
2. The pitch (one key in pixels): the most common box width among the keys (rounded to whole pixels), plus the most
   common gap between a key's right edge and the next key's left edge in the same row. In the files in NohBoard's
   repository most keys are 43 pixels wide and 1 pixel apart: a pitch of 44.
3. `x = left / pitch`, `y = top / pitch`, `w = (width + gap) / pitch`, `h = (height + gap) / pitch`. A value within 0.05
   of a quarter key is put on it (so hand-drawn files come out as 1.25, 1.5, 2.25); others are rounded to 2 decimals.
4. Move the layout to 0, 0. Labels: `Text`, cleaned and cut to 16 characters (`ShiftText` is not used).
5. `MouseKey`, `MouseScroll` and `MouseSpeedIndicator` elements are left out and counted ("mouse buttons, not supported
   yet").

## Tests

All fixtures for these formats are **written by us** in the formats' shapes (a format is not copyrightable; a particular
GPL file is). None is copied from VIA, QMK or NohBoard.

- `tests/ui/keyboard-files.test.mjs`: each kind is recognized; our own export and unknown files get their messages.
- `tests/ui/via-layout.test.mjs`: a hand-written 60% with a "Split Backspace" switch and a "Bottom Row" dropdown: the
  default keeps choice 0; picking another choice moves its keys into choice 0's place; matrix legends never link;
  `"0,0\nESC"` links `Escape`; encoders are left out.
- `tests/ui/qmk-layout.test.mjs`: a hand-written `keyboard.json` with two layouts and an alias; labels `k00` are ignored;
  a keymap file links every key; wrapped keycodes (`LT(1, KC_SPC)`) give the inner key; `MO(1)` is a placeholder with
  the Fn note; a keymap of the wrong length links nothing and says so.
- `tests/ui/nohboard-layout.test.mjs`: a hand-written arrows file (4 keys, 44 px, 1 px apart) comes out as our
  `arrows.json` shape; an ISO Enter polygon becomes 1.25 × 2; virtual key 1025 is `NumpadEnter`; mouse elements are
  counted and left out; a byte-order mark and trailing commas are read; an AZERTY letter table (given to the function, as
  Windows would) links virtual key 65 to `KeyQ`.
- `tests/ui/json-lenient.test.mjs`: commas inside strings are kept; only a comma before `]` or `}` is dropped.
- Rust: `platform.rs` on Windows maps the US virtual keys to the codes in the table (a test that runs on the Windows CI);
  elsewhere it says "not available".
- e2e (`layouts` suite, Windows): New layout → From a keyboard file → a NohBoard file → every key linked.

## Docs to update

| Doc | What |
|---|---|
| `docs/USER-GUIDE.md` | "From a keyboard file…": the four kinds, VIA options, the QMK keymap file, linking one by one |
| `docs/ARCHITECTURE.md` | The new files |
| `docs/CROSS-PLATFORM.md` | The new `platform.rs` call and its fallback |
| `PRIVACY.md` | No change beyond kle-import.md's: files you pick are read, nothing is sent |
| `tests/README.md` | New `data-test` hooks (`import-option`, `import-qmk-layout`, `import-add-keymap`, `keys-link-one-by-one`) |
| `CHANGELOG.md`, `docs/for-claude/NEXT-RELEASE.md`, `docs/for-claude/README.md` | As usual |

## Privacy and licenses

- **Same privacy as kle-import.md.** The files are keyboard drawings and firmware descriptions, never keystrokes. They
  are read from a file the user picks and nothing is sent anywhere; the app never downloads definitions from VIA's or
  QMK's sites (that would be network code outside `updates.rs`, which the privacy check forbids).
- **The data is GPL.** VIA's keyboards repository is GPL-3.0, QMK is GPL-2.0, and NohBoard (including the keyboard files
  in its repository, contributed by its users) is GPL-2.0. Keystroke Overlay is MIT. So:
  - **User-supplied files only.** The app reads a file the user already has, at run time, like a text editor opens a
    file. It never bundles, ships, downloads or uploads these files.
  - **Nothing copied into the repository**: no fixtures, no layouts converted from them, no tables copied from their
  source. Fixtures are written by us.
  - **No code ported from VIA's reader (`the-via/reader`, GPL-3.0) or NohBoard (GPL-2.0).** Their code was read to
    understand the formats; our readers are written from the formats' public descriptions (QMK's
    `reference_info_json.md`, VIA's specification, the shape of the files) and from KLE's format via the MIT kle-serial.
  - QMK keycode names and Windows virtual-key numbers are names and numbers (an interface), and the HID mapping comes
    from the W3C specification.
- A layout someone makes from such a file is their own file in their data folder. Whether sharing an export of it carries
  the original file's license is the user's matter; the user guide can say "Layouts made from VIA, QMK or NohBoard files
  come from projects under the GPL" without giving legal advice. (Open question 7.)

## Risks

| Risk | What we do |
|---|---|
| VIA and QMK files have no key names, so most keys need linking | Link keys one by one; the QMK keymap file; a later "guess by place" (Open question 3) |
| NohBoard virtual keys depend on the keyboard language the file was made with | Ask Windows for the current keyboard's mapping; keyboard labels elsewhere; Change… |
| VIA layout options move keys in ways we get slightly wrong | The picture updates with each choice before creating; tests with a hand-written option file |
| Hand-drawn NohBoard files have uneven sizes | Quarter-key snapping within 0.05; the Keys tab's Close gaps and overlap ring |
| The lenient JSON reader hides a broken file | It only drops a byte-order mark and trailing commas; everything else still fails with "This file couldn't be read" |
| Four more small modules in `ui/settings/` | One job each, same `{ name, keys, report }` shape, all listed in ARCHITECTURE.md |

## Work order (small commits)

After every step of kle-import.md is done. Each commit passes all checks; stop and report on any failure.

1. `feat(keys): link keys one by one` — the walk-through in the inspector (useful for KLE files already).
2. `feat(layouts): recognize keyboard files` — `keyboard-files.js`, the button renamed **From a keyboard file…**, its test.
3. **NohBoard** (recommended first; see below):
   1. `feat(layouts): read json with trailing commas` — `json-lenient.js` + test.
   2. `feat(layouts): windows virtual key table` — in `key-names.js` + test against `keymap.rs`.
   3. `feat(platform): virtual key to scancode on windows` — `platform.rs` with the fallback, its command, Rust test.
   4. `feat(layouts): import nohboard keyboards` — `nohboard-layout.js` + test, wired into the popup.
4. **VIA**:
   1. `feat(layouts): import via definitions` — `via-layout.js` (matrix and option legends, encoders) + test.
   2. `feat(layouts): via layout options` — the option controls in the popup + test and visual baseline.
5. **QMK**:
   1. `feat(layouts): import qmk layouts` — `qmk-layout.js` (layout choice, labels) + test.
   2. `feat(layouts): link keys from a qmk keymap` — the keycode table, **Add its keymap file…** + test.
6. `docs(layouts): keyboard files` — every doc above; this plan's Status.

## Effort

About **5–6 working days** after kle-import.md: link one by one 0.5 day; recognizing files 0.25 day; NohBoard 1.5–2 days
(geometry, the virtual-key table, the Windows call); VIA 1 day (mostly reuse, plus options); QMK 1–1.5 days (with the
keymap file); docs, baselines and e2e 0.5–1 day.

### Which to do after KLE

**Recommended order: NohBoard, then VIA, then QMK.**

- **NohBoard first** because its users are exactly this app's users: streamers who already show their keys in OBS and
  might switch. Their file is the layout they already use, and it has key codes, so it links fully by itself. Nothing
  else in this plan gives a complete layout with no work.
- **VIA second**: cheapest (its keymap is KLE, so most of the work is done), but it links few keys by itself; its value
  is the exact shape of an enthusiast's keyboard, with its layout options. Link one by one covers the rest.
- **QMK last**: like VIA without options, and only fully useful with the keymap file, which is a second step for the user.
  Someone with a QMK keyboard usually has a VIA definition or a KLE file for it too.

## Open questions for Jordan

1. **Approve the order** NohBoard → VIA → QMK, or do only NohBoard and VIA and drop QMK?
2. **The Windows call** (`MapVirtualKeyW` in `platform.rs`) for NohBoard letters: worth the OS-specific code, or use the
   keyboard-labels match on every system?
3. **Guess by place** for VIA and QMK keys without names: match each key to the nearest key of a built-in layout (60%,
   TKL, full, ISO forms) by row and place. It would link most standard boards but can be wrong in quiet ways. Plan it,
   or rely on linking one by one?
4. **QMK `keymap.c`:** many keyboards have only a C keymap. Read the first `LAYOUT...(...)` of it (a small, careful
   reader), or ask users for the Configurator's `keymap.json`?
5. **NohBoard mouse elements:** leave them out until mouse support exists (recommended), or keep them as placeholders
   named for the reserved `MouseLeft`, ... names so they light up once mouse support lands?
6. **Our own export through this button:** point to **Import…** (as above), or import it right here too?
7. **License wording in the user guide:** say nothing, or one neutral line that layouts made from VIA, QMK or NohBoard
   files come from GPL projects?
