# Proposal: talking to OBS from the app through obs-websocket

Status: **Not planned; kept as documentation** (Jordan, 2026-10-20: redundant with the browser-source events, kept for others to try)

Whether the app (the Rust side, not the overlay page) should connect to OBS's built-in WebSocket server to read scene
changes or control OBS, what it would cost against the project's principles, and the smallest safe design if Jordan says yes.

## Recommendation

**Don’t build this yet.** Build scene awareness inside the overlay first ([obs-source-events.md](obs-source-events.md)): it
covers the main wish (the keys follow the OBS scene) with no network code, no password and no setup in OBS.

Revisit obs-websocket only if Jordan wants an app-side behavior the overlay can't give. The one that would justify it is
**"pause per scene"**: the app stops forwarding keys entirely while a listed scene is on (a real privacy feature, because
with the overlay-only design a hidden overlay still receives the keys). If that is wanted, build only the **smallest safe
design** below: read-only, loopback only, one event, no OBS control, behind a decision record, off by default.

Why not yet, in one line each:

| | |
|---|---|
| Principle 1 (privacy) | It is network code outside `commands/updates.rs`, which CLAUDE.md and `npm run check:privacy` forbid today. Changing that needs a decision record and Jordan's word. |
| The secret | The obs-websocket password gives **full control of OBS**, including reading the stream key (`GetStreamServiceSettings`). The app would have to keep it safe. |
| Setup | The WebSocket server is **off by default** in OBS; the user turns it on and copies a password. Turning it on opens a port on every network interface (see "What OBS does"). |
| Principle 3 (idle cost) | A client that waits for OBS to start is a timer while idle, unless the connection is triggered by something else (solved below, but it is one more moving part). |
| What it adds | Little for a keystroke overlay beyond "pause per scene"; scene switching and source toggling from the tray are not features anyone has asked for. |

## Goal (if built)

1. While a scene the user listed is on in OBS, the app forwards no keys at all (the overlay shows nothing and receives
   nothing), even if the overlay page isn't loaded or isn't in that scene.
2. Scene rules work from OBS's start without changing the Browser source's **Page permissions**.
3. Nothing changes for anyone who doesn't turn it on: no connection, no thread, no timer, no file.

## Non-goals

- **No control of OBS:** no scene switching, no source toggling, no starting or stopping streams or recordings. The app
  sends OBS nothing but the handshake (and at most one read request).
- **No connection to another computer.** Only `127.0.0.1`. Two-PC setups stay as the user guide describes.
- **No keystrokes, settings or anything about the user** ever go to OBS.
- No replacement for the overlay-only design: if both exist, they share the rules (`obs.scenes.rules`).
- No OBS 27 or older (the older obs-websocket 4.x protocol is different and not built in).

## Comparison with the overlay-only design

