# Proposal: Stream Deck control through Bitfocus Companion

Status: **Open idea, not for v2.0** (Jordan, 2026-10-20: a good idea; how it is built, and whether it fits inside the app, is still to be worked out)

How a Stream Deck button could pause, resume or switch the overlay's layout, without weakening the privacy promises. It
compares three routes and recommends one: a small local control endpoint on the app's own server that Companion's
Generic HTTP module (or any other local tool) can call.

## Goal

- A streamer presses a Stream Deck button and the overlay pauses, resumes, or moves to the next or previous layout, the
  same as the tray menu.
- It works with [Bitfocus Companion](https://github.com/bitfocus/companion) (MIT, Windows, macOS and Linux), which is how
  many streamers drive a Stream Deck, and with any other tool on the same PC that can send an HTTP request.
- Single-PC users who don't turn it on see no change at all: off by default, and the server answers as it does today.

## Non-goals

- **No key presses for controllers.** Nothing in this feature can read the key stream or the held keys, not even the
  count of them.
- **No network.** The server keeps binding `127.0.0.1` only. A Companion on another computer can't reach the app (except
  through the SSH tunnel two-PC users already run, which forwards the whole port; see below).
- **No settings changes from outside** beyond the layout choice: no style, no secure link, no port, no Debug mode.
- **No Companion "feedbacks" pushed from the app** in the first version (no new WebSocket for controllers).
- Not a replacement for the global pause shortcut ([future-inputs.md, Global hotkeys](../../design/future-inputs.md)); both
  stay.

## How it works

### Option 0, for comparison: no change (works today)

The Elgato Stream Deck app has a built-in **Hotkey** action. Set **General → Pause shortcut** in the app, then give a
Stream Deck button that shortcut: it pauses and resumes the overlay today, on Windows and macOS. Limits: only pause (no
layout actions yet, `hotkeys.nextLayout` is reserved but not built), the button can't show the state, and the faked
key press is seen by the keyboard capture like any key, so its keys may flash on the overlay for a moment before the pause.
Companion has no built-in way to press keys on the PC, so this option doesn't help Companion users.

This option goes in the user guide whichever route is chosen below.

### Option (a), recommended: a local control endpoint, called by Companion's Generic HTTP module

A new, small set of routes on the existing server (`src-tauri/src/server.rs`), with the handlers in their own file
because `server.rs` is already past 400 lines.

| Request | What it does | Same as |
|---|---|---|
| `POST /control/pause?key=…` | Pauses the overlay (nothing happens if it is already paused) | Tray **Pause overlay** |
| `POST /control/resume?key=…` | Resumes it | Tray **Pause overlay** again |
| `POST /control/toggle-pause?key=…` | Pauses or resumes | The pause shortcut |
| `POST /control/next-layout?key=…` | The next layout in the Layout tab's order, wrapping around | Tray **Layout** menu |
| `POST /control/previous-layout?key=…` | The previous one | Tray **Layout** menu |
| `POST /control/state?key=…` | Changes nothing | (for showing the state on a button) |

Every successful answer is `200` with the state after the action, and nothing else:

```json
{ "paused": false, "layout": "tkl", "layoutName": "TKL" }
```

**The rules, in the order the server applies them.** Steps 1 to 3 are the guard every request already passes
([PROTOCOL.md](../../PROTOCOL.md)); steps 4 to 9 are new and apply to `/control/*` only.

| # | Check | Refused with |
|---|---|---|
| 1 | One `Host` header, and it is `localhost:<port>` or `127.0.0.1:<port>` | 400 / 403 (unchanged) |
| 2 | An `Origin` header, if any, is this server | 403 (unchanged) |
| 3 | The secure-link key (`?key=`) is right: `/control/` joins the protected paths in `is_protected()`, so `key_ok()` checks it in constant time | 401 (unchanged code, one new path) |
| 4 | The feature is on (`control.enabled`) **and** the secure link is on. `key_ok()` lets everything through while the secure link is off, so this check is what makes the key required | 404, as if the route did not exist |
| 5 | **No `Origin` header at all.** Browsers send `Origin` with every `POST`, also to their own site; Companion, curl and other programs don't. So no web page, not even the overlay page or a theme file inside it (which can read the key from its own address), can use these routes | 403 |
| 6 | The method is `POST` | 405 with `Allow: POST` |
| 7 | No body is read. Requests with a body over `CONTROL_MAX_BODY` (1 KB) are refused | 413 |
| 8 | At most `CONTROL_MAX_PER_SECOND` (10) actions per second, counted across all callers | 429 |
| 9 | The action is one of the table above | 404 |

