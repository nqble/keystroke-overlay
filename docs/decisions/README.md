# Decision records

Short notes on **why** the project is built the way it is today. Read these before changing something that looks odd:
there is usually a reason, and the reason is written down here. Ideas that are *not* decided live in
[ideas-not-decided.md](ideas-not-decided.md).
Plans for things not built yet are in [../proposals/](../proposals/README.md).

| # | Decision | Status |
|---|---|---|
| [0001](0001-plain-web-code-no-build-step.md) | Plain HTML/CSS/JavaScript, no build step | Accepted; partly replaced by 0013 (settings window, v2.0) |
| [0002](0002-local-only-server-and-optional-secure-link.md) | The overlay server is local-only; the secure link is optional | Accepted |
| [0003](0003-two-keyboard-input-methods.md) | Two keyboard input methods (hook and Raw Input) | Accepted |
| [0004](0004-update-channels-and-version-numbers.md) | Stable and Latest update channels, tied to the version number | Accepted |
| [0005](0005-keystrokes-live-in-memory-only.md) | Keystrokes live in memory only, and tests enforce it | Accepted |
| [0006](0006-layouts-themes-animations-are-data-files.md) | Layouts, themes and animations are plain files, not a free-form plugin system | Accepted |
| [0007](0007-versioned-settings-with-migrations.md) | Settings are versioned JSON with migrations | Accepted |
| [0008](0008-update-checks-never-install-on-their-own.md) | Update checks run hourly but never install anything on their own | Accepted |
| [0009](0009-secure-link-stays-optional.md) | The secure link stays optional, also for new installs | Accepted |
| [0010](0010-the-apps-identity-lives-in-one-place.md) | The app's name, repository and identifiers live in one place | Accepted |
| [0011](0011-working-notes-are-public-in-one-folder.md) | The Claude sessions' working notes are public, in one folder, with a placement rule | Replaced by 0014 |
| [0012](0012-releases-stay-unsigned-for-now.md) | Releases stay unsigned for now (SignPath declined; may apply again later) | Accepted |
| [0013](0013-preact-with-htm-for-the-settings-window.md) | Preact with htm for the settings window (v2.0) | Accepted |
| [0014](0014-the-repository-is-written-for-everyone.md) | The repository is written for everyone; working notes live elsewhere | Accepted |
| [0015](0015-settings-theme-colors-in-javascript.md) | Settings window theme colors are worked out in JavaScript | Accepted |

## How to add one

Copy any record, number it next in line, and keep it to one page:

```
# 00NN: Short title
Status: Proposed | Accepted | Replaced by 00MM
Date: YYYY-MM-DD

## Context     what problem or choice came up
## Decision    what we chose, in one or two sentences
## Why         the reasons, including what we gave up
## Consequences  what this means for contributors; how to change it later
```

Never delete an accepted record. If a decision changes, add a new record and mark the old one "Replaced by".
