# Ideas, not decided

Things that have been discussed and look promising, but **no decision has been made**. They are here so the thinking is
not lost. Nothing on this page is a commitment, and none of it should be treated as how the project works today. If one of
these is chosen, it gets its own numbered decision record and leaves this page.

## Frontend structure
- **Preact with htm for the settings window** (template strings instead of JSX, no build step). It is small (about 6 KB),
  works under the app's security policy because it needs no `eval`, and uses the same ideas as React. If tried: copy the
  library into `ui/settings/vendor/` pinned to exact versions with its MIT license (no downloads at run time); keep the
  OBS overlay page plain; convert one tab at a time, running the full tests after each; and write templates so that a later
  move to JSX stays mechanical (one component per file, one shared `html` tag, React spellings such as `onClick`, full
  closing tags).

## Project safety and structure
- **Branch protection on `main`** (changes through pull requests, CI must pass, no force-pushes). It would change how pushes
  work, so it needs the owner's decision.
- **A Linux CI job** that runs the platform-neutral unit tests, to keep the Windows-only code (keyboard hook, Raw Input,
  tray details) cleanly separated. The crate does not build on Linux today, so this needs some `cfg(windows)` gating first.
- **Performance budgets** (startup time, idle memory, thread count) checked against the benchmark tool before a release.

## Possible features (see the roadmap discussion)
- Mouse clicks and gamepad inputs; an optional click-through on-screen overlay window for capture tools that cannot show a
  web page; a shortcut/ticker display mode; per-app profiles and auto-pause; an opt-in dual-PC mode through Tailscale Serve with an allowed-host setting, see
  [../proposals/tailscale-dual-pc.md](../proposals/tailscale-dual-pc.md) (proposed, not decided); OBS scene awareness; Stream Deck / hotkey control.
- Any feature that adds network access, or changes what is stored, needs a decision record and a privacy-docs update first
  ([0002](0002-local-only-server-and-optional-secure-link.md), [0005](0005-keystrokes-live-in-memory-only.md)).
