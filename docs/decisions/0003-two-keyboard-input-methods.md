# 0003: Two keyboard input methods (hook and Raw Input)
Status: Accepted
Date: 2026-10-15

## Context
Showing keys while a game has focus needs a global keyboard reader. The usual Windows way is a low-level keyboard hook,
but some games and anti-cheat tools block hooks.

## Decision
Two interchangeable methods feed the same pipeline (repeat filtering, stuck-key protection, key naming):
- **Standard** (default): a low-level keyboard hook (`WH_KEYBOARD_LL`). Works with nearly every game.
- **Compatibility**: Windows Raw Input, read through a hidden message-only window. For games that block hooks.

Switching is live, with no restart, and a key held during a switch is released rather than left stuck.

## Why
- One method cannot cover every game, and users cannot diagnose anti-cheat behavior themselves, so a visible switch is the
  honest answer.
- Both methods measured the same on CPU use, so Standard stays the default because it is the one proven in the field.

## Consequences
- On Linux (from v1.4.0, built from source; no Linux release yet), Standard is X11 XInput2 raw events (`keyboard/x11.rs`); Compatibility is
  Windows-only ([LINUX-PORT.md](../LINUX-PORT.md)).
- New capture code must go through the shared tracker and key naming (`src-tauri/src/keyboard/`), so every method
  behaves identically.
- `tests/e2e/suites/input-methods.mjs` checks that both methods produce the same sequence and that switching never
  doubles, loses or sticks a key.
- The window library registers its own Raw Input in the same process, which blinds the hook while the settings window is
  focused. The app turns that off on purpose (`device_event_filter(Always)` in `main.rs`); do not remove it. The `focus`
  test guards this.
