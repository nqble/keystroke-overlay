# What is next: v1.4 (in progress, not released)

v1.3.0 (free key placement) was released on 2026-10-16. This page tracks the work towards the next version. Nothing here is
released until Jordan says so.

## Already on the `v1.4.0-dev` branch
Draft release notes for what is done so far, in the format the release check requires (docs/RELEASING.md). Its groundwork (board geometry, zoom and
pan, snapping guides, even-grid places) is in, with unit tests, but the editor itself is not built yet; it adds its own lines
under New and Improved when it is. Before release, measure v1.4.0 against v1.3.0 with `tests/bench/run.mjs` and put the numbers
in Performance (RELEASING.md requires them). Do not copy this into CHANGELOG.md until the release is prepared.

```
### 🛠 Improved
- **Easier with the keyboard and screen readers.** Every setting's label is linked to its control, popups keep keyboard focus inside them and give it back when they close, layout cards can be picked with Enter and deleted with the Menu key (or Shift+F10), the tab bar says which tab is open, and slider outlines show when you reach them with the keyboard.
- **Clearer to read.** White text on blue buttons is easier to read, fields, dropdowns, buttons and cards have visible borders, and buttons that cannot be used yet look dimmed.
- **Copy bug report is more useful.** It now copies a short summary plus the details a developer needs (what you changed from the defaults, the self-test and the recent event log), and it removes your user name from file paths on every system.
- **"What's new" is easier to scan.** Each section of the release notes has its own colour.
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

## Planned for v1.4
The key editor makeover, designed in [design/key-editor.md](design/key-editor.md): the keyboard first, an inspector on the right,
zoom and pan, drag handles to make keys wider, and a second layout style (even grid). The saved-data format for sizes and the grid
style already shipped in 1.3.0, so 1.4 needs no further migration for them. Before it, the rest of the UI foundation
([proposals/ui-foundation.md](proposals/ui-foundation.md); hooks, screenshot tests and tokens are done) and of the loading plan
([proposals/loading-and-lifetime.md](proposals/loading-and-lifetime.md)) is built, so the makeover sits on design tokens and shared
building blocks.

## How a release is made
Raise the versions in `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and
`src-tauri/Cargo.lock`, add the CHANGELOG entry, merge into `main`, then GitHub → Actions → **Release** → Run workflow → type the
version → approve the deployment. The steps are in [RELEASING.md](RELEASING.md).
