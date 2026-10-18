# 0008: Update checks run hourly but never install anything on their own
Status: Accepted
Date: 2026-10-15

## Context
Users want to hear about updates quickly. Checking in the background costs a network request, and installing without asking
would be a surprise (and a risk).

## Decision
- While the app runs, it asks GitHub whether a newer version exists: the first time 45 seconds after start, then about once
  an hour (and when the settings window opens). General → "Check for updates automatically" turns this off completely, and
  while it is off no timer runs for it at all.
- If an update exists, the tray icon gets a small orange dot, the tray menu gets an "Update available" entry that opens
  General, and the settings window shows its update button.
- **Nothing is ever downloaded or installed until the user clicks the button and confirms.** Downloads are verified
  against the signing key built into the app. Once the user has clicked, the installer runs quietly (no installer window)
  and the app reopens itself on the new version (`installMode: quiet`).
- Updates are pulled by the app; there is no push channel from a server.

## Why
- A push service would need a server we run, a permanent connection from every user's PC, and would break the promise
  that the app only talks to GitHub, and only for updates. A one-request-an-hour check is cheap and keeps that promise.

## Consequences
- The update check is the only network use besides release notes, and only in `commands/updates.rs`. Privacy docs say "about once an hour".
- Changing the interval or adding any new network call needs a new decision record and a privacy-docs update.