- **Rate limit without a timer.** A fixed one-second window: a start time and a count behind a `Mutex`, checked when a
  request arrives (nothing runs between requests, so idle CPU stays at zero). The check is a plain function
  `allow(now, window) -> bool` with unit tests that pass in made-up times. Why a limit at all: `next-layout` saves
  `settings.json` each time, and a stuck Companion trigger must not turn into a disk-write loop.
- **No CORS headers, ever.** Nothing in a browser has a reason to call these routes.
- **Why `?key=` and not a header.** It reuses `key_ok()` exactly, so there is one key check in the app. The cost: the key
  sits in Companion's button settings and in a Companion export. Companion's Generic HTTP module can also send Basic or
  header authentication, and keeps a Basic password in its secrets store, which exports leave out; whether to accept that
  as well is an open question below.
- **Companion settings.** In Companion: add a **Generic HTTP** connection with Base URL `http://127.0.0.1:7878/control/`
  (the app's port), then a button with the **POST** action and URI `toggle-pause?key=<the key>`. Use `127.0.0.1`, not
  `localhost`: Node.js may try `::1` (IPv6) first, and the app listens on IPv4 only. The module's **JSON Response Data
  Variable** can keep the answer in a custom variable so the button can show "Paused" (to confirm in Companion while
  writing the guide).
- **Other tools.** The same address works for anything on the PC that can send a POST: the Elgato app through a
  web-request plugin, Touch Portal, Streamer.bot, a script with `curl -X POST`. The guide names Companion and gives the
  plain request; it doesn't document each tool.
- **Two PCs.** With the SSH tunnel from [User guide: Using two PCs](../../USER-GUIDE.md#using-two-pcs-game-on-one-obs-on-the-other),
  Companion on the streaming PC can call `http://127.0.0.1:7878/control/…` through the same tunnel, because it forwards the
  whole port. Nothing extra is needed in the app; the guide says so in one line.

**Inside the app.**

- `src-tauri/src/control.rs` (new, about 150 lines): the routes as `control::routes()`, merged into the router in
  `server::start`; the checks 4 to 9; the rate limit; the answer. It never touches `bus.tx`, `bus.held` or anything else
  in the key pipeline (a privacy-check rule enforces that, below).
- The actions reuse the tray's code, like `hotkeys.rs` does. The server has no `AppHandle` today, so `server::start` gains
  one parameter (the handle), passed from `main.rs` and `tray::restart_server_inner`. `tray.rs` gets
  `set_pause_inner(app, paused)` (the tray's toggle then calls it) and `step_layout_inner(app, step)`.
- `layout_order.rs` gets `step(shown, current, step) -> id`: the layout before or after the current one in the order the
  tray and the Layout tab show, wrapping around. A plain function with unit tests. The reserved `hotkeys.nextLayout` can use
  the same function later.
- **Setting:** `control: { "enabled": false }`, a new top-level section (reserve the name in
  [future-inputs.md section 5](../../design/future-inputs.md) in the same change). Additive, so no migration; a default in
  `settings.rs`, the sandbox copy in `tools/sandbox/default-settings.json` ([EXTENDING.md](../../EXTENDING.md), a setting).
- **Settings window:** in **General → Connection**, under the secure link, a switch **Control from a Stream Deck or
  Companion** (`toggle-control-enabled`). It can only be turned on while the secure link is on; while the secure link is
  off it says why. When on, it shows the control address hidden like the secure link, with a **Copy** button
  (`control-copy`) and one line pointing to the user guide. Text goes in the file's `TEXT` block. The feature behaves the
  same on Windows, macOS and Linux (Companion runs on all three; the Elgato app on Windows and macOS only), so no
  `system-words.js` entry is needed.
- **Event log:** one line per action in the in-memory log ("overlay paused from the control address"), never more.

### Option (b): a Keystroke Overlay module for Companion

A dedicated module gives a nicer setup than Generic HTTP: a connection with fields for the port and key, named actions
(**Pause**, **Resume**, **Next layout**), ready-made button presets, and feedbacks that color the button while paused.

- **How modules are built.** Start from [companion-module-template-ts](https://github.com/bitfocus/companion-module-template-ts):
  TypeScript, Node (the template asks for Node 26 and Yarn 4), `@companion-module/base` (about 2.1) for the API, files
  `src/main.ts`, `actions.ts`, `feedbacks.ts`, `presets.ts`, `variables.ts`, `config.ts`, `upgrades.ts`, plus
  `companion/manifest.json` and `companion/HELP.md`. `yarn package` (`companion-module-build`) makes the package.
- **How they are published** (Companion's [releasing guide](https://companion.free/for-developers/module-development/module-lifecycle/releasing-your-module)):
  ask for a repository under the Bitfocus organization in the Companion Slack's #module-development channel (named
  manufacturer-product, for example `companion-module-nqble-keystroke-overlay`), push, tag `v1.0.0`, then submit the tag in
  the Bitfocus Developer Portal. Volunteers review it; since Companion 4.0 users install modules on demand, so a reviewed
  version reaches them without a Companion release.
- **What it still needs from the app:** the endpoint from option (a). A module is a nicer front end, not a different door.
  Feedbacks would need the module to ask `/control/state` every second or so, or a new push channel; the module must
  never open `/ws` (that is the key stream).
- **Cost:** a second repository in another language and toolchain, a review queue we don't control, and upkeep when
  Companion's module API moves (the template already moved from Node 22 to 26).

### Option (c): an official Elgato Stream Deck plugin

[elgatosf/streamdeck](https://github.com/elgatosf/streamdeck) (MIT): plugins are Node.js programs (Node 24 or later, Stream
Deck app 7.1 or later) made with `@elgato/cli` (`streamdeck create`), run by the Elgato app, and published on the Elgato
Marketplace after Elgato's review.

- It reaches people who use the Elgato app instead of Companion, on Windows and macOS only (the Elgato app doesn't run
  on Linux).
- It too would call the endpoint from option (a); it adds a third codebase, a marketplace account and review, and a
  `.sdPlugin` folder that writes its own log files by default.
- For pause alone, option 0 already covers Elgato-app users.

### Comparison and recommendation

| | (a) Control endpoint + Generic HTTP | (b) Companion module | (c) Elgato plugin |
|---|---|---|---|
| Change in the app | One new file, one setting, one switch | Needs (a) | Needs (a) |
| New code outside the app | None | A TypeScript repository | A TypeScript repository |
| Works with | Companion on every system, and any HTTP tool | Companion | Elgato app (Windows, macOS) |
| Setup for the user | Paste a base URL and an action URI | Fill in port and key | Install from the marketplace |
| Button shows the state | With a custom variable | Yes (feedbacks) | Yes |
| Waiting on others | No | Bitfocus review | Elgato review |
| Upkeep | Ours only | Companion API changes | Elgato SDK changes |

**Recommendation: (a), documented with a Companion recipe, plus option 0 in the guide.** It is the smallest change that
works for everyone, it adds no code outside this repository, and (b) or (c) can be built on it later if people ask for
them. Build (b) before (c) if that happens: Companion is free, runs on every system the app supports, and also drives
other control surfaces.

## Files to change

| File | Change |
|---|---|
| `src-tauri/src/control.rs` (new) | The routes, checks 4 to 9, the rate limit, the answer; unit tests |
| `src-tauri/src/server.rs` | `is_protected()` adds `/control/`; `start()` takes the `AppHandle` and merges `control::routes()`; the file's header comment ("Read-only HTTP API") is updated |
| `src-tauri/src/tray.rs` | `set_pause_inner`, `step_layout_inner`; `restart_server_inner` passes the handle |
| `src-tauri/src/layout_order.rs` | `step()` with tests |
| `src-tauri/src/main.rs` | Passes the handle to `server::start` |
| `src-tauri/src/settings.rs`, `src-tauri/src/sanitize.rs` | Default `control.enabled = false`; the switch is a plain boolean |
| `tools/sandbox/default-settings.json` | The new default |
| `ui/settings/tabs/general-*.js` (the Connection card) | The switch, the hidden address, Copy, the `TEXT` lines |
| `tools/sandbox/fake-app.js` | A state with control on, for the sandbox and the screenshots |
| `tools/check-privacy.mjs` (+ `privacy-patterns.mjs` and its tests) | New rule: `control.rs` must not use `bus.tx`, `.subscribe(`, `held` or `snapshot`; listening stays in `server.rs` only; file writes stay out of `control.rs` (it calls the tray's code, which calls `settings::save`) |
| `tests/e2e/suites/control.mjs` (new) and `tests/e2e/run.mjs` | The suite below, added to `SUITES` |
| `tests/visual/visual.mjs` | The General tab with control on, if the screen changes (Jordan sees before and after) |

`keyboard/` is not touched.

## Privacy

This adds a way **in** (local programs can send three kinds of commands), not a way out. It doesn't send key presses
anywhere and doesn't use the network, so the rules of [decision 0005](../../decisions/0005-keystrokes-live-in-memory-only.md)
hold unchanged. It does change two documented promises, so it needs a **decision record** first (the next free number,
0014 at the time of writing):

- [PROTOCOL.md](../../PROTOCOL.md) says "Read-only by design: … Nothing a client sends changes the app", and `server.rs` says
  "Read-only HTTP API … All writes go through Tauri IPC". Both become "read-only, except the optional control routes".
- [Decision 0002](../../decisions/0002-local-only-server-and-optional-secure-link.md) is about who can reach the server;
  the new record says the control routes are local-only, need the secure link and the feature switch, refuse browsers
  (no `Origin`), and can never read keys.

**PRIVACY.md** gets one short paragraph (in "What the app can see", or a new "Control from other programs" part): from
the version that ships it, an optional switch lets programs on this PC that know the secure link's key pause, resume or
change the layout; they get back only the pause state and the layout's name; they can never read key presses. "The one
limit you should know about" gets one line: a program that has the key (for example from OBS's scene files or a Companion
export) can now also pause the overlay or change its layout, not only watch it; "Make a new key" cuts it off.

Security notes for the second look CLAUDE.md asks for on `server.rs` changes:

- The worst a caller with the key can do is pause the overlay, change the layout, or make the app save `settings.json` at
  most ten times a second. A caller with the key could already watch every key press, which is worse.
- Requiring no `Origin` header plus the Host check closes both the "website calls 127.0.0.1" and the DNS-rebinding paths,
  even if a future browser stops sending `Origin` on some requests (the Host check still holds).
- The key in the query string can land in Companion's own logs if Companion logs request URLs (to check while writing
  the guide; one more reason for the open question on header authentication).

## Tests

- **Rust unit tests** (`control.rs`, `layout_order.rs`, `server.rs`): each refusal in the table (feature off, secure link
  off, wrong key, `Origin` present even if local, `GET`, a large body, unknown action, the eleventh request in a second);
  the rate-limit window with made-up times; `step()` forward, back, wrapping, a current layout no longer in the order, a
  single layout; `/control/` is protected and `/` and `/overlay/*` are still not.
- **Privacy-check tests** (`tests/ui/` tests of `privacy-patterns.mjs`): the new rule catches `bus.tx` or `held` in
  `control.rs`.
- **E2E suite `control`** (Windows, the test copy on port 7879), with raw `fetch` like the `secure-link` suite:
  1. Off by default: `POST /control/state` → 404 with and without a key.
  2. Turning control on is refused while the secure link is off (the switch is disabled, and the command refuses it).
  3. With both on: `pause` → 200 `{"paused":true}`; the overlay WebSocket then gets a `cfg` with `paused: true` and a `snap`
     with an empty `down`; the tray state (`debug_tray_state`) says paused; `resume` undoes it.
  4. `next-layout` and `previous-layout` follow the Layout tab's order and wrap; the live preview follows.
  5. Refusals: wrong key → 401, an `Origin: http://localhost:7879` header → 403, `GET` → 405, foreign `Host` → 403,
     twelve quick requests → at least one 429, then working again after a second.
  6. While W is held by the injector, the `state` answer and every refusal body contain no key name.
  7. Turning the secure link off makes `/control/*` answer 404 straight away.
- **Benchmark:** idle CPU and threads unchanged with the feature on and no requests (`tests/bench/run.mjs`).
- **Manual:** Companion 4 with Generic HTTP on Windows, one button per action, recorded in the pull request.

## Docs to update

- The decision record (next free number) and its line in `docs/decisions/README.md`; the "Stream Deck / hotkey control"
  bullet in [ideas-not-decided.md](../../decisions/ideas-not-decided.md) leaves that page.
- [PROTOCOL.md](../../PROTOCOL.md): a "Control routes (optional)" section with the table, the answers and the refusals; the
  "Read-only by design" line.
- [PRIVACY.md](../../../PRIVACY.md) as above, and the README's privacy lines if they say "read-only".
- [USER-GUIDE.md](../../USER-GUIDE.md): a "Control it from a Stream Deck" section: option 0 (the Elgato app's Hotkey action
  and the pause shortcut), the Companion recipe with the base URL and the six actions, `127.0.0.1` not `localhost`, keep
  the key private, the one line about two PCs.
- [ARCHITECTURE.md](../../ARCHITECTURE.md): `control.rs` in the folder map, and the secure-link bullet's protected paths.
- [FILE-FORMATS.md](../../FILE-FORMATS.md): the `control` section.
- [future-inputs.md](../../design/future-inputs.md) section 5: reserve `control`.
- [tests/README.md](../../../tests/README.md): the `control` suite and the two new hooks.
- `docs/for-claude/README.md`: this plan's line and status.

## Risks

- **First write path into the server.** Mitigated by the switch, the secure-link requirement, the no-`Origin` rule, the
  rate limit, and a privacy-check rule that keeps the key pipeline out of `control.rs`. Needs the second look CLAUDE.md
  asks for.
- **The key in Companion's configuration.** Documented; see the open question on headers.
- **Support questions about Companion.** The guide says what the app does and links Companion's own help for the rest.
- **Scope creep** ("also change the theme from the Stream Deck"). Each new action is one row in the table and one test,
  but each widens the surface: keep the list short and decided by Jordan.

## Work order

Each step is its own commit, with `npm test`, the format, type, docs and style checks, and clippy between steps.

1. Decision record and the PROTOCOL.md section, for Jordan's review before code.
2. `layout_order::step()` and `tray::set_pause_inner` / `step_layout_inner`, with unit tests (no visible change).
3. `control.rs` with its unit tests, `server.rs` wiring, the setting's default (off), the privacy-check rule and its tests.
4. The settings window switch, address and Copy, the sandbox state, and the screenshot check.
5. The `control` e2e suite; run the full e2e on Windows.
6. Docs: USER-GUIDE (with option 0), PRIVACY.md, ARCHITECTURE.md, FILE-FORMATS.md, future-inputs.md, tests/README.md.
7. Manual Companion test on Windows (and macOS if a Mac is at hand), recorded in the pull request.

## Effort

| Part | Estimate |
|---|---|
| (a): Rust, setting, switch, tests, docs | 2 to 3 days |
| (b): Companion module on top of (a) | 3 to 5 days, plus Bitfocus review time |
| (c): Elgato plugin on top of (a) | 4 to 6 days, plus marketplace review and an Elgato account |

## Open questions for Jordan

1. Is a write path into the local server acceptable at all, given PROTOCOL.md's "read-only by design"? (It needs your
   decision record either way.)
2. Should the control routes need the secure link, as proposed, or have their own separate key, so the OBS URL saved in
   OBS's scene files can't also control the app?
3. Accept the key in an `Authorization` header (Bearer, or Basic with the key as the password, which Companion keeps out of
   its exports) as well as `?key=`?
4. Which actions: only pause and layout as proposed, or also "set layout by id" (needs the id in the request) or "open the
   settings window"?
5. Which version: a v2.x release after v2.0 ships, or later?
6. If people ask for a dedicated Companion module later, should it live under your GitHub account or under Bitfocus (their
   process puts it in their organization, with you as maintainer)?
