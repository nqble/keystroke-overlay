# Ideas, not decided

Things that have been discussed and look promising, but **no decision has been made**. They are here so the thinking is
not lost. Nothing on this page is a commitment, and none of it should be treated as how the project works today. If one of
these is chosen, it gets its own numbered decision record and leaves this page.

## Frontend structure
- Preact with htm for the settings window was decided for v2.0: see [0013](0013-preact-with-htm-for-the-settings-window.md).

## Project safety and structure
- **Branch protection on `main`** (changes through pull requests, CI must pass, no force-pushes). It would change how pushes
  work, so it needs the owner's decision.
- **Performance budgets** (startup time, idle memory, thread count) checked against the benchmark tool before a release.

## Possible features (see the roadmap discussion)
- Mouse clicks and gamepad inputs; an optional click-through on-screen overlay window for capture tools that cannot show a
  web page; a shortcut/ticker display mode; per-app profiles and auto-pause; an opt-in dual-PC mode through Tailscale Serve with an allowed-host setting, see
  [the two-PC plan](https://github.com/nqble/keystroke-overlay/blob/9f1ac68/docs/for-claude/proposals/done/tailscale-dual-pc.md) (set aside for the documented SSH tunnel); OBS scene awareness (being tried: [../proposals/obs-source-events.md](../proposals/obs-source-events.md)); Stream Deck / hotkey control.
- **Portable mode**, if people ask for it: settings and layouts kept in a folder next to the app instead of the system's
  data folder, so it runs from a USB stick or a synced folder with nothing installed. Open questions: how updates
  replace a portable copy, and how a portable copy and an installed one on the same PC stay apart. No network change.
- Any feature that adds network access, or changes what is stored, needs a decision record and a privacy-docs update first
  ([0002](0002-local-only-server-and-optional-secure-link.md), [0005](0005-keystrokes-live-in-memory-only.md)).
