# v1.2.1 — READY (not released) — the fix for the first Stable release

**Status: the code is committed and tested here, but NO release has been built or published.**
This is a small fix release on top of the published v1.2.0 (the live preview not following custom layouts).
Free key placement (drag keys, Tidy up) is finished and tested on the local branch `move-keys` and is planned for **v1.3.0**.

To ship it: GitHub → Actions → **Release** → Run workflow → type `1.2.1` → tick **Also make this the Stable version**
(so Stable-channel users get the fix too) → Run, then approve the deployment. The steps are in [RELEASING.md](RELEASING.md).

Versions in `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `package.json` and `src-tauri/Cargo.lock` are 1.2.1.

## Release notes (the same text is in [CHANGELOG.md](../CHANGELOG.md) under v1.2.1)

```
**v1.2.1 — the "preview keeps up" fix**

**🐛 Fixed**
- **The live preview now keeps up with your custom layouts.** Make a layout, hide some keys, and the preview updates the moment you do. Before, it kept drawing a built-in layout until you closed and reopened the window, and OBS had the same blind spot until you refreshed the source. Creating, deleting or importing a layout now refreshes the overlay straight away, and the overlay re-checks by itself if it ever meets a layout it doesn't know.

Your settings, presets and fonts are kept.
```
