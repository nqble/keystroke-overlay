# Proposal: import NohBoard keyboard files (Windows only)

Status: **Planned, NohBoard only** (2026-10-20); not built yet. NohBoard files are made on Windows and imported on
Windows, so this is a Windows-only feature that hides itself on other systems. It builds on KLE import (built in v2.0).
VIA and QMK files are not planned (see the last section).

Lets someone start a layout from the NohBoard keyboard they already use: a NohBoard `keyboard.json`. It builds on KLE
import (built in v2.0: `ui/settings/kle.js`, `kle-layout.js`, `kle-import-popup.js`; the file format in
[FILE-FORMATS.md](../FILE-FORMATS.md)) and reuses its review popup, its Rust cleaning and its legend table.

## Goal

1. On Windows, the **New layout** popup offers **From a NohBoard file** next to **From a KLE file** (open question 1).
   On a Mac and on Linux the choice is not shown.
2. The file becomes a layout of your own with the keyboard's real key places and sizes.
3. Every key is linked by itself, because a NohBoard file says which key is which (it stores Windows key codes). A key
   the app can't link keeps its place with a placeholder code, as with KLE import.
4. These files are only ever **read from a file the user picks**. None of them is shipped with the app or copied into the
   repository (they are GPL; see "Privacy and licenses").

## Non-goals

- No mouse elements yet (`MouseKey`, `MouseScroll`, `MouseSpeedIndicator`): they wait for mouse support
  ([mouse-input.md](mouse-input.md), [design/future-inputs.md](../design/future-inputs.md)), which reserves `MouseLeft`
  and the other names.
- No NohBoard styles (`*.style` files): colors and fonts stay the app's own.
- No download of keyboard files from NohBoard's repository, and no list of keyboards to pick from: the app stays offline.
- No import on a Mac or Linux. NohBoard is a Windows program, and its key codes are read through Windows (below).

## How it works

### Where the user finds it

The New layout popup (`ui/settings/dialogs.js`) has the choices **Blank**, **Built-in** and **From a KLE file**. On
Windows it gets a fourth, **From a NohBoard file**, with a **Choose file…** button. The file picker
(`pick_layout_source` in `src-tauri/src/commands/layout_import.rs`) also accepts `keyboard.json`. After reading, the same
review popup as KLE import shows the layout, its name and one summary line; **Create layout** saves it with `add_layout`.

On other systems the choice is hidden (CLAUDE.md section 4: a feature that only works on one system hides or explains
itself elsewhere). Its text goes in the file's `TEXT` block; no word in it differs per system, because it only shows on
Windows.

If the picked file isn't a NohBoard keyboard, the app says so: "This isn't a NohBoard keyboard file." A Keystroke Overlay
export gets "This is a Keystroke Overlay file. Use **Import…** on the Layout tab."

### What a NohBoard file holds

`keyboards/<category>/<name>/keyboard.json`. From NohBoard's `KeyboardDefinition.cs` and its example files: `Version` (2),
`Width`, `Height` (the window, in pixels), and `Elements`, a list. Each element has `__type` (`KeyboardKey`, `MouseKey`,
`MouseScroll`, `MouseSpeedIndicator`), `Id`, `Boundaries` (a polygon: a list of `{ X, Y }` points in pixels, any number
of points), `KeyCodes` (a list of numbers), `Text`, `ShiftText`, `TextPosition` and `ChangeOnCaps`. A style is a separate
file (`*.style`), ignored. The name is the folder's, which the file picker gives us (`<name>/keyboard.json`).

A file is recognized by an object with `Elements` (an array) and `Version`.

**Reading it.** NohBoard reads its files with .NET, which accepts more than strict JSON: 5 of the 209 files in NohBoard's
own repository end a list with a trailing comma, which `JSON.parse` refuses, and a file saved by a Windows editor may
start with a byte-order mark. `json-lenient.js` drops a leading byte-order mark and any comma directly before `]` or `}`
outside strings, then uses `JSON.parse`. Nothing else is relaxed.

