# Documentation index

Start here. The root of the repository holds the files GitHub expects (README, CHANGELOG, CONTRIBUTING, SECURITY, PRIVACY,
CODE_OF_CONDUCT) and [CLAUDE.md](../CLAUDE.md), the rules for Claude sessions.

## Using the app

- [USER-GUIDE.md](USER-GUIDE.md): everything about using the app (OBS settings, two PCs, input methods, secure link,
  layouts, troubleshooting); the root README is the short version
- [GAMES.md](GAMES.md): the games the overlay has been tested in, and what happened (anti-cheat notes)

## How it works (reference)

- [ARCHITECTURE.md](ARCHITECTURE.md): the parts of the app and how they connect
- [PROTOCOL.md](PROTOCOL.md): the local server and WebSocket messages
- [FILE-FORMATS.md](FILE-FORMATS.md): settings, layouts, themes, animations (schemas are in [schemas/](schemas))
- [EXTENDING.md](EXTENDING.md): adding a layout, theme or animation
- [DEBUGGING.md](DEBUGGING.md) and [ACCESSIBILITY.md](ACCESSIBILITY.md)
- [../tests/README.md](../tests/README.md): the test suites and the `data-test` hooks

## Releasing and the project

- [RELEASING.md](RELEASING.md): how a release is made
- [DOCS-STYLE.md](DOCS-STYLE.md): how the docs and the app's text are written (words, voice, where each fact lives)
- [OPEN-SOURCE-GUIDE.md](OPEN-SOURCE-GUIDE.md): running the project in the open

## Other platforms

- [CROSS-PLATFORM.md](CROSS-PLATFORM.md), [LINUX-PORT.md](LINUX-PORT.md), [MAC-PORT.md](MAC-PORT.md)

## Decisions, designs and proposals

- [decisions/](decisions): short numbered records of choices already made (start with its README)
- [design/](design): approved designs: [key-editor.md](design/key-editor.md), [future-inputs.md](design/future-inputs.md)

## For Claude sessions

- [for-claude/](for-claude/README.md): the working notes of the Claude sessions that help build this project (plans, the
  cleanup audit, the draft notes of the release in progress). They are public on purpose, but written for the sessions and
  the maintainer: contributors can ignore them.
