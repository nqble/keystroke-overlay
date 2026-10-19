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
2. **Stable channel release** (manual releases only; the Release workflow creates it if it is missing): on GitHub create a
   release tagged `channel-stable`, tick *pre-release* (so it never becomes "latest"), title "Stable channel". It only ever
   holds `stable.json`.

## Code signing (Windows, free from SignPath Foundation)

Two different signatures, both needed:
- **Update signature** (above): lets the app check an update came from us. Users never see it.
- **Code signing** (Authenticode): Windows shows it as the publisher. Without it, SmartScreen warns on every download
  and antivirus tools are quicker to flag a program that watches the keyboard. SignPath Foundation signs open-source
  projects for free; the certificate is in **their** name ("SignPath Foundation"), linked to this repository.

The release workflow is ready for it: until `SIGNPATH_ORGANIZATION_ID` is set it builds unsigned, as before. To turn
it on (Jordan, once):
1. **Apply** at signpath.org with this repository. They check it is open source (MIT), public, built on GitHub
   Actions, and has the "Code signing policy" section in README.md. Approval can take a few weeks.
2. Turn on **two-factor login** on GitHub and SignPath for everyone who can change the repository (they require it).
3. In SignPath, once the project exists:
   - an **artifact configuration** that signs every `.exe` in the uploaded zip (both uploads are one file each):
     ```xml
     <?xml version="1.0" encoding="utf-8"?>
     <artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
       <zip-file>
         <pe-file path="*.exe">
           <authenticode-sign/>
         </pe-file>
       </zip-file>
     </artifact-configuration>
     ```
   - the **release-signing** policy, with GitHub as its trusted build system and Jordan as approver (every signing
     request then waits for Jordan to approve it in SignPath, like the "release" environment on GitHub);
   - an **API token** for a CI user that may submit signing requests.
4. On GitHub → Settings → Secrets and variables → Actions:
   - secret `SIGNPATH_API_TOKEN`;
   - variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG` and
     `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG` (the names SignPath shows).

What a release then does (`.github/workflows/release.yml`): build the app's `.exe` → SignPath signs it → pack it into
the installer → SignPath signs the installer → check both signatures → make the update signature over the signed
installer → publish. Each SignPath step waits up to an hour for approval. `tools/release.mjs --stage app | installer |
finish` runs one part each; on your PC it runs all three, unsigned. The uninstaller inside the installer stays
unsigned (SignPath can't reach inside an NSIS installer); Windows only shows it when someone uninstalls.

## Versioning rule (decides the channel)

`x.y.z` — **the middle number is Stable, the last number is Latest.**

- **`x.y.0`** (1.2.0, 1.3.0, …) → published to **Stable and Latest**. These are the releases to recommend to everyone.
- **`x.y.z`, z > 0** (1.2.1, 1.2.2, …) → **Latest only**: quick fixes for people who want them right away.
- **An important fix for Stable users** (say, a bug in the first Stable release): when you run the Release workflow on a patch version, tick
  **"Also make this the Stable version"**. The release is then published to Stable too.

`tools/release.mjs` applies this automatically (it writes `stable.json` only when the version ends in `.0`;
`--stable` / `--latest-only` override it for a rare exception).

## The easy way: one click on GitHub (recommended)

The repository has a **Release** workflow (`.github/workflows/release.yml`) that does everything below by itself.

One-time setup (details in [OPEN-SOURCE-GUIDE.md](OPEN-SOURCE-GUIDE.md)): an environment named `release` with yourself as a
**required reviewer** (every release then waits for your approval before the signing key is used), holding both secrets:
`TAURI_SIGNING_PRIVATE_KEY` (the text of your `updater.key`) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (the key's password;
see "Signing key password" below). Keep both in the `release` environment, not at the repository level: an environment
secret wins over a repository secret with the same name, so a newer copy at the repository level is silently ignored.
That is what failed the first two v1.4.0 runs with "Wrong password for that key".

**Safety rules the workflow enforces:** it only releases a commit that is already on `main` (merge first); every GitHub
Action it uses is pinned to an exact commit, and Dependabot (`.github/dependabot.yml`) opens a pull request each month when
one has a new version, for you to review; and it uses no shared build cache, so nothing another workflow left behind can end
up inside a signed installer.

Each release (or just tell Claude "release v1.2.0": it can start the workflow for you with the GitHub command-line tool, and you only
have to approve it — from the website or the GitHub phone app):
1. Raise the version (`package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`;
   the release reads it from `tauri.conf.json`) and add the CHANGELOG entry — Claude can do both.
2. GitHub → **Actions → Release → Run workflow** → type the version to confirm → **Run** (or push a tag named `v<version>`).
3. It checks the version/tag/CHANGELOG match and that the release doesn't already exist, runs `npm test`, builds and signs the
   installer, creates the GitHub release with the CHANGELOG text as the notes, and — for `x.y.0` versions — updates the Stable channel.

The signing key is read from the encrypted secret and never appears in logs; pull requests from forks cannot access it.
The manual steps below are the fallback (and what the workflow runs internally).

## Signing key password

The update key has a password (since October 2026), kept in Jordan's password manager and in the `release` environment's secret
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Without it the key can't sign anything, and nobody can recover it.

To change the password, change it on the **same** key: that keeps the public key, so every installed copy keeps
updating. Never generate a new key for this: a new key would cut off every existing install from updates. On Windows,
in PowerShell, with [minisign](https://github.com/jedisct1/minisign/releases) downloaded (`$minisign` = the full path
of its `x86_64\minisign.exe`):

1. Back up `~/.keystroke-overlay-keys/updater.key` somewhere private and offline first.
2. Unpack it (the file is a base64-encoded minisign key), change the password, and pack it again:
   `[IO.File]::WriteAllBytes("$PWD\updater.minisign", [Convert]::FromBase64String((Get-Content updater.key -Raw)))`,
   then `& $minisign -C -s .\updater.minisign` (it asks for the current password, then the new one twice), then
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\updater.minisign")) | Set-Content updater.key -NoNewline`
   and delete `updater.minisign`.
