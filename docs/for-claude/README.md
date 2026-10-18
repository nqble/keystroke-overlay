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

- [ui-foundation.md](proposals/ui-foundation.md): hooks, screenshot tests, design tokens, shared building blocks (done)
- [loading-and-lifetime.md](proposals/loading-and-lifetime.md): keeping tabs alive, cached lists, overlay performance (done, with the measured decisions)
- [reuse-prep.md](proposals/reuse-prep.md): preparing the code to be reused in other programs, after v2.0
- [tailscale-dual-pc.md](proposals/tailscale-dual-pc.md): dual-PC streaming through Tailscale Serve (proposed, not decided)
- [good-first-issues.md](proposals/good-first-issues.md): draft "good first issue" tickets (not posted)
- [done/key-editor-polish.md](proposals/done/key-editor-polish.md): the first key editor plan, superseded by the design spec

## Audits and drafts

- [CLEANUP.md](CLEANUP.md): the cleanup audit and the order to work through it
- [NEXT-RELEASE.md](NEXT-RELEASE.md): the draft notes and the to-do list for the release in progress