| | Overlay page API ([obs-source-events.md](obs-source-events.md)) | obs-websocket from the app (this) |
|---|---|---|
| Works when the overlay isn't loaded (not in the scene with **Shutdown source when not visible**, or no source at all) | No | **Yes** |
| Knows the scene at OBS's start | Only with **Page permissions** at level 2 | **Yes** (`GetCurrentProgramScene`) |
| Can stop the app forwarding keys per scene | No (the overlay only hides them) | **Yes** |
| Can switch scenes or toggle sources (e.g. from the tray) | Only with page level 4, from the page; not proposed | Yes, but a non-goal here |
| Works for the tray and the settings window | No | Yes |
| Network code in the app | **None** | A WebSocket client (loopback) |
| Secret to keep | **None** | The obs-websocket password (full control of OBS) |
| Setup in OBS | none (optional Page permissions) | enable the WebSocket server, copy the password into the app |
| Dependencies | **None** | `tokio-tungstenite`, `sha2`, `base64` as direct dependencies (all three are already compiled into the app through axum and others, so no extra code in the build; still Jordan's call, CLAUDE.md section 7) |
| Testable in e2e | Only the app side; OBS itself by hand | **Fully**, against a fake obs-websocket server in Node |
| Decision record | No | **Yes** (principle 1 changes) |
| Effort | 3–4.5 days | about 6–9 days, plus review |

## What OBS does (researched)

Read from github.com/obsproject/obs-websocket (commit `e28f849`, 2026-10-08): `README.md`, `docs/generated/protocol.md`,
`src/Config.h`, `src/Config.cpp`, `src/websocketserver/WebSocketServer.cpp`.

- Built into OBS from **28.0.0** (README: "obs-websocket is now included by default with OBS Studio 28.0.0 and above").
- Default port **4455** (`ServerPort = 4455`); the user can change it in OBS (**Tools → WebSocket Server Settings**).
- The server is **off by default** (`ServerEnabled = false`).
- Authentication is **on by default** (`AuthRequired = true`), and OBS makes a random password on first load
  (`Utils::Crypto::GeneratePassword()`). OBS stores it in its own config file as plain text (`ServerPassword`).
- When on, it listens on **every interface**: `_server.listen(port)` with no address, or `tcp::v4()` (any IPv4 address) when
  **IPv4 only** is set. There is no "localhost only" option in that code. So telling users to turn it on also opens a
  password-protected control port to their network. The user guide would have to say so, and to keep authentication on.

### The handshake (protocol v5, `rpcVersion` 1)

Every message is JSON in a text frame: `{ "op": <number>, "d": { … } }` (subprotocol `obswebsocket.json`, the default).

1. The client connects to `ws://127.0.0.1:4455`. The server sends **Hello** (op 0):
   `{ "obsStudioVersion", "obsWebSocketVersion", "rpcVersion": 1, "authentication"?: { "challenge", "salt" } }`.
2. The client answers **Identify** (op 1): `{ "rpcVersion": 1, "authentication"?: "<string>", "eventSubscriptions": 4 }`.
   - The authentication string: `secret = base64(sha256(password + salt))`, then
     `authentication = base64(sha256(secret + challenge))` (binary hashes, base64 strings, UTF-8 concatenation).
   - `eventSubscriptions` is a bitmask; `4` is `Scenes` (`1 << 2`) only. The default is "all except high-volume", which
     we don't want: we ask for the least.
   - Before **Identified**, the client may send nothing else (close code 4007 `NotIdentified`).
3. The server answers **Identified** (op 2): `{ "negotiatedRpcVersion": 1 }`. A wrong password closes with **4009**
   `AuthenticationFailed`; an unusable version with **4010** `UnsupportedRpcVersion`.
4. From there: **Event** (op 5) `{ "eventType", "eventIntent", "eventData" }`; **Request** (op 6)
   `{ "requestType", "requestId", "requestData"? }`; **RequestResponse** (op 7)
   `{ "requestType", "requestId", "requestStatus": { "result", "code", "comment"? }, "responseData"? }`.
5. Close code **4011** `SessionInvalidated` is OBS's **Kick** button: the docs say a client "must not automatically
   reconnect".

**A test vector.** The protocol doc's two examples don't belong together: its Identify example
(`Dj6cLS+jrNA0HpCArRg0Z/Fc+YHdt2FQfAvgD1mip6Y=`) is *not* the answer to its Hello example (I computed it). Following the
documented steps with password `supersecretpassword`, salt `lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=` and challenge
`+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=` gives `1Ct943GAT+6YQUUX47Ia/ncufilbe6+oD6lY+5kaCu4=` (Python `hashlib` and
`base64`). Cross-check it with an official client library (obs-websocket-js) before using it in a Rust test.

### The events and requests this design would use

| Name | Kind | Fields | Added |
|---|---|---|---|
| `CurrentProgramSceneChanged` | event, `Scenes` (4) | `sceneName`, `sceneUuid` | 5.0.0 |
| `ExitStarted` | event, `General` (1) | none | 5.0.0 |
| `GetCurrentProgramScene` | request | answers `sceneName`, `sceneUuid` (plus deprecated `currentProgramScene*`) | 5.0.0 |

Also there, and *not* used: `CurrentPreviewSceneChanged`, `SceneListChanged`, `StudioModeStateChanged`,
`StreamStateChanged`, `SceneItemEnableStateChanged`, `GetSceneList`, `SetCurrentProgramScene`, `SetSceneItemEnabled`,
`GetSceneItemId`, `GetVersion`, and `GetStreamServiceSettings` (which returns the stream key: the reason the password
matters).

`ExitStarted` needs the `General` bit; instead of subscribing to it, treat the socket closing as "OBS is gone". So
`eventSubscriptions: 4` is enough.

## The smallest safe design (only if Jordan says yes)

### Shape

- One Rust module, `src-tauri/src/obs_ws.rs`, the only file besides `commands/updates.rs` allowed to open a connection, and
  only to `127.0.0.1`.
- It **sends** exactly two kinds of message: Identify, and one `GetCurrentProgramScene` after Identified. The allowed request
  types are one constant, `ALLOWED_REQUESTS = ["GetCurrentProgramScene"]`, and the send function refuses anything else.
- It **reads** Hello, Identified, the one RequestResponse and `CurrentProgramSceneChanged`; everything else is dropped.
- It **knows nothing about keys**: it doesn't import `keyboard`, and talks to the rest of the app through one call:
  `state::set_obs_scene(Option<String>)`.
- The dispatcher (`keyboard/mod.rs`) gets one extra check next to the pause check: drop key events while the current scene
  has a "hide" rule (as pause does today: an empty `snap`, no `d`/`u`). That reuses the pause path, which is already tested.
- The current scene also goes to the overlay as an additive message `{"t":"scene","name":"…"}`, so the overlay-only rules
  ([obs-source-events.md](obs-source-events.md)) work from the start without Page permissions. Old overlays ignore it
  (PROTOCOL.md: clients ignore unknown types).

### When it connects (no polling)

The app connects **when the first OBS overlay connects to it** (the `OverlayCount` watch in
[server.rs](../../../src-tauri/src/server.rs) goes from 0 to 1): if an overlay page is loaded in OBS, OBS is running. Also
once when the user turns the feature on, and when they save a password.

- Connection refused (the WebSocket server is off) → no retry until the next trigger. The card says so.
- 4009 (wrong password) → no retry; the card says "OBS didn't accept the password".
- 4011 (kicked in OBS) → no retry until the user turns the feature off and on.
- The socket closes for another reason (OBS quit) → the scene is forgotten (`None`), so nothing stays paused. Next trigger
  reconnects.
- No timer and no thread while off or disconnected: the client is one tokio task that exists only while connected.

Limit: with **Shutdown source when not visible** on and the overlay in no visible scene, there is no trigger after OBS
starts until the overlay shows. The card's **Connect** button covers that case.

### Settings

Added to the `obs` section reserved by [obs-source-events.md](obs-source-events.md):

```jsonc
"obs": {
  "scenes": { "enabled": false, "rules": [ … ] },        // shared with the overlay-only design
  "websocket": { "enabled": false, "port": 4455 }        // off by default; port 1024–65535 (RANGES + RESET_WHEN_INVALID)
}
```

A rule's `"show": false` then also means "the app forwards nothing in this scene" while `websocket.enabled` is on.

### The password

**Not in `settings.json`.** Settings travel to many places: the overlay (`public_settings()`, which today strips only the
link key), `/api/config` (readable by any local program without the secure link), the Debug tab's raw settings editor and
bug report, `settings.json.bak` and `settings.vN.json`. Each would need its own stripping, and one forgotten place would
leak a secret that controls OBS.

Instead: one file, `obs-websocket.json` in the app's data folder, written and read only by `obs_ws.rs`, holding only the
password. The settings window can set it (`set_obs_password`) and clear it, but never read it back; the card shows
"Password saved". Plain text at rest, which is what OBS itself does with the same password. Deleted by **Reset all
settings…** and when the password is cleared.

The OS keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service) would be better at rest, but needs another
dependency with code per system and a Secret Service on Linux. Open question 4.

