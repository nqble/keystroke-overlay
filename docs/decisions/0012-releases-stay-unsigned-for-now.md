# 0012: Releases stay unsigned for now
Status: Accepted
Date: 2026-10-19

## Context
Windows shows a SmartScreen warning for installers without a code signature (Authenticode). The project applied for free
signing from SignPath Foundation. On 2026-10-18 SignPath declined for now: the Foundation program is for projects that
already show public visibility (stars, forks, contributors, articles, discussions), and invited a new application later.
Paid routes exist: a SignPath subscription, or Microsoft's Azure Trusted Signing (about US$10 a month).

## Decision
Releases stay unsigned for now, with no paid signing. The maintainer may apply to SignPath Foundation again once the project is
better known.

## Why
- Free, and nothing to set up. SmartScreen warnings fade on their own as more people download each release.
- Updates are already safe without it: every update is signed with the project's own update key, and the app installs
  nothing else.
- What we give up: new users see "More info → Run anyway" on the first install, and antivirus tools are a little quicker
  to flag an unsigned program that reads the keyboard.

## Consequences
- The README says releases are not code-signed yet. The release workflow keeps its SignPath steps switched off (they run
  only when `SIGNPATH_ORGANIZATION_ID` is set), so applying again needs no code change: docs/RELEASING.md, "Code signing".
- If unsigned downloads start costing users, look at Azure Trusted Signing first (cheaper). A new record replaces this one.
