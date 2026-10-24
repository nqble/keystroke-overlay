# 0014: The repository is written for everyone; working notes live elsewhere
Status: Accepted (replaces 0011)
Date: 2026-10-21

## Context
The maintainer builds the app with several Claude Code sessions. Under [0011](0011-working-notes-are-public-in-one-folder.md)
their plans, audits, release drafts and cleanup lists lived in a public folder, `docs/for-claude/`, and parts of the
reference docs had started to read as notes to the maintainer or to one of those sessions. The repository is also what
outside contributors, and the Claude sessions they run, read to understand the project.

## Decision
- **Everything in the repository is written for everyone:** users, contributors and any Claude session a contributor
  runs. No document is addressed to the maintainer or to a particular session; where the maintainer's approval is
  needed, the docs say "the maintainer" and how to ask (a pull request or an issue).
- **Plans for things not built yet** that anyone could pick up are public, one file each, in
  [docs/proposals/](../proposals/README.md), with a Status line. A built proposal becomes reference docs and is deleted.
- **Working notes for the maintainer's own setup** (session queues, release drafts, cleanup lists, finished plans) are
  kept outside the repository.
- `npm run check:docs` enforces where a markdown file may live and that every proposal is listed.

## Why
- A contributor, or their Claude session, should be able to read any document and act on it without knowing the
  maintainer's setup.
- Being open about how the project is built stays a goal: it gets its own public page, written for readers, rather than
  raw working notes.

## Consequences
- `docs/for-claude/` is gone; its open proposals moved to `docs/proposals/`, the rest left the repository (git history
  keeps every version).
- CLAUDE.md, CONTRIBUTING.md and the docs index say where documents go.
