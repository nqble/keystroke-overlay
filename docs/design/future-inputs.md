# Future inputs and features: the plan to follow

Status: **design only, except the pause shortcut** (built in v2.0: `hotkeys.pause`, src-tauri/src/hotkeys.rs; next/previous layout and open settings are not built). **None of the rest is promised.** Jordan may add some of these later
(mouse clicks and controller input are candidates for v2.0). This page fixes the decisions that are hard to change later,
so whoever builds one of these features, a person or a Claude session, builds it the same way. Read it before starting
any of them, and update it if a decision changes.

Covered: mouse buttons, game controllers, game detection, global hotkeys, and an overlay window outside OBS.

## 1. Principles for every new feature here

1. **Off by default.** Each new input source or feature is opt-in in settings. A fresh install behaves exactly as today.
2. **Privacy first** (CLAUDE.md §1). Each feature records the least it can (rules in §7), keeps it in memory, sends it
   only to the local overlay, and updates PRIVACY.md and `tools/check-privacy.mjs` in the same change, never weakening them.
3. **Lightweight.** Nothing runs unless the feature is on: no polling while idle, no extra thread or window when off.
4. **Behind the seam.** Operating-system code goes only in `src-tauri/src/platform.rs` or `src-tauri/src/keyboard/` (or a
   sibling folder for a new input kind), with a "not available on this system yet" fallback elsewhere
   ([CROSS-PLATFORM.md](../CROSS-PLATFORM.md)). Build Windows first; other systems follow the same interface.
5. **Shared code stays shared.** Layouts, the editor, themes, animations and the overlay treat every input the same way,
   so a new input kind needs no changes there beyond what §2 and §3 allow.

## 2. One naming scheme for everything you can press

Every pressable thing is a "key" with a name, like keyboard keys today (`KeyW`, `Space`). Names say what they are by
their prefix, and never collide with keyboard names (DOM `KeyboardEvent.code`).

| Kind | Names |
|---|---|
| Keyboard (today) | DOM `KeyboardEvent.code` names: `KeyW`, `Space`, `ShiftLeft`, `Numpad0`, … |
| Mouse buttons | `MouseLeft`, `MouseRight`, `MouseMiddle`, `MouseBack`, `MouseForward` |
| Mouse wheel | `WheelUp`, `WheelDown`, `WheelLeft`, `WheelRight`: each notch is sent as a short press (down, then up) |
| Controller buttons | The web's standard gamepad layout: `PadA`, `PadB`, `PadX`, `PadY`, `PadLB`, `PadRB`, `PadLT`, `PadRT`, `PadBack`, `PadStart`, `PadLS`, `PadRS`, `PadUp`, `PadDown`, `PadLeft`, `PadRight`, `PadHome` (A/B/X/Y by position, as on an Xbox pad, whatever the controller's own labels say) |
| Controller analog | Sticks `PadStickL`, `PadStickR` (x and y), triggers `PadLT`, `PadRT` (0 to 1): see §3 |
| Placeholders (reserved) | `Unlinked1`, `Unlinked2`, …: a layout key that is drawn but linked to nothing (Import from KLE); no capture source may produce a name starting with `Unlinked` |

Several controllers: the first one connected uses the names above. A second one adds a number (`Pad2A`, …). Only
add that when it's actually needed.

Consequences, by design:
- **Layouts need no format change.** A layout key's `code` may be any of these names, so one layout can mix keyboard,
  mouse and controller. Add new built-in layouts (e.g. a mouse, an Xbox pad) as plain layout files, as today.
- **The key editor, themes, animations, labels, hiding and even grid work unchanged** for these names.
- Each capture source maps its native codes to these names in one table, like `keyboard/keymap.rs` and
  `keyboard/linux_keys.rs`.

## 3. The overlay protocol

Existing messages ([PROTOCOL.md](../PROTOCOL.md)) carry the new names unchanged: `{"t":"d","k":"MouseLeft"}`,
`{"t":"u","k":"PadA"}`, and `snap` lists every held name of every kind.

**Reserved for analog input** (do not use `"a"` for anything else):

```json
{"t":"a","k":"PadStickL","x":0.42,"y":-1}
{"t":"a","k":"PadRT","v":0.8}
```

- Sticks: `x`, `y` from −1 to 1 (right and down are positive). Triggers: `v` from 0 to 1.
- Send only on change, rounded to 2 decimals, at most about 60 per second per control, never when idle.
- A trigger past 0.5 also sends a normal `d` / `u` for its name, so on/off layouts work without analog support.
- Old overlays ignore unknown message types, so adding `a` never breaks an older OBS page.

