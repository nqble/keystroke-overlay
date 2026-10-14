# v1.1.3 — IN PROGRESS (not released)

**Status: all code is in this repo and committed, tested, but NO release has been built or published.**
To ship it, say "make the v1.1.3 release". The steps are in [RELEASING.md](RELEASING.md).

Versions in `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` and `package.json` are already 1.1.3.

## Release notes (paste into the GitHub release description)

The same text is in [CHANGELOG.md](../CHANGELOG.md) under v1.1.3.

```
**v1.1.3 — the "no more white flash" update**

**✨ New**
- **Update button:** a little green circle appears in the corner when a new version is out. Click it, read the notes, hit **Update now**. It never installs behind your back.
- **Stable or Latest:** pick your pace in General → Program updates. Stable only gets releases that have been tested for a while (recommended); Latest gets everything the moment it ships.
- **Automatic update check:** on by default, one click to turn off. It only peeks at GitHub, at most once every 6 hours.

**🛠 Improved**
- **Instant, dark startup:** the settings window used to flash white like a camera. Now it opens dark, and the controls are drawn and usable in about 0.7 s.
- **These very notes:** three loading dots, then a quick typing animation. Fancy, and under a second.
- **Tidier popups:** long release notes now scroll inside the popup, with breathing room around the text.
- **Lighter on your PC:** background threads went from 23 to 9 and idle memory dropped, so your game keeps more of your PC.
- **Fewer web requests:** the overlay now gets new settings in the same message that announces them, instead of going back to ask.

**🐛 Fixed**
- **Stuck-key check** now only looks at the keys you're actually holding, instead of scanning every possible key on every press.

Your settings, presets and fonts are kept.
```

## One-time setup before publishing (Stable channel)

Stable users read `stable.json` from a GitHub release tagged `channel-stable` (pre-release). Create it once, then
`npm run release -- --stable "notes"` and upload `stable.json` to it. Details in [RELEASING.md](RELEASING.md).
Installed 1.1.0–1.1.2 builds have no channels: they read `latest.json` and will be offered 1.1.3 as soon as it is the newest release.

## Measured results (for reference)

| | before (1.1.2) | after (1.1.3) |
|---|---|---|
| White flash at startup | 350–510 ms | 0 ms |
| Settings UI drawn and usable | ~814 ms | ~722 ms |
| Threads, tray-only | 23 | 9 |
| Private memory, tray-only | 4.1 MB | 3.0 MB |
| Web view memory with settings open | ~368 MB (7 processes) | ~305–335 MB (6 processes) |
