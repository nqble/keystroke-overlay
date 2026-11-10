# 0017: Macs update in the app
Status: Accepted
Date: 2026-11-10

## Context
Since v2.0 the Mac download had no in-app updates: `latest.json` and `stable.json` had no Mac entry, and a Mac's check
sent people to the Releases page. Windows and the Linux AppImage update in the app. The Mac app is signed ad hoc, not
by Apple ([0012](0012-releases-stay-unsigned-for-now.md)), so macOS treats every build as a new program: after an update
its keyboard permission (Input Monitoring) still looks switched on while it delivers no keys, with no error to show.

## Decision
- **Macs update in the app, like Windows and Linux** (the maintainer's choice, 2026-11-10). `mac-app.yml` packs the
  app as `Keystroke-Overlay_<version>_macOS-arm64.app.tar.gz` with no secrets; `mac-publish` in `release.yml` signs it
  with the update key (in the approved `release` environment, one step only) and adds `darwin-aarch64` entries to the
  manifests, the way `linux-publish` does for the AppImage. The two jobs take turns on the manifests.
- **The permission is renewed in the window.** The app remembers which version last proved that capture works (a
  version number, never a key). When a Mac runs another version, macOS says "allowed" and no key has arrived, the
  notice offers **Renew keyboard access**: it resets this app's entry (`tccutil reset ListenEvent <identifier>`) and asks
  again; the person switches the app on and restarts it.
- After installing, the app restarts the Mac way (`platform::restart_app`), since Tauri's own restart leaves it closed.
- **Releases are signed with the project's own Mac certificate** (the maintainer's choice, 2026-11-10): self-made,
  kept as a secret of the `release` environment, used by `mac-sign` in `release.yml`. macOS then keeps the keyboard
  permission across updates, so the renewal is needed only once (the first update signed this way) or after a new
  certificate. Gatekeeper still asks for **Open Anyway** on the first download: only Apple's paid Developer ID with
  notarization removes that ([0012](0012-releases-stay-unsigned-for-now.md) stands).

## Why
- Every Mac user stayed on the version they first downloaded unless they noticed a new release by themselves.
- Updating without renewing the permission would leave the overlay silently empty, which is worse than no update.
- A file the app downloads itself is not quarantined, so an in-app update avoids the "Open Anyway" step a new download
  needs.
