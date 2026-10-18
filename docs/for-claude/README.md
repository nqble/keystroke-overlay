# For Claude sessions

This folder holds the working notes of the Claude sessions that help build this project: plans, the cleanup audit and the
draft release notes. It is **public on purpose** (the project is open source, and so is the way it is built), but it is written
for Claude sessions and for the maintainer, not for users. Contributors can ignore it. The rules the sessions follow are in
[CLAUDE.md](../../CLAUDE.md) at the root of the repository.

New working documents go here (see the placement table in CLAUDE.md), and every one is listed below. `npm run check:docs`
fails when a file is missing from this list.

## Plans (`proposals/`)

Each plan starts with a **Status** line (queued, in progress, done or superseded). Finished plans move to
[proposals/done/](proposals/done).

- [done/ui-foundation.md](proposals/done/ui-foundation.md): hooks, screenshot tests, design tokens, shared building blocks (done)
- [loading-and-lifetime.md](proposals/loading-and-lifetime.md): keeping tabs alive, cached lists, overlay performance (in progress: A2 and A3 partly done, A1, A4 and A5 open; B6 and B7 decided against)
- [reuse-prep.md](proposals/reuse-prep.md): preparing the code to be reused in other programs, after v2.0
- [tailscale-dual-pc.md](proposals/tailscale-dual-pc.md): dual-PC streaming through Tailscale Serve (proposed, not decided)
- [v2-preact.md](proposals/v2-preact.md): moving the settings window to Preact with htm, for v2.0 (in progress: Keys and Debug left)
- [v2-tab-restructure.md](proposals/v2-tab-restructure.md): the v2.0 tab restructure (tabs, cards, the Layout and Animation tabs; done apart from the Preact Keys tab)
- [good-first-issues.md](proposals/good-first-issues.md): draft "good first issue" tickets (not posted)
- [done/key-editor-polish.md](proposals/done/key-editor-polish.md): the first key editor plan, superseded by the design spec

## Audits and drafts

- [CLEANUP.md](CLEANUP.md): the cleanup audit and the order to work through it
- [NEXT-RELEASE.md](NEXT-RELEASE.md): the draft notes and the to-do list for the release in progress