### Key codes

`KeyCodes` holds Windows virtual-key codes as NohBoard's low-level hook reports them, with one exception: NohBoard turns
the number pad's Enter (Enter with the "extended" flag) into **1025**. It ignores the extended flag otherwise, so the
navigation keys and the number pad with Num Lock off share codes. `keymap.rs` names keys by scancode, not by virtual key,
so it can't be used as it is; `key-names.js` gets a virtual-key table instead:

| Virtual key (decimal) | Code |
|---|---|
| 8, 9, 13, 19, 20, 27, 32 | `Backspace`, `Tab`, `Enter`, `Pause`, `CapsLock`, `Escape`, `Space` |
| 33, 34, 35, 36 | `PageUp`, `PageDown`, `End`, `Home` |
| 37, 38, 39, 40 | `ArrowLeft`, `ArrowUp`, `ArrowRight`, `ArrowDown` |
| 44, 45, 46 | `PrintScreen`, `Insert`, `Delete` |
| 48–57 | `Digit0`–`Digit9` |
| 65–90 | `KeyA`–`KeyZ` (but see "Letters and punctuation" below) |
| 91, 92, 93 | `MetaLeft`, `MetaRight`, `ContextMenu` |
| 96–105 | `Numpad0`–`Numpad9` |
| 106, 107, 109, 110, 111 | `NumpadMultiply`, `NumpadAdd`, `NumpadSubtract`, `NumpadDecimal`, `NumpadDivide` |
| 112–123 | `F1`–`F12` (124–135, F13–F24, are not keys the app can see: placeholders) |
| 144, 145 | `NumLock`, `ScrollLock` |
| 160, 161, 162, 163, 164, 165 | `ShiftLeft`, `ShiftRight`, `ControlLeft`, `ControlRight`, `AltLeft`, `AltRight` |
| 16, 17, 18 (either side) | `ShiftLeft`, `ControlLeft`, `AltLeft`, or `...Right` by place, as KLE import's left/right rule |
| 186, 187, 188, 189, 190, 191, 192 | `Semicolon`, `Equal`, `Comma`, `Minus`, `Period`, `Slash`, `Backquote` (US) |
| 219, 220, 221, 222, 226 | `BracketLeft`, `Backslash`, `BracketRight`, `Quote`, `IntlBackslash` (US) |
| 1025 | `NumpadEnter` |
| 223 (OEM 8) and anything else | placeholder |

**Letters and punctuation depend on the keyboard language the file was made with.** On a French keyboard, Windows gives
virtual key 65 (`A`) to the key at the US `Q` place, so a NohBoard AZERTY file says 65 there. We want the place (`KeyQ`).
So for the typing keys (48–57, 65–90, 186–192, 219–223, 226), the app asks Windows which scancode that virtual key has on
the current keyboard (`MapVirtualKeyW`, in `platform.rs`, the only place for OS calls), then names it with the scancode
names `keymap.rs` uses. The file was almost always made on this PC with this keyboard. A small command returns the table
once per import. On other systems `platform.rs` answers "not available on this system yet", which never happens in
practice because the choice is hidden there.

Navigation and number-pad keys use the fixed table (asking Windows for virtual key 36 would give the number pad's 7).

A key with several `KeyCodes` (a NohBoard key that lights for both Shifts) takes the first code that maps; a second key
with the same code becomes a placeholder.

### Geometry: pixels to keys

1. Each element's box: its polygon's smallest and largest `X` and `Y`. For a polygon that isn't a rectangle (an ISO
   Enter drawn with 6 points), keep the part that runs the key's full height: cut the polygon into horizontal bands at
   each point's `Y`; the key's left edge is the largest left edge of any band and its right edge the smallest right edge.
   If that leaves nothing, use the whole box. (For an ISO Enter this gives the 1.25 × 2 rectangle our layouts use.)
