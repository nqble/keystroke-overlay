# 0004: Stable and Latest update channels, tied to the version number
Status: Accepted
Date: 2026-10-15

## Context
Users want a dependable release, and some want every small fix quickly. Updates must be verified and never surprise anyone.

## Decision
- Versions look like `x.y.z`. **The middle number is Stable; the last number is Latest.**
  `1.2.0` goes to both channels; `1.2.1`, `1.2.2`… go to Latest only.
- Each channel has its own manifest on GitHub:
  - **Latest:** `latest.json` on the newest release.
  - **Stable:** `stable.json` on the fixed pre-release named `channel-stable`, replaced only when an `x.y.0` release is promoted.
  - **Exception, on purpose:** an important fix that Stable users must get can be promoted too: tick "Also make this the Stable version"
    when running the Release workflow (v1.2.1 was released this way).
- Updates are signed with a private key; the public key is built into the app. A download that does not match is
  rejected and never run.
- Users choose the channel in General → Program updates (Stable is the default and the recommended choice).

## Why
- Tying the channel to the version number makes the rule mechanical: `tools/release.mjs` decides it, nobody has to remember.
- Hosting everything on GitHub Releases needs no server of our own.

## Consequences
- Never move or delete the `channel-stable` release by hand; the release workflow manages it.
- A release that cannot be installed inside the app is marked `manual` in its manifest and sends users to the GitHub installer.
- See [RELEASING.md](../RELEASING.md) for the steps.
