# 0016: Mouse capture uses Raw Input on Windows, and never reads the pointer
Status: Accepted
Date: 2026-11-07

## Context
Showing mouse buttons and the wheel needs a global mouse reader on every system. On Windows the usual way is a
low-level mouse hook (`WH_MOUSE_LL`), as the keyboard's Standard method does ([0003](0003-two-keyboard-input-methods.md)).

## Decision
- **Windows uses Raw Input only** (a message-only window, `RIDEV_INPUTSINK`), with no mouse hook and no setting to
  choose between them. Linux X11 uses XInput2 raw button events; Linux Wayland reads the mice in `/dev/input`; macOS
  uses a second listen-only event tap. Each reads **buttons and wheel notches only**, and none ever reads the pointer's
  position or movement (enforced by `npm run check:privacy` and tests).
- **Physical buttons:** a left-handed setup shows the physical left button as `MouseLeft`, not the system's swapped meaning.
- **Real wheels only:** continuous trackpad and Magic Mouse scrolling is ignored on macOS; a wheel notch is one short
  press, at most one per direction every `MIN_TAP_MS`, so the overlay shows a steady flash instead of a flood.
- **Off by default** (`inputs.mouse.enabled`): while off there is no thread, hook, registration or open device.

## Why
- A hook sits in the input path (every pointer move waits for our callback), can be removed silently by Windows if it is
  slow, and always receives the position. Raw Input gives the app a copy: nothing waits for it, Windows can't remove it,
  and the position is never delivered to the code that reads it.
- Measured on Windows (`tests/bench/mouse-trial.mjs`, Windows e2e `inputs` suite): 0% CPU idle, about 0.8% of one core
  at 1,000 moves a second, flat thread and handle counts, so no batching is needed. An 8,000 Hz mouse is not measured.
- Raw Input is already the keyboard's second method, and a game that uses Raw Input itself is unaffected, since
  registrations are per process.

See also: [proposals/mouse-input.md](../proposals/mouse-input.md) (the plan and the measurements).