2. The pitch (one key in pixels): the most common box width among the keys (rounded to whole pixels), plus the most
   common gap between a key's right edge and the next key's left edge in the same row. In the files in NohBoard's
   repository most keys are 43 pixels wide and 1 pixel apart: a pitch of 44.
3. `x = left / pitch`, `y = top / pitch`, `w = (width + gap) / pitch`, `h = (height + gap) / pitch`. A value within 0.05
   of a quarter key is put on it (so hand-drawn files come out as 1.25, 1.5, 2.25); others are rounded to 2 decimals.
4. Move the layout to 0, 0. Labels: `Text`, cleaned and cut to 16 characters (`ShiftText` is not used).
5. `MouseKey`, `MouseScroll` and `MouseSpeedIndicator` elements are left out and counted ("mouse buttons, not supported
   yet").

The reader returns the same thing `kle-layout.js` returns, `{ name, keys, report }`, so everything after it (the review
popup, `add_layout`, `clean_layout_keys`) is shared.

## Files to change

| File | Change |
|---|---|
| `ui/settings/nohboard-layout.js` (new) | NohBoard elements → `{ name, keys, report }`; the pixel-to-key geometry |
| `ui/settings/json-lenient.js` (new, small) | Reads JSON with a byte-order mark or trailing commas (NohBoard's reader accepts both) |
| `ui/settings/key-names.js` | The Windows virtual-key table next to the legend table |
| `ui/settings/kle-import-popup.js` | The review popup takes a reader, so KLE and NohBoard share it; the NohBoard words in its `TEXT` block |
| `ui/settings/dialogs.js` | **From a NohBoard file**, shown on Windows only |
| `src-tauri/src/platform.rs` | Windows only: the scancode for a virtual key on the current keyboard (`MapVirtualKeyW`); other systems: "not available on this system yet" |
| `src-tauri/src/commands/layout_import.rs` | `pick_layout_source` accepts `keyboard.json`; the command that returns the virtual-key table |
| `tools/sandbox/fake-app.js` | Fakes for the new pick and the table |

No change to the layout format, the overlay or the Rust cleaning.

## Tests

All fixtures are **written by us** in NohBoard's shape (a format is not copyrightable; a particular GPL file is). None is
copied from NohBoard.

- `tests/ui/nohboard-layout.test.mjs`: a hand-written arrows file (4 keys, 44 px, 1 px apart) comes out as our
  `arrows.json` shape; an ISO Enter polygon becomes 1.25 × 2; virtual key 1025 is `NumpadEnter`; mouse elements are
  counted and left out; a byte-order mark and trailing commas are read; an AZERTY letter table (given to the function, as
  Windows would) links virtual key 65 to `KeyQ`; a file that isn't NohBoard's, and our own export, get their messages.
- `tests/ui/json-lenient.test.mjs`: commas inside strings are kept; only a comma before `]` or `}` is dropped.
- `tests/ui/key-names.test.mjs`: every code in the virtual-key table is a code `keymap.rs` produces.
- Rust: `platform.rs` on Windows maps the US virtual keys to the codes in the table (a test that runs on the Windows CI);
  elsewhere it says "not available on this system yet".
- e2e (`layouts` suite, Windows): New layout → From a NohBoard file → a hand-written file → every key linked.
- The sandbox and a visual check of the New layout popup with the fourth choice (before and after shown in the pull
  request).

## Docs to update

| Doc | What |
|---|---|
| `docs/USER-GUIDE.md` | "From a NohBoard file" next to "From a KLE file", and that it is on Windows only |
| `docs/ARCHITECTURE.md` | The new files |
| `docs/CROSS-PLATFORM.md` | The new `platform.rs` call and its fallback; the choice hidden on a Mac and Linux |
| `docs/FILE-FORMATS.md` | That a layout made from a NohBoard file is an ordinary layout file, as for KLE |
| `PRIVACY.md` | No change: files you pick are read, nothing is sent (the same as KLE import) |
| `tests/README.md` | New `data-test` hooks |
| `CHANGELOG.md` | The new import |
| `docs/proposals/README.md` | Delete this proposal once it is built |

## Privacy and licenses

- **Same privacy as KLE import.** The files are keyboard drawings, never keystrokes. They are read from a file the user
  picks and nothing is sent anywhere; the app never downloads files from NohBoard's repository (that would be network
  code outside `updates.rs`, which the privacy check forbids).
- **The data is GPL.** NohBoard, including the keyboard files in its repository (contributed by its users), is GPL-2.0.
  Keystroke Overlay is MIT. So:
  - **User-supplied files only.** The app reads a file the user already has, at run time, like a text editor opens a
    file. It never bundles, ships, downloads or uploads these files.
  - **Nothing copied into the repository:** no fixtures, no layouts converted from them, no tables copied from their
    source. Fixtures are written by us.
  - **No code ported from NohBoard.** Its code was read to understand the format; our reader is written from the shape of
    the files.
  - Windows virtual-key numbers are numbers from a public interface.
- A layout someone makes from such a file is their own file in their data folder. Whether sharing an export of it carries
  the original file's license is the user's matter; the user guide can say "Layouts made from NohBoard files come from a
  project under the GPL" without giving legal advice (open question 4).

## Risks

| Risk | What we do |
|---|---|
| Virtual keys depend on the keyboard language the file was made with | Ask Windows for the current keyboard's mapping; the review popup shows the result before creating |
| Hand-drawn files have uneven sizes | Quarter-key snapping within 0.05; the Keys tab's Close gaps and overlap ring |
| The lenient JSON reader hides a broken file | It only drops a byte-order mark and trailing commas; everything else still fails with "This file couldn't be read" |
| Someone on a Mac or Linux has a NohBoard file | The choice isn't there; the user guide says the import is on Windows only, and KLE import works everywhere |

## Work order (small commits)

Each commit passes all checks; stop and report on any failure.

1. `feat(layouts): read json with trailing commas`: `json-lenient.js` and its test.
2. `feat(layouts): windows virtual key table`: in `key-names.js`, with the test against `keymap.rs`.
3. `feat(platform): virtual key to scancode on windows`: `platform.rs` with the fallback, its command, the Rust test.
4. `feat(layouts): import nohboard keyboards`: `nohboard-layout.js` and its test, wired into the review popup and the
   New layout popup (Windows only), the sandbox.
5. `test(e2e): nohboard import in the layouts suite`.
6. `docs(layouts): nohboard keyboard files`: every doc above; delete this proposal.

## Effort

About **2 to 3 working days**: the lenient reader and the virtual-key table 0.5 day; the Windows call 0.5 day; the
geometry and the popup 1 to 1.5 days; tests, docs and the visual check 0.5 day.

## Not planned: VIA and QMK files

An earlier version of this proposal also read VIA definitions and QMK `info.json` / `keyboard.json` files. They are
dropped: those files rarely say which key is which (VIA's legends hold matrix positions; QMK's `label` is optional and
often missing), so most keys would need linking by hand, which isn't the seamless result the app aims for. A QMK
`keymap.json` would link the keys, but only as a second file the user has to find. Anyone who wants to pick this up again
finds the full research in git history (this file, before 2026-10-21); an import that links most keys by itself would be
the bar to clear.

## Open questions

1. **Where the choice goes:** a fourth choice **From a NohBoard file** in the New layout popup (as proposed), or one
   **From a keyboard file** choice that recognizes KLE and NohBoard files by their contents (NohBoard only on Windows)?
2. **The Windows call** (`MapVirtualKeyW` in `platform.rs`) for letters and punctuation: worth the OS-specific code, or
   use the US table and let the review show what came out?
3. **Mouse elements:** leave them out until mouse support exists (as proposed), or keep them as placeholders named for
   the reserved `MouseLeft`, ... names so they light up once mouse support lands?
4. **License wording in the user guide:** say nothing, or one neutral line that layouts made from NohBoard files come
   from a GPL project?
