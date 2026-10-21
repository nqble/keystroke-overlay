# 0011: The Claude sessions' working notes are public, in one folder, with a placement rule
Status: Superseded by [0014](0014-the-repository-is-written-for-everyone.md) (2026-10-21)
Date: 2026-10-18

## Context
Claude sessions write plans, audits and release drafts. They had spread over `docs/` and its sub-folders, mixed with the reference
docs people actually read.

## Decision
- Everything a session writes for itself or the maintainer (plans, audits, release drafts, handoff notes) goes in
  `docs/for-claude/` (listed in its README, each plan with a Status line, finished plans in `proposals/done/`).
- The folder is **public on purpose**: the project is open source, and so is the way it is built. README.md and
  CONTRIBUTING.md say what it is and that contributors can ignore it.
- `CLAUDE.md` holds the placement table, and `npm run check:docs` (also in CI) fails on a markdown file in the wrong
  place, a document missing from its index, or a broken link.
- Private work state (a session's queue and handoff prompt) is NOT kept in the repository.

## Why
- Readers find the reference docs without wading through plans; sessions know where a new document goes; a check keeps it that way.

## Consequences
- A change that makes a document wrong fixes that document in the same commit (CLAUDE.md section 3).
- Moving a document means fixing every link to it; `check:docs` finds the ones missed.
