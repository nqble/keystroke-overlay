# 0006: Layouts, themes and animations are plain files, not a free-form plugin system
Status: Accepted
Date: 2026-10-15

## Context
People want to customize the overlay and share what they make. A general plugin system would let outside code run inside
the app.

## Decision
Customization is limited to small, well-defined files:
- **Layouts** are JSON (`ui/overlay/layouts/*.json`, or the user's `layouts` folder, or made in the app and shared with
  Export / Import).
- **Themes** and **animations** are tiny JavaScript files that register themselves with `registry.js` and are loaded only
  by the overlay page.
- Presets are JSON (`style` + `animation`).

Formats are documented in [FILE-FORMATS.md](../FILE-FORMATS.md) with JSON schemas in `docs/schemas/`.

## Why
- Data files are easy to write, easy to review in a pull request, and safe to import (imports are validated and cleaned,
  never trusted).
- A general plugin system would put arbitrary code next to a keyboard reader and break the trust model in
  [0005](0005-keystrokes-live-in-memory-only.md).

## Consequences
- Theme and animation modules run only in the overlay page and receive only style options, never key input beyond
  press and release state.
- Adding capabilities means adding a documented data field, not exposing the app's internals.
