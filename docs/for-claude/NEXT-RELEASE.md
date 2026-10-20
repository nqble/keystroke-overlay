# What is next: v2.0 (in development)

v1.4.0 (the key editor) was released on 2026-10-19. This page tracks the work towards the next version. Nothing here is
released until Jordan says so.

## What is released
The release notes of every version live in one place, [CHANGELOG.md](../../CHANGELOG.md), in the format the release check
requires ([RELEASING.md](../RELEASING.md)); this page does not repeat them. The numbers in v1.4.0's Performance section come
from `tests/bench/run.mjs` (clean run of 2026-10-18).

## What is in development
v2.0 is built on `advisor/v2.0` (the Mac port from `mac/port` is merged into it regularly). Fixes for 1.4.x start from `main`. When v2.0 ships, this page
becomes the draft notes for the version after it.

## Draft release notes for v2.0.0 (for Jordan to read; moves into CHANGELOG.md on release day)

Written 2026-10-20 from the commits on `advisor/v2.0`. Not final: KLE import is added once its design pass is done, and
the Performance numbers come from a `tests/bench/run.mjs` run of v1.4.0 and v2.0 on the same PC before the release (the
ones below are single measurements, not a benchmark).

```markdown
## v2.0.0 — a new look, on every system

### ✨ New
- **Mac and Linux downloads.** Every release now has an Apple Silicon app for macOS 11 and newer, and an AppImage and a .deb for Linux. On a Mac it lives in the menu bar, asks for keyboard access once (and again after each update), and Command+W and Command+Q work as you'd expect. On Linux it captures keys on X11 desktops, and on Wayland for users in the `input` group.
- **A new settings window.** Every tab has been redesigned: layout cards you can reorder and hide, a theme gallery and preset cards on the Style tab (with Fonts now part of it), animation cards that play their own animation when you point at them, and General in tidy section cards.
- **Eight more built-in layouts:** 60%, 65%, 75%, 96%, full-size ISO, TKL ISO, Arrows and Numpad, under **Other layouts** in the New layout popup.
- **A first-run setup** walks new users through adding the overlay to OBS.
- **OBS scene rules.** Hide the overlay, or show a different layout, in the OBS scenes you choose (**General → OBS scenes → Edit scenes…**). Off until you turn it on.
- **A pause shortcut** that works from any app, even in a game (**General → Pause shortcut**). Off until you set one.
- **Key labels follow your keyboard language,** live, on Windows, Mac and Linux, so an AZERTY or QWERTZ keyboard shows its own letters.
- **The header always shows where you stand:** Live in OBS, Paused or Not connected, and a red warning when the port is taken or the OBS URL has changed. **Copy OBS URL** is always at the top right, and the live preview has its own round pause button.
- **In-app updates on Linux** for the AppImage. (A copy installed from the .deb says where to get new versions instead.)
- **Trackpad support** in the key editor: two-finger panning, pinch to zoom, and Space + drag.

### 🛠 Improved
- **Shorter, plainer wording** everywhere, with each system's own words (tray or menu bar, Ctrl or ⌘, Start with Windows or Open at login).
- **One look for every popup,** with the same size rules and soft fades on every scrolling area.
- **New app icon:** the keycap logo, on every system.
- **A clearer user guide:** two tested ways to use two PCs (an SSH tunnel, or Tailscale's port forward), other streaming apps (Streamlabs, XSplit, vMix, Meld), and using the app fully offline.

### 🐛 Fixed
- **Going back to v1.4.0 no longer loses v2.0's settings:** v2.0 saves a newer settings version, so v1.4.0 keeps a copy first.
- **No background wake-ups on Linux** when no pause shortcut is set.
- **The overlay redraws its keys when their letters change.**
- **The locked notice in the overlay** names the right place for the secure link.

### ⚡ Performance — v2.0.0 vs v1.4.0
- [Numbers from the benchmark run before release.] Measured on a v2.0 build: about 3 MB of memory and 0% CPU at idle on Windows with the settings window closed, which closes completely within about 10 seconds; 0.0% CPU at idle on a Mac.

### 🧰 Under the hood
- The settings window is built with Preact (small, pinned and fingerprint-checked; still no build step), one component per tab.
- The privacy check also catches WebSocket clients and any way a macOS event tap could do more than listen.
- A UI sandbox runs the settings window in a browser with a fake app, for designing and testing screens.
- CI builds and tests Windows, macOS and Linux (X11 and Wayland) on every change.
```

## How a release is made
See [RELEASING.md](../RELEASING.md): the one place for the steps.
