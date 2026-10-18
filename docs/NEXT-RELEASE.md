# What is next: v1.4 (in progress, not released)

v1.3.0 (free key placement) was released on 2026-10-16. This page tracks the work towards the next version. Nothing here is
released until Jordan says so.

## Already on the `v1.4.0-dev` branch
Draft release notes for what is done so far, in the format the release check requires (docs/RELEASING.md). The key editor
makeover (M4.1 to M4.3) is built and has its lines under New and Improved. Before release, measure v1.4.0 against v1.3.0 with `tests/bench/run.mjs` and put the numbers
in Performance (RELEASING.md requires them). Do not copy this into CHANGELOG.md until the release is prepared.

```
### ✨ New
- **A new key editor on the Keys tab.** The keyboard comes first on a board you can zoom (mouse wheel, up to 200%) and move around (hold the middle mouse button and drag), keys can never leave the board, and an inspector on the right shows the selected key's label, width and place. The live preview steps aside on this tab.
- **Make keys wider or narrower** by dragging the blue handles on either edge of the selected key, or type a width.
- **Two layout styles.** Keyboard shape keeps the keys as the layout draws them; Even grid puts every key one key wide in neat columns. Each style keeps its own moves, so you can switch back and forth.
- **Keys stick to each other.** While you drag, a key's edges snap to the edges of nearby keys, with an orange guide line.
- **Line keys up faster.** Select two or more keys and a small bar appears above them to align them or space them evenly.
- **Close gaps and a Reset menu.** Close gaps slides keys together and centres them; the Reset menu puts selected keys, all keys, hidden keys or labels back, or resets the whole layout (and every one of these can be undone).

### 🛠 Improved
- **Easier with the keyboard and screen readers.** Every setting's label is linked to its control, popups keep keyboard focus inside them and give it back when they close, layout cards can be picked with Enter and deleted with the Menu key (or Shift+F10), the tab bar says which tab is open, and slider outlines show when you reach them with the keyboard.
- **Clearer to read.** White text on blue buttons is easier to read, fields, dropdowns, buttons and cards have visible borders, and buttons that cannot be used yet look dimmed.
- **Copy bug report is more useful.** It now copies a short summary plus the details a developer needs (what you changed from the defaults, the self-test and the recent event log), and it removes your user name from file paths on every system.
- **"What's new" is easier to scan.** Each section of the release notes has its own colour.
- **Snap and Grid are simple switches** in the Keys toolbar, and the arrow keys move the selected keys (Shift for a whole key). The old arrow buttons, the "Whole key" tickbox and the Snap menu are gone.
- **Tabs open instantly.** The Layout, Style, Animation and Fonts tabs are built once and kept until something changes, and the tabs are prepared while the window is idle.
- **Seamless updates.** Updating in the app no longer flashes the Windows installer; the app just restarts on the new version.

### 🐛 Fixed
- **"Copy secure link" and "Make a new key" no longer show while the secure link is off.**
- **Going back to an older version no longer loses settings from a newer one.** A copy of the newer settings file is kept next to it.
- **A secure link with a missing key repairs itself** instead of leaving the overlay locked.
- **No more failed request for a missing icon** every time the overlay loads in OBS.

### ⚡ Performance — v1.4.0 vs v1.3.0
- **Key presses reach OBS sooner:** the local server sends each one at once instead of waiting to bundle it (Nagle's delay off).
- The Style tab remembers your saved presets instead of asking the app every time, and the Debug tab's code is only loaded when Debug mode is on.
- (numbers from `tests/bench/run.mjs` to add before release)

### 🧰 Under the hood
- The settings window's colours, sizes and spacing live in one list of design tokens, with a picture-by-picture test that catches any accidental change in the look.
- Type checking for the interface code, a benchmark for key-press delay, and key capture on Linux X11 desktops (for developers; there is no Linux release yet).
```

## Still to do before v1.4 is released
The key editor makeover ([design/key-editor.md](design/key-editor.md)) is built (M4.1 to M4.3). What remains is the release
preparation: the advisor's pending fixes (settings backup restore, code signing, keyboard-hook watch, overlay fit in OBS), the five
version files, the CHANGELOG entry from the notes above with real benchmark numbers, the install and upgrade test, and Jordan's go. The saved-data format for sizes and
the grid style already shipped in 1.3.0, so 1.4 needs no further migration for them.

## How a release is made
Raise the versions in `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and
`src-tauri/Cargo.lock`, add the CHANGELOG entry, merge into `main`, then GitHub → Actions → **Release** → Run workflow → type the
version → approve the deployment. The steps are in [RELEASING.md](RELEASING.md).
