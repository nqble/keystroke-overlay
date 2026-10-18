# 0009: The secure link stays optional, also for new installs
Status: Accepted
Date: 2026-10-18

## Context
The secure link ([0002](0002-local-only-server-and-optional-secure-link.md)) stops other programs on the PC from reading key
presses through the overlay port. For v1.4 it was proposed to turn it on by default for new installs (and keep it off for
existing ones, so their OBS link keeps working). Jordan decided against it.

## Decision
The secure link is **off by default for everyone**, new installs included. It is a choice the user makes in General →
Secure link. Settings files that never mention it stay off. "Reset all settings" keeps the port and the secure link (and its
key), so a reset never changes the OBS link and never turns the protection off.

## Why
- With it off the OBS link is plain (`http://localhost:7878/`) and needs no extra step; with it on, the key is part of the
  link and has to be pasted into OBS, and "Make a new key" cuts old links off. That is a trade-off for the user to pick, not
  something to switch on behind their back.
- The risk it closes (another program on the same PC, or another Windows user) is stated plainly in PRIVACY.md and README.md,
  with the way to turn it on.

## Consequences
- `defaults()` in `src-tauri/src/settings.rs` keeps `secureLink` false; no first-run code turns it on.
- Anything that offers the protection (docs, the settings text) must say it is optional and off by default.
- To change this, add a new decision record and mark this one replaced.
