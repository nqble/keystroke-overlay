# 0001: Plain HTML/CSS/JavaScript, no build step
Status: Accepted
Date: 2026-10-15

## Context
The program has two web pages: the **overlay** that OBS loads, and the **settings window**. A frontend framework
(React, Vue, Svelte…) could build either one.

## Decision
Both pages are plain HTML, CSS and JavaScript files. There is no bundler and no compiler. `node_modules` holds only
development tools (the Tauri command-line tool, Prettier, TypeScript for type checks, pixelmatch and pngjs for screenshot
tests); none of them ships to users. The files in `ui/` are exactly what runs.

## Why
- **Easy to contribute:** open a file, edit, reload. Nothing to install or compile.
- **Privacy and trust:** every third-party package is code that could be tampered with, and this app watches the keyboard.
  Almost no dependencies means almost nothing to audit.
- **Light:** the overlay must stay as small as possible while you stream.
- **Cost we accept:** keeping the screen in sync with the data is hand-written, and that gets harder as the settings
  window grows. Ideas for that are listed in [ideas-not-decided.md](ideas-not-decided.md).

## Consequences
- Both pages stay plain JavaScript until a new decision record says otherwise.
- Adding a framework or a build tool needs a new decision record that explains why it is worth the extra tooling.