### What the user sees

A part of the **OBS scenes** card on the **General** tab (from [obs-source-events.md](obs-source-events.md)), under
the rules, shown only while the scene rules are on:

| Where | Text |
|---|---|
| Switch | Also pause keys in hidden scenes (uses OBS's WebSocket server) |
| Note | In OBS, turn on **Tools → WebSocket Server Settings → Enable WebSocket server**, then copy the password here. Keys in a scene set to **Hide** then never leave this app. |
| Port | **Port** (4455 unless you changed it in OBS) |
| Password | **Password** box (a password field), **Save**, **Clear** |
| Status | Connected to OBS · Not connected (is OBS's WebSocket server on?) · OBS didn't accept the password · OBS disconnected this app |
| Button | **Connect** |
| Warning | OBS's WebSocket server can be reached from your network. Keep **Enable Authentication** on in OBS. |

OBS's menu is the same on Windows, macOS and Linux, so no `system-words.js` entry is needed.

Hooks: `toggle-obs-websocket-enabled`, `obs-websocket-port`, `obs-websocket-password`, `obs-websocket-save`,
`obs-websocket-clear`, `obs-websocket-status`, `obs-websocket-connect`.

## Exact files to change (if built)

| File | Change |
|---|---|
| `src-tauri/src/obs_ws.rs` | **Added**: the client, the handshake, `ALLOWED_REQUESTS`, the password file, the commands `set_obs_password`, `clear_obs_password`, `obs_connect`; unit tests for the auth string and message parsing |
| [src-tauri/src/main.rs](../../../src-tauri/src/main.rs) | `mod obs_ws;` and the commands in `generate_handler!` |
| [src-tauri/src/state.rs](../../../src-tauri/src/state.rs) | the current scene (`Option<String>`, memory only) and `set_obs_scene` |
| [src-tauri/src/keyboard/mod.rs](../../../src-tauri/src/keyboard/mod.rs) | one check beside the pause check (extra care: CLAUDE.md section 8) |
| [src-tauri/src/server.rs](../../../src-tauri/src/server.rs) | the 0 → 1 overlay trigger; the `scene` message (extra care) |
| [src-tauri/src/settings.rs](../../../src-tauri/src/settings.rs), [sanitize.rs](../../../src-tauri/src/sanitize.rs), [settings/tests.rs](../../../src-tauri/src/settings/tests.rs) | `obs.websocket` default, its port range, tests |
| [src-tauri/Cargo.toml](../../../src-tauri/Cargo.toml) | `tokio-tungstenite`, `sha2`, `base64` as direct dependencies, at the versions already in `Cargo.lock` (0.29, 0.10, 0.22), with the reason in the commit message |
| [tools/check-privacy.mjs](../../../tools/check-privacy.mjs) + [tools/privacy-patterns.mjs](../../../tools/privacy-patterns.mjs) + [tests/ui/privacy-patterns.test.mjs](../../../tests/ui/privacy-patterns.test.mjs) | the rules below (extra care) |
| [ui/overlay/overlay.js](../../../ui/overlay/overlay.js) | handle `{"t":"scene"}` |
| `ui/settings/tabs/general-obs-scenes.js` | the WebSocket part of the card |
| [tools/sandbox/fake-app.js](../../../tools/sandbox/fake-app.js), [default-settings.json](../../../tools/sandbox/default-settings.json) | the commands and states |
| `tests/e2e/lib/fake-obs.mjs`, `tests/e2e/suites/obs-websocket.mjs`, [tests/e2e/run.mjs](../../../tests/e2e/run.mjs) | **Added**: a fake obs-websocket server on 127.0.0.1 and the suite |

## Settings and protocol changes

- Settings: `obs.websocket` above, additive (same downgrade question as in [obs-source-events.md](obs-source-events.md),
  open question 4 there).
- Protocol: one additive message, `{"t":"scene","name":"<scene name>"}`, sent only while the feature is on and connected;
  `{"t":"scene","name":null}` when the scene is unknown again. Documented in [PROTOCOL.md](../../PROTOCOL.md). It does
  carry the scene name to every overlay client; with the secure link off, any local program can read it (the same limit
  PRIVACY.md already states for key events).

## Privacy impact

This is the part that needs Jordan's decision. Today's promise: "Only `src-tauri/src/commands/updates.rs` may use the
network" (CLAUDE.md principle 1, ARCHITECTURE.md, PRIVACY.md "How to check it yourself").

What changes:

- A second file may open a connection, **to `127.0.0.1` only**, and only while the user has turned the feature on.
- Nothing about keys, settings or the user is sent. Received: the current scene's name, kept in memory only.
- A secret is stored: the obs-websocket password, in its own file.

### Decision record (needed before any code)

`docs/decisions/0014-an-optional-local-client-for-obs-websocket.md` (the next free number today): context (pause per
scene), decision (one module, loopback only, read-only, off by default, password in its own file), why (and what we gave up:
"one file uses the network" becomes "one file uses the internet, one other talks only to this computer"), consequences
(the privacy check's rules below; any further request type needs a change to this record). Also a row in
[decisions/README.md](../../decisions/README.md), and CLAUDE.md principle 1 reworded by Jordan, for example: "Only
`commands/updates.rs` may use the internet; only `obs_ws.rs` may connect to another program on this computer, and only to
127.0.0.1."

### The privacy check

The check must get **narrower**, never looser (CLAUDE.md: never weaken it):

1. `NET` stays forbidden everywhere except `commands/updates.rs` **and** `obs_ws.rs`.
2. In `obs_ws.rs`, every connect call must use the constant `OBS_HOST`, and the file must contain
   `const OBS_HOST: &str = "127.0.0.1";` exactly (the same style as the local dev tools' `HOST` rule).
3. `obs_ws.rs` may not mention `keyboard::`, the key bus or the key broadcast channel.
4. `obs_ws.rs` may not contain a request type outside `ALLOWED_REQUESTS` (a pattern on `"requestType"`).
5. **A gap to close regardless of this proposal:** `NET` in `privacy-patterns.mjs` doesn't match a WebSocket *client*
   (`tokio_tungstenite::connect_async`, `client_async`, `tungstenite::connect`). These open connections through
   `TcpStream` inside the library, where the line-by-line check can't see. Add them to `NET` with tests.
6. **A second gap, in the UI rule:** the front-end scan only flags `http://` and `https://` addresses, so
   `new WebSocket('ws://127.0.0.1:4455')` in `ui/` would pass. The settings window's security policy (`connect-src 'self'
   ipc: http://ipc.localhost`) would block it there, but the overlay page has no policy. A rule that allows
   `new WebSocket(` only with `location.host` closes it.

PRIVACY.md: a section "Talking to OBS (optional)" under "Where keystrokes go", the password file under "What is stored on
disk", and the extra `grep` result under "How to check it yourself". "When the app talks to the internet" stays as it is
(this is not the internet).

## Tests (if built)

- **Rust unit tests** in `obs_ws.rs`: the auth string against a vector cross-checked with obs-websocket-js; Hello with and
  without `authentication`; Identify has `eventSubscriptions: 4` and `rpcVersion: 1`; a `CurrentProgramSceneChanged` sets
  the scene; unknown ops and events are dropped; close codes 4009, 4010, 4011 give the right status and retry choice; the
  send function refuses a request type outside `ALLOWED_REQUESTS`.
- **Settings tests:** the default is off; the port range; the password never appears in `settings.json`, in
  `public_settings()` or in the Debug report.
- **Dispatcher test** in `keyboard/mod.rs`'s tests: a "hide" scene drops events and sends an empty `snap`, like pause.
- **Privacy-pattern tests** in `tests/ui/privacy-patterns.test.mjs` for each rule above.
- **End to end** (`tests/e2e/suites/obs-websocket.mjs`) against `tests/e2e/lib/fake-obs.mjs`, a small Node server on
  `127.0.0.1` that speaks Hello, checks the auth string and sends scene events: connect, wrong password, kick, OBS quitting
  mid-scene (keys flow again), the 0 → 1 overlay trigger, no connection at all while off (the `smoke` suite's "every socket
  is loopback-only" check covers it), and idle CPU and threads flat while off (`input-methods` already measures idle CPU).
- **By hand with real OBS** (28 and the latest), Windows and macOS: enable the server, the password, scene switches,
  studio mode, OBS restarts.

## Docs to update in the same commits

[PRIVACY.md](../../../PRIVACY.md) (above), CLAUDE.md principle 1 (Jordan's own wording), the decision record and
[decisions/README.md](../../decisions/README.md), [ARCHITECTURE.md](../../ARCHITECTURE.md) (folder map, "Updates", "Guard
rails"), [PROTOCOL.md](../../PROTOCOL.md) (`scene`), [FILE-FORMATS.md](../../FILE-FORMATS.md) (`obs.websocket`, the
password file), [USER-GUIDE.md](../../USER-GUIDE.md) (setup and the network warning),
[tests/README.md](../../../tests/README.md) (hooks, suite), [design/future-inputs.md](../../design/future-inputs.md)
(`obs.websocket` under the reserved `obs`), and [for-claude/README.md](../README.md).

## Risks

| Risk | How we handle it |
|---|---|
| The password leaks through a settings path | Not in settings at all; one file, one module; tests that it appears nowhere else. |
| Users open OBS's control port to their network to use this | The card and the user guide say it, and to keep authentication on. |
| A later change adds "one more request" that controls OBS | `ALLOWED_REQUESTS` plus the privacy check plus the decision record: each request type is a reviewed change. |
| A stuck "hide" scene leaves keys paused after OBS quits | A closed socket forgets the scene; tested in e2e. |
| The line-by-line privacy check misses a library's connection | Gap 5 above; code review of `obs_ws.rs` (CLAUDE.md section 8). |
| obs-websocket changes (an `rpcVersion` 2) | We send `rpcVersion: 1`; 4010 shows a clear status. |
| Idle cost creeps in | No task while disconnected; connection only on triggers; measured with `tests/bench/run.mjs` (threads and idle CPU with the feature off and on). |

## Work order (if approved; small commits, all checks between them)

1. `docs(decisions): optional local obs-websocket client`: decision record 0014 (Status: Proposed), README row. Jordan
   approves it and rewords CLAUDE.md principle 1.
2. `test(privacy): catch websocket clients in the privacy check`: gaps 5 and 6, with tests (worth doing even if the rest
   is never built).
3. `build(deps): add tokio-tungstenite, sha2 and base64 directly`: after Jordan's OK; the reason in the body.
4. `feat(obs): local obs-websocket client, read-only`: `obs_ws.rs` with unit tests, the privacy-check rules 1–4, the
   password file and commands; not yet started by anything.
5. `feat(settings): obs websocket setting, off by default`: defaults, sanitizer, tests, sandbox, FILE-FORMATS.md.
6. `feat(obs): connect when an obs overlay connects`: the server trigger, `state.rs`, the `scene` message, PROTOCOL.md.
7. `feat(keyboard): forward no keys in hidden obs scenes`: the dispatcher check and its test (second look, section 8).
8. `feat(general): obs websocket part of the obs scenes card`: hooks, sandbox, tests/README.md.
9. `test(e2e): obs websocket suite with a fake obs server`.
10. `docs: obs websocket in the privacy page and user guide`, then the benchmark before and after, the manual OBS
    checks, the visual review with Jordan.

## Effort

About **6–9 days**: decision and privacy-check work 1 day; the client, auth and password file with tests 2–3 days; the
trigger, dispatcher check and protocol message 1 day; the card 1 day; the fake server and e2e suite 1–2 days; docs, benchmark
and manual OBS checks on two systems 1 day. Plus Jordan's review of the decision and the extra-care files. All of it
comes after [obs-source-events.md](obs-source-events.md), which it builds on.

## Open questions for Jordan

1. **Do it at all?** Is "pause per scene" (no key leaves the app in a listed scene) worth a second network-capable module
   and a stored OBS password? If not, mark this proposal "not built" and keep it as background.
2. **Principle 1:** if yes, how should CLAUDE.md say it? (A suggestion is under "Decision record".)
3. **Dependencies:** OK to add `tokio-tungstenite`, `sha2` and `base64` directly? They are already compiled into the app
   through other crates.
4. **The password at rest:** its own plain-text file (as OBS does), or the system keychain (another dependency, code per
   system)?
5. **The `scene` message:** send the scene name to overlays (so the overlay rules work without Page permissions), or keep
   the protocol as it is and use the scene only inside the app?
6. **Gaps 5 and 6 in the privacy check** (WebSocket clients aren't matched): fix them in a separate change, whatever happens to this proposal?
