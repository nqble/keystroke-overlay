# The local overlay protocol

What the app's built-in web server speaks. This is the contract between the app and the overlay page, and the thing any
other tool (or a future port) can rely on. Documented as of app v1.2.x. There is **no version field on the wire yet**; treat this page as protocol "1". Additive
changes (a new message type or field) keep it; anything that would break an existing client needs a decision record first.

> Read-only by design: clients receive key state and settings. Nothing a client sends changes the app.

## Where it listens
- `http://127.0.0.1:<port>/` (default port **7878**; also reachable as `http://localhost:<port>/`).
- Local only: the server never accepts connections from other computers ([decision 0002](decisions/0002-local-only-server-and-optional-secure-link.md)).
- Every request must have `Host: localhost:<port>` or `127.0.0.1:<port>`, and an `Origin` header (if present) of
  `http://localhost:<port>` or `http://127.0.0.1:<port>`. Anything else gets HTTP 403. Every response is sent with
`Cache-Control: no-store`.

## Secure link (optional)
When the user turns it on, the link carries a private key: `http://localhost:7878/?key=<32 hex characters>`.
With it on, these paths answer HTTP 401 when the `key` query parameter is missing or wrong (for `/ws` this means the WebSocket does not open):

`/api/*`, `/ws`, `/fonts/*`, `/user/*`

The overlay page and its code (`/`, `/overlay/*`) stay open because they contain nothing private. The key is never included
in anything the server sends.

## HTTP endpoints
| Path | Returns |
|---|---|
| `GET /` | The overlay page (`ui/overlay/index.html`) |
| `GET /overlay/*` | The overlay's own files (scripts, styles, built-in layouts, themes and animations) |
| `GET /api/config` | `{ "settings": <public settings>, "port": <number>, "paused": <bool> }` |
| `GET /api/layouts` | Array of layouts (see [FILE-FORMATS.md](FILE-FORMATS.md)); layouts made by the user have `"user": true`. Every layout also carries a computed `"grid"`: `{ "KeyW": { "x": 0, "y": 1 }, ... }`, where each key sits in the even-grid layout style (worked out once in the app, `src-tauri/src/grid.rs`) |
| `GET /api/modules` | `{ "animations": [urls], "themes": [urls] }`, the module files the overlay should load |
| `GET /api/fonts` | Array of font file names the user added |
| `GET /fonts/<file>` | A user-added font file |
| `GET /user/<kind>/<file>` | A user-added theme or animation module |

"Public settings" is the settings object **without** the secure-link key.

## The key stream: `ws://127.0.0.1:<port>/ws`
Every message is one JSON object in a text frame with a type field `t`.

| Message | Meaning |
|---|---|
| `{"t":"snap","down":["KeyW","ShiftLeft"]}` | Full state: exactly the keys held down right now. Sent first on connect, and again to resynchronise after a client falls behind. Replace your state with it. |
| `{"t":"d","k":"KeyW"}` | Key **down**. |
| `{"t":"u","k":"KeyW"}` | Key **up**. |
| `{"t":"cfg","s":<public settings>,"paused":false}` | Settings changed (or the pause state changed). Redraw. |
| `{"t":"assets"}` | Fonts, layouts or modules changed. Re-fetch `/api/layouts`, `/api/modules`, `/api/fonts`. |

Key names follow the browser's `KeyboardEvent.code` (for example `KeyW`, `Digit1`, `ShiftLeft`, `ControlRight`, `Space`,
`ArrowUp`, `Numpad5`, `NumpadEnter`, `PrintScreen`, `Pause`). The list is in
`src-tauri/src/keyboard/keymap.rs`, shared by every capture method so they all name keys the same way.

**Reserved for the future** (not sent yet): mouse and controller buttons will use these same `d` / `u` / `snap` messages
with names like `MouseLeft` and `PadA`, and analog controls (sticks, triggers) will use `{"t":"a",…}`. Clients must
ignore message types they don't know. See [design/future-inputs.md](design/future-inputs.md).

### Behaviour you can rely on
- **Repeats are filtered.** Holding a key sends one `d`, not a stream of them.
- **No stuck keys.** If a release is missed, the app corrects itself; a `snap` is the ground truth.
- **While paused,** key events are not sent and a `snap` has an empty `down` list.
- **Nothing is stored.** The server keeps only which keys are down right now ([decision 0005](decisions/0005-keystrokes-live-in-memory-only.md)).
- A client should ignore message types and fields it does not know, so additive changes never break it.

## Changing the protocol
1. Prefer additive changes (a new `t`, or a new field).
2. Update this page and the overlay page in the same change.
3. A breaking change needs a decision record (and, at that point, a version field).
4. The `smoke` and `secure-link` end-to-end suites exercise this contract; extend them with the change.
