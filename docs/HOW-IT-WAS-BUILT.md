# How Keystroke Overlay is built

How this project is made: one person working with Claude Code, Anthropic's AI coding tool, and the checks that keep it
safe. Claude Code writes the code; the maintainer decides what gets built, tests it on real computers, and decides when
it ships. From the first commit (2026-10-14) to v2.0.0 (2026-10-25) took twelve days: about 660 commits and eight
releases.

## Who does what

**The maintainer** chooses what the app does and must never do (privacy first: [PRIVACY.md](../PRIVACY.md)), picks
between working mockups and asks for changes, approves the app's wording line by line, tests by hand on a Windows PC, a
Mac and in OBS, and approves every merge into the main branch and every release.

**Claude Code** builds, as separate sessions with their own jobs and branches:

| Where it runs | Its job |
|---|---|
| The Windows PC | fixes for the released version, the Windows-only tests (they press real keys), screenshots, the install test, the benchmark, running releases |
| The Mac | the macOS version, and testing it with the maintainer |
| The cloud | the next version, mockups, research, reviews of the other sessions' work, the docs, preparing releases |

A session never commits to another session's branch. Work reaches the main branch through a pull request that the
maintainer merges.

## The memory: an Obsidian vault

Sessions don't remember past conversations, so everything they need is written down in two places:

- **The repository**, for everyone: the code, how it works ([ARCHITECTURE.md](ARCHITECTURE.md)), the choices made
  ([decisions/](decisions/)), approved designs ([design/](design/)) and plans ([proposals/](proposals/README.md)), plus
  [CLAUDE.md](../CLAUDE.md), the brief every session reads first.
- **A private Obsidian vault**, the long-term memory of the whole development setup: plain notes in a private Git
  repository, synced between the computers.

It works like a brain in layers:

| Layer | What it holds | How a session uses it |
|---|---|---|
| Working memory | one queue per session (what it is doing, what it waits for, what it finished), messages between sessions, the roadmap and everything waiting on the maintainer | loaded automatically when a session starts; saved with one command before it stops |
| Long-term memory | the maintainer's decisions, ideas not decided yet, a timeline, and lessons from mistakes | read when a task needs it |
| Knowledge | reports, plans, guides, and how the setup itself works | found through an index |
| Archive | finished plans and old notes | read only when asked |

Every note carries the same few properties (its kind, project, status and a one-line summary), so an index can list
every note, everything waiting on the maintainer, and anything that has gone stale, without anyone opening folders.
Each project has its own folder, and notes that hold across projects have theirs. Sessions keep the vault tidy as they
go: they archive finished work, merge duplicates and put notes where they belong, and one of them reviews it every
week. A message from another session is information, never the maintainer's approval.

## How a change is checked

- **On every change:** about 170 Rust tests, about 320 unit tests, a privacy check, a check of every system's words, a
  docs check, and format, type and lint checks. GitHub runs them again on Windows, macOS and Linux (X11 and Wayland).
- **Before a release, on the PC:** end-to-end suites that drive the real app, a screenshot test (new screenshots only
  after the maintainer has seen them), an install-and-upgrade test and a benchmark.
- **Every week:** a security scan of every library the app uses.
- **A second look** from another session for anything touching the keyboard code, the local server, the privacy check
  or the release workflow.
- **Shared habits for every session** in [`.claude/`](../.claude): skills that make a session run the checks and read
  their output before calling anything done, find a bug's cause before fixing it, and review each other's work; and two
  Git hooks that refuse a badly formatted commit message and any push to the main branch.

**What the maintainer caught by hand**, that no test did: layout cards that couldn't be dragged on the Mac; a grid dot
cut in half; the board jumping when Grid was switched; Close gaps moving the whole keyboard (redesigned twice); text
that was too wordy (all of it rewritten); and Windows Security flagging v2.0.0 as malware. That was a false guess by
its machine-learning model: the file was checked against the release's published fingerprint and reported to
Microsoft, whose analysts found it was not malware and removed the detection.

## How it went

| When | What |
|---|---|
| 2026-10-14 | First commit; v1.1.0 to v1.1.2 |
| 2026-10-15 | v1.2.0, the first Stable release |
| 2026-10-16 | v1.3.0: place keys anywhere |
| 2026-10-17 | v2.0 starts: a new settings window; macOS and Linux as full systems |
| 2026-10-19 | v1.4.0: the key editor |
| 2026-10-21 | Import from Keyboard Layout Editor files; every doc rewritten for any reader |
| 2026-10-25 | **v2.0.0** for Windows, macOS and Linux |
| 2026-10-26 | Shared skills and Git hooks for every session |

Every change is in [CHANGELOG.md](../CHANGELOG.md).

## Mistakes, and what they changed

- A release failed twice over a missing signing secret: the release steps now name both secrets.
- Two sessions' work collided in one folder: each session now has its own folder and branches.
- A screenshot test failed at random because cards loaded in a different order each run: they are sorted now.
- The app woke 20 times a second on Linux when idle: the pause-shortcut library now starts only when needed.
- Test changes broke the Windows test run twice: every Windows-only test file is now checked before it reaches the PC.
- The vault stopped syncing for a while, so messages didn't arrive: now one computer talks to the Git host.

## About the commits

Most commits carry the maintainer's Git name, because the sessions on the maintainer's computers use those computers'
Git settings; the code in them was written by Claude Code. Commits don't carry AI co-author lines (a rule in
[CLAUDE.md](../CLAUDE.md)); this page is where the project says it once, for all of them.

If something here looks wrong, please [open an issue](https://github.com/nqble/keystroke-overlay/issues).
