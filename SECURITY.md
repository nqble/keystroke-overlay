# Security policy

Keystroke Overlay watches the keyboard, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue** for a security or privacy problem.

Use GitHub's private reporting instead: on this repository open the **Security** tab → **Report a vulnerability**.
Include what you found, how to reproduce it, and the version (shown in *General → Program updates*).

You can expect an acknowledgement within a few days. This is a spare-time project, so fixes are best-effort, but anything
that could expose keystrokes is treated as the top priority.

## Supported versions

Only the latest release is supported. Update from inside the app (the blue update button) or from the
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
