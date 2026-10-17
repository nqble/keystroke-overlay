# Security policy

Keystroke Overlay watches the keyboard, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue** for a security or privacy problem.

Use GitHub's private reporting instead: on this repository open the **Security** tab → **Report a vulnerability**.
Include what you found, how to reproduce it, and the version (shown in *General → Program updates*).

You can expect an acknowledgement within a few days. This is a spare-time project, so fixes are best-effort, but anything
that could expose keystrokes is treated as the top priority.

## Supported versions

Only the latest release is supported. Update from inside the app (the update button) or from the
[Releases](../../releases) page.

## What is in scope

- Anything that could make keystrokes reach disk, a log, the network, or another machine
- Bypasses of the local server's Host/Origin protection (a website reaching the overlay port)
- Tampered updates being accepted (signature checking)
- Path traversal or code execution through layouts, fonts, presets or imported files

## Known and documented limits (not vulnerabilities)

See "The one limit you should know about" in [PRIVACY.md](PRIVACY.md): the local server is not authenticated against
other programs on the same computer unless the optional **Secure link** (General → Secure link) is turned on.

## Update signing

Updates are signed with a minisign key; the matching public key is built into the app (`src-tauri/tauri.conf.json`).
The private key is kept offline by the maintainer and is never stored in this repository.

## Automated security checks

- **Strict page policy.** The settings window runs under a content-security policy (`src-tauri/tauri.conf.json`): it can only run
  its own scripts, only talk to the app itself, and only embed the local overlay preview. A test (`tests/e2e/suites/csp.mjs`)
  confirms the policy blocks injected scripts and other websites while the normal interface keeps working.
- **Hostile-input tests.** Thousands of randomly corrupted settings files and imported layout files are fed to the app's
  cleaning code on every test run (`cargo test`). Nothing may crash, escape its folder, or get past the limits. The secure-link
  key check is tested the same way.
- **Read-only tests.** The automatic GitHub tests (`ci.yml`) have read-only access to the repository.
- **Scans.** Start either one on GitHub with **Actions → pick the workflow → Run workflow**:
  - **Security scan** (about 3 minutes; also runs by itself every Monday): looks up the libraries the app is built from in the public lists of known
    vulnerabilities (npm and RustSec). Red means something needs updating; open the log for the name.
  - **CodeQL** (about 5–10 minutes): GitHub's code scanner reads our own code for known bug patterns. Results appear
    under the repository's **Security → Code scanning** tab.
- **Privacy guard.** `npm run check:privacy` fails the build if network code, file writes in the keyboard code, or logging
  appears where it shouldn't (see [PRIVACY.md](PRIVACY.md)). It is a tripwire that reads the code line by line, not a proof.
- **Release pipeline.** Only a commit on `main` can be released, after the owner approves the run; every GitHub Action is
  pinned to an exact commit (Dependabot proposes updates for review), and the signing job uses no shared build cache
  (see [docs/RELEASING.md](docs/RELEASING.md)).
