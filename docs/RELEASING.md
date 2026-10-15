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

## Versioning rule (decides the channel)

`x.y.z` — **the middle number is Stable, the last number is Latest.**

- **`x.y.0`** (1.2.0, 1.3.0, …) → published to **Stable and Latest**. These are the releases to recommend to everyone.
- **`x.y.z`, z > 0** (1.2.1, 1.2.2, …) → **Latest only**: quick fixes for people who want them right away.

`tools/release.mjs` applies this automatically (it writes `stable.json` only when the version ends in `.0`;
`--stable` / `--latest-only` override it for a rare exception).

## The easy way: one click on GitHub (recommended)

The repository has a **Release** workflow (`.github/workflows/release.yml`) that does everything below by itself.

One-time setup (details in [OPEN-SOURCE-GUIDE.md](OPEN-SOURCE-GUIDE.md)): add the repository secret `TAURI_SIGNING_PRIVATE_KEY`
(the text of your `updater.key`), and optionally an environment named `release` with yourself as a required reviewer.

Each release (or just tell Claude "release v1.2.0": it can start the workflow for you with the GitHub command-line tool, and you only
have to approve it — from the website or the GitHub phone app):
1. Raise the version (`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json`) and add the CHANGELOG entry — Claude can do both.
2. GitHub → **Actions → Release → Run workflow** → type the version to confirm → **Run** (or push a tag named `v<version>`).
3. It checks the version/tag/CHANGELOG match and that the release doesn't already exist, runs `npm test`, builds and signs the
   installer, creates the GitHub release with the CHANGELOG text as the notes, and — for `x.y.0` versions — updates the Stable channel.

The signing key is read from the encrypted secret and never appears in logs; pull requests from forks cannot access it.
The manual steps below are the fallback (and what the workflow runs internally).

## Every release (manual)

1. Raise `version` in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (same number).
2. Add an entry to [CHANGELOG.md](../CHANGELOG.md).
3. `npm test`
4. Build + sign:
   ```bash
   npm run release -- "short note"              # Stable too, automatically, if the version is x.y.0
   npm run release -- --manual "short note"     # the in-app updater can't apply it; users are sent to GitHub
   ```
   Output goes to `release/<version>/` (git-ignored).
5. On GitHub: Releases → new release tagged `v<version>`; paste the CHANGELOG entry as the description (the in-app
   "What's new" window fetches this text); upload `Keystroke-Overlay_<version>_x64-setup.exe` and `latest.json`.
6. For an `x.y.0` release: upload `stable.json` (the script creates it) to the `channel-stable` release (delete the old one first).

## Channels

- **Latest** reads `releases/latest/download/latest.json` — every release.
- **Stable** reads `releases/download/channel-stable/stable.json` — only `x.y.0` releases (see the versioning rule above).
- Users are never downgraded; a Stable user simply waits until Stable catches up.

## How the app uses this

A background check runs about once an hour while the app is running, and when the settings window opens (can be turned off).
If something newer exists, the tray icon gets an orange dot and an "Update available" entry at the top of its menu (it opens
General), and a button appears in the settings window; the user must click it and confirm. The installer is verified against the public key before it runs.

## Checks before publishing a public release

- `npm run check:privacy` passes
- Dependency licenses still compatible with MIT (`cargo metadata` → no GPL/AGPL; MPL-2.0 is fine)
- Consider generating a third-party notices file (for example with `cargo about`) and attaching it to the release
- Test builds can use a local mock update server via the build-time variable `KEYOVERLAY_TEST_UPDATE_BASE`
  (never set it in a real build)