3. Check it before relying on it: sign a test file with `npx --yes @tauri-apps/cli@<the project's version> signer sign
   -f updater.key test.txt` (the password in `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`), decode `test.txt.sig` and
   `plugins.updater.pubkey` (in `src-tauri/tauri.conf.json`) from base64, and run `minisign -V` on them. It must say
   "Signature and comment signature verified".
4. Update both secrets in the `release` environment, straight from the checked file and password so nothing is
   retyped (in the project folder, signed in with `gh auth login`; `$pw` is the password that passed step 3):

   ```powershell
   gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --env release --body $pw
   cmd /c "gh secret set TAURI_SIGNING_PRIVATE_KEY --env release < ""%USERPROFILE%\.keystroke-overlay-keys\updater.key"""
   gh secret list --env release
   ```

   The list should show both as just updated (`cmd`'s `<` passes the file unchanged; a PowerShell pipe can alter it).
   Then replace every backup of the old file.

## Release notes format

From v1.4.0 (v1.3.0 and earlier used bold lines, which the app still colors), every CHANGELOG entry uses only these sections, in this order, each as a `###` heading. Leave out a section with
nothing in it. The app colors each one in "What's new" and the update popup, and `tools/changelog-section.mjs` (run by
the release workflow) refuses an entry with another heading, the wrong order or a section twice.

| Heading | For |
|---|---|
| `### ✨ New` | things you couldn't do before |
| `### 🛠 Improved` | things that work better |
| `### 🐛 Fixed` | bugs that are gone |
| `### ⚡ Performance — vX.Y.Z vs vA.B.C` | speed and memory, with numbers against the last release (the part after " — " is free) |
| `### 🧰 Under the hood` | changes for developers |

Don't end the entry with "Your settings … are kept": the script adds that line to every release. The list of sections
lives in `ui/settings/release-notes.js`; add a section there, give it a color token in `settings.css`, and add a row
here.

## Every release (manual)

1. Raise `version` in the same five files as above (same number).
2. Add an entry to [CHANGELOG.md](../CHANGELOG.md) in the release notes format above.
3. `npm test`
4. Build + sign:
   ```bash
   npm run release -- "short note"              # Stable too, automatically, if the version is x.y.0
   npm run release -- --manual "short note"     # the in-app updater can't apply it; users are sent to GitHub
   npm run release -- --stable "short note"     # a patch release that Stable users should get too
   npm run release -- --latest-only "note"     # an x.y.0 that should not go to Stable (rare)
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

## Third-party notices

The app is built from open-source libraries whose licenses ask that their notices go with the app. The release
workflow writes them (`npm run notices`, using cargo-about 0.9.2 and `src-tauri/about.toml`), puts the file in the
installer (it lands next to the app as `THIRD-PARTY-NOTICES.html`) and attaches it to the GitHub release.

If a library update brings a license that is not listed in `src-tauri/about.toml`, the release stops there. Check that
the new license is compatible with MIT (permissive licenses like MIT, BSD or Apache are; GPL and AGPL are not), then add
it to the list. To try it on your PC: `cargo install cargo-about --version 0.9.2 --locked --features cli`, then
`npm run notices`.

## After publishing: antivirus

A program that reads the keyboard is exactly what antivirus tools watch for, and a new version has no reputation yet.
After each public release (it takes about five minutes):

1. Download the installer from the release page and scan it on your PC with Windows Security (right-click → Scan).
2. If Windows Security flags it, submit the installer at microsoft.com/wdsi/filesubmission as a **software
   developer**, and say it was detected incorrectly. In the notes, link the release page and say it is an open-source
   keystroke overlay for OBS whose keys never leave the PC. If nothing is flagged, there is nothing to do.
3. If a user reports another antivirus (Avast, Norton, Kaspersky, …), use that vendor's false-positive form the same way.

Signed releases (Code signing above) build reputation much faster, so these reports become rare.

## Checks before publishing a public release

- `npm run check:privacy` passes
- The latest **Security scan** run (it runs every Monday; Actions → Security scan) is green
- The full e2e suite passes on your PC (`npm run test:e2e`); the **E2E (Windows)** workflow runs the same suite on GitHub on demand, and becomes a required release step once it has passed reliably there
- Dependency licenses still compatible with MIT: checked automatically (see Third-party notices)
- Test builds can use a local mock update server via the build-time variable `KEYOVERLAY_TEST_UPDATE_BASE`
  (never set it in a real build)
