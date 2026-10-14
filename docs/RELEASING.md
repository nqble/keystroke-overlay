# Releasing

Releases are signed so the in-app updater can verify them. The signing key never lives in this repository.

## One-time setup

1. **Signing key** (kept outside the repo and outside any cloud-synced folder, and backed up privately):
   ```bash
   npx tauri signer generate -w ~/.keystroke-overlay-keys/updater.key
   ```
   Paste the printed **public** key into `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.
   If the private key is lost, installed copies can never auto-update again; if it leaks, anyone could ship updates.
   `tools/release.mjs` reads it from `~/.keystroke-overlay-keys/updater.key`.
2. **Stable channel release:** on GitHub create a release tagged `channel-stable`, tick *pre-release* (so it never becomes
   "latest"), title "Stable channel". It only ever holds `stable.json`.

## Every release

1. Raise `version` in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (same number).
2. Add an entry to [CHANGELOG.md](../CHANGELOG.md) in the friendly tone ([RELEASE-NOTES-STYLE.md](RELEASE-NOTES-STYLE.md)).
3. `npm test`
4. Build + sign:
   ```bash
   npm run release -- "short note"              # Latest channel only
   npm run release -- --stable "short note"     # also promote to Stable
   npm run release -- --manual "short note"     # the in-app updater can't apply it; users are sent to GitHub
   ```
   Output goes to `release/<version>/` (git-ignored).
5. On GitHub: Releases → new release tagged `v<version>`; paste the CHANGELOG entry as the description (the in-app
   "What's new" window fetches this text); upload `Keystroke-Overlay_<version>_x64-setup.exe` and `latest.json`.
6. If promoting to Stable: upload `stable.json` to the `channel-stable` release (delete the old `stable.json` first).

## Channels

- **Latest** reads `releases/latest/download/latest.json` — every release.
- **Stable** reads `releases/download/channel-stable/stable.json` — only what you promote. Suggested rule: promote releases that
  have run for a while without problems (for example the x.y.0 releases) and leave quick patches on Latest only.
- Users are never downgraded; a Stable user simply waits until Stable catches up.

## How the app uses this

A background check runs when the settings window opens (at most every 6 hours, can be turned off). A green button appears
if something newer exists; the user must click it and confirm. The installer is verified against the public key before it runs.

## Checks before publishing a public release

- `npm run check:privacy` passes
- Dependency licenses still compatible with MIT (`cargo metadata` → no GPL/AGPL; MPL-2.0 is fine)
- Consider generating a third-party notices file (for example with `cargo about`) and attaching it to the release
- Test builds can use a local mock update server via the build-time variable `KEYOVERLAY_TEST_UPDATE_BASE`
  (never set it in a real build)
