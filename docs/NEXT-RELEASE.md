# v1.3.0 — READY (not released) — free key placement

**Status: the code is committed and tested on the `v1.3.0-dev` branch, but NO release has been built or published, and none
will be until Jordan says so.** It is not merged into `main` yet either.

The versions in `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `package.json`, `package-lock.json` and
`src-tauri/Cargo.lock` are all 1.3.0. The v1.3.0 entry is in [CHANGELOG.md](../CHANGELOG.md).

To ship it, in this order (each step needs Jordan's approval):
1. Merge `v1.3.0-dev` into `main`.
2. GitHub → Actions → **Release** → Run workflow → type `1.3.0` (a x.y.0 release becomes the Stable version by itself) → Run,
   then approve the deployment. The steps are in [RELEASING.md](RELEASING.md).
3. Check the release, `stable.json` and `latest.json`, and that an installed v1.2.1 sees the update.

What was checked before release: all unit tests, clippy, the privacy check, the 12 end-to-end suites, the performance benchmark
(no slowdown against v1.2.0 and v1.2.1), and the install-then-upgrade test (settings are converted from version 2 to 3 without
losing anything).

## Release notes (the same text is in [CHANGELOG.md](../CHANGELOG.md) under v1.3.0)

```
**v1.3.0 — free key placement**

**✨ New**
- **Place keys anywhere.** In the Keys tab, drag any key to a new spot, for every layout (including the built-in ones). The live preview and OBS follow straight away, and the overlay window shrinks to fit a compact layout. **Reset positions** puts everything back.
- **Work with several keys at once.** Drag a box around keys (or Ctrl-click them), then move them together, nudge them with the arrow buttons, **align** them (left, centre, right, top, middle, bottom) or **space them evenly** across or down.
- **Undo and Redo** for every change to a layout's keys (moves, aligns, hidden keys, labels), up to 50 steps.
- **Snap and grid.** Choose how far keys jump while you drag (off, quarter, half or whole key) and show a grid. Your choice is remembered. A small label shows the exact position while you drag, and a line under the keyboard shows the selected key and how many keys are moved.
- **Keyboard shortcuts** on the Keys tab: arrow keys nudge (Shift = a whole key), **Delete** hides the selected keys, **Ctrl+Z** undoes, **Ctrl+Shift+Z** (or Ctrl+Y) redoes, **Ctrl+A** selects every key and **Esc** clears the selection. They never act while you are typing in a field.
- **Tidy up** closes the gaps left by hidden keys while keeping the keyboard's shape.
- **Easier to use without a mouse:** every key on the picture can be reached with Tab and selected with Enter, with clear focus outlines and spoken names for screen readers.
- **Overlap warning:** keys that sit on top of each other get a red outline.

**⚡ Performance — v1.3.0 vs v1.2.1**
- No slowdown: opens in about the same time (487 ms), 0% CPU at idle, the same 9 background threads, the same idle memory (3 MB) and settings-window memory (about 194 MB).

**🧰 Under the hood**
- Your saved key edits move to a new, roomier format (it also prepares for resizing keys and a new layout style in a later version). Your existing settings are converted automatically, and nothing is lost.
- The settings window's code is split into small files and formatted automatically, and there are many more tests.
- Updated the Windows library the keyboard capture is built on, and the build tools used by the project's automatic checks.

Your settings, presets and fonts are kept.

Your settings, presets and fonts are kept.
```

## Coming next (v1.4)
The key editor makeover, designed in [design/key-editor.md](design/key-editor.md): the keyboard first, an inspector on the right,
zoom and pan, drag handles to make keys wider, and a second layout style (even grid). The saved-data format for sizes and the grid
style already ships in 1.3.0, so 1.4 needs no further migration for them.
