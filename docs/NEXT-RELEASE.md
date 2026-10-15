# v1.3.0 — IN PROGRESS (not released)

**Status: the code is on the `v1.3.0-dev` branch. NO release has been built or published, and none will be until Jordan says so.**
The versions in `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `package.json` and `src-tauri/Cargo.lock` are still 1.2.1; they
move to 1.3.0 when the release is prepared (a devbuild needs them too).

To ship it later: bump the versions, add the v1.3.0 section to [CHANGELOG.md](../CHANGELOG.md), then GitHub → Actions →
**Release** → Run workflow → type `1.3.0` (a x.y.0 release becomes the Stable version by itself) → Run, then approve the
deployment. The steps are in [RELEASING.md](RELEASING.md).

## Draft release notes (edit before release)

```
**v1.3.0 — free key placement**

**✨ New**
- **Place keys anywhere.** Drag any key to a new spot in the Keys tab, per layout. The live preview and OBS follow straight away, and the overlay window shrinks to fit a compact layout.
- **Work with several keys at once.** Drag a box around keys (or Ctrl-click them), then move them together, nudge them with the arrow buttons, **align** them (left, centre, right, top, middle, bottom) or **space them evenly**.
- **Undo and Redo** for every change to a layout's keys.
- **Snap and grid.** Choose how far keys jump (off, quarter, half or whole key) and show a grid. Your choice is remembered.
- **Tidy up** closes the gaps left by hidden keys while keeping the keyboard's shape.
- **Keyboard friendly.** Every key can be reached with Tab and selected with Enter.

**🧰 Under the hood**
- The settings window code is split into small files, formatted automatically, and covered by more tests.
- Updated the Windows library the keyboard capture is built on.

Your settings, presets and fonts are kept.
```

## What changed since v1.2.1 (for the maintainer)
- Key placement and the key editor tools (see [proposals/key-editor-polish.md](proposals/key-editor-polish.md)); new saved setting `layout.editor` ([FILE-FORMATS.md](FILE-FORMATS.md)).
- Code health: Prettier and rustfmt with a CI check, `settings.js` split into ES modules, descriptive names, `npm run preview`, unit tests for the UI maths (`npm run test:ui`).
- Dependencies: `windows` 0.62, `actions/checkout` v7, `actions/setup-node` v7 (the two Actions bumps are untested until CI runs).
- Docs: `CLAUDE.md` conventions, decision records, protocol and file-format docs, a "Using two PCs" guide.
