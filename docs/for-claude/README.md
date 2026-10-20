# For Claude sessions

This folder holds the working notes of the Claude sessions that help build this project: plans, the cleanup audit and the
draft release notes. It is **public on purpose** (the project is open source, and so is the way it is built), but it is written
for Claude sessions and for the maintainer, not for users. Contributors can ignore it. The rules the sessions follow are in
[CLAUDE.md](../../CLAUDE.md) at the root of the repository.

New working documents go here (see where a document goes, CLAUDE.md section 3), and every one is listed below. `npm run check:docs`
fails when a file is missing from this list.

## Plans (`proposals/`)

Each plan starts with a **Status** line (queued, in progress, done or superseded). Finished plans move to
[proposals/done/](proposals/done).

- [done/ui-foundation.md](proposals/done/ui-foundation.md): hooks, screenshot tests, design tokens, shared building blocks (done)
- [done/loading-and-lifetime.md](proposals/done/loading-and-lifetime.md): keeping tabs alive, cached lists, overlay performance (done, with the measured decisions)
- [reuse-prep.md](proposals/reuse-prep.md): preparing the code to be reused in other programs, after v2.0
- [done/tailscale-dual-pc.md](proposals/done/tailscale-dual-pc.md): a built-in dual-PC mode through Tailscale Serve (set aside: the SSH tunnel in the user guide instead)
- [done/v2-preact.md](proposals/done/v2-preact.md): moving the settings window to Preact with htm, for v2.0 (done)
- [done/v2-tab-restructure.md](proposals/done/v2-tab-restructure.md): the v2.0 tab restructure (tabs, cards, the Layout and Animation tabs; done)
- From the open-source research of 2026-10-19 (all proposed, none approved; one file each, to work through one at a time):
  - [obs-source-events.md](proposals/obs-source-events.md): scene awareness through the OBS Browser source's own page events (no network)
  - [kle-import.md](proposals/kle-import.md): turn a Keyboard Layout Editor (KLE) file into a layout
  - [keyboard-files.md](proposals/keyboard-files.md): import VIA, QMK and NohBoard keyboard files, after KLE
  - [controllers-gilrs.md](proposals/controllers-gilrs.md): controller input, gilrs compared with our own code
  - [mouse-input.md](proposals/mouse-input.md): mouse buttons and wheel with our own capture code
  - [obs-websocket.md](proposals/obs-websocket.md): talking to OBS from the app (recommended: not yet)
  - [stream-deck-companion.md](proposals/stream-deck-companion.md): Stream Deck control through Bitfocus Companion
  - [analog-keys-wooting.md](proposals/analog-keys-wooting.md): analog key pressure with the Wooting Analog SDK
  - [accessibility-checks.md](proposals/accessibility-checks.md): automatic accessibility checks with axe-core in the e2e tests
  - [two-pc-ndi.md](proposals/two-pc-ndi.md): a second two-PC route, sending the overlay as video with NDI (docs only)
- [good-first-issues.md](proposals/good-first-issues.md): draft "good first issue" tickets (not posted)
- [done/key-editor-polish.md](proposals/done/key-editor-polish.md): the first key editor plan, superseded by the design spec

## Audits and drafts

- [CLEANUP.md](CLEANUP.md): the cleanup audit and the order to work through it
- [NEXT-RELEASE.md](NEXT-RELEASE.md): where the releases stand (the last one, and what comes next)