## 4. Several input sources at once

Today `keyboard::Bus` runs one keyboard capture method. When the first new input kind is added:

- Run **independent sources side by side** (keyboard, mouse, controller), each a module with `start(tx) -> Handle` and
  `Handle::stop()` like `keyboard/hook.rs`, all sending into the same channel and dispatcher. Each is started only when
  its setting is on, and stopped when turned off.
- The dispatcher, the held-keys set, pause and the WebSocket stay as they are: they already work on names.
- The keyboard's two methods (Standard / Compatibility) stay a keyboard-only choice.
- Likely system APIs, for whoever builds it: Windows mouse via a low-level mouse hook or Raw Input (buttons only); Windows
  controllers via XInput / Windows.Gaming.Input; Linux via evdev; macOS via IOKit / GameController. Ask Jordan before
  adding a dependency (CLAUDE.md §7).

## 5. Settings: reserved sections

Settings are versioned with migrations (`src-tauri/src/settings.rs`). These names are reserved so later additions are
plain, additive changes:

```json
"inputs":  { "mouse": { "enabled": false }, "gamepad": { "enabled": false } },
"games":   { "enabled": false, "rules": [ { "program": "VALORANT.exe", "layout": "wasd", "preset": "" } ] },
"hotkeys": { "enabled": false, "pause": "" },   // built (hotkeys.rs); add "nextLayout": "" when that is built, and make
                                                //   set_pause_hotkey merge into this object instead of replacing it
"window":  { "enabled": false, "x": 0, "y": 0, "clickThrough": true, "alwaysOnTop": true }
"obs":     { "scenes": { "enabled": false, "rules": [] } }   // built on advisor/obs-scenes (obs_scenes.rs); a later
                                                //   obs-websocket feature adds to "obs" instead of a new name
```

Shapes may change while designing a feature, but keep these top-level names and the "off by default" values. The
keyboard's input method stays at `general.inputMethod`.

## 6. Features that aren't inputs

### Game detection
- A `platform.rs` helper returns the **program name of the foreground app** (e.g. `VALORANT.exe`), checked **only when the
  foreground app changes** (Windows: a `SetWinEventHook` foreground event, not polling).
- Use: per-game rules in `games.rules`, which switch layout and/or style preset automatically, then switch back.
- Stored: only the rules the user writes. The detected name is never saved, logged or sent anywhere, overlay included.

### Global hotkeys
- Use Tauri's global-shortcut plugin (cross-platform), not our own hook. Ask Jordan before adding it.
- Actions: pause/resume the overlay, next/previous layout, open settings. Empty (off) until the user sets them.
- The plugin is loaded only once a hotkey is set (`hotkeys.rs`): on Linux X11 it wakes 20 times a second, so loading it at start-up
  broke the ~0% idle promise for everyone without a hotkey.
- Hotkeys never turn privacy features off (secure link, pause state shown in the tray) without the user seeing it.

### Overlay window outside OBS
- A Tauri window that loads **the same overlay page** from the local server: transparent, always on top, click-through,
  no taskbar entry, positioned with `window.x/y`. No second copy of overlay code.
- It costs a web view (~100 MB) while open, so it exists **only while `window.enabled` is on**, and is destroyed when
  turned off, like the settings window. Measure with the benchmark.

## 7. Privacy rules (decided now, hardest to retrofit)

- **Mouse:** buttons and wheel notches only. **Never the pointer position or movement.**
- **Controllers:** buttons and analog values only, while the feature is on.
- **Game detection:** the program name only, **never window titles** (they can contain document, chat or account names),
  and only compared against the user's rules.
- **Hotkeys:** only the shortcuts the user sets are registered; no other key handling.
- Each feature adds its line to PRIVACY.md and its rule to `tools/check-privacy.mjs` in the same change.

## 8. Building one of these: checklist

1. Re-read this page and CLAUDE.md; propose the plan to Jordan (it's a big change, CLAUDE.md §7).
2. Names (§2), protocol (§3), settings section (§5), privacy rules (§7): use them as written or update this page first.
3. Windows first, behind the seam, with a fallback elsewhere; the setting is off by default.
4. Tests: name-table unit tests, settings migration and sanitizer tests, an e2e for the feature, and benchmarks showing
   no cost while off.
5. Docs: PRIVACY.md, PROTOCOL.md / FILE-FORMATS.md if they changed, README feature list, this page's status.
