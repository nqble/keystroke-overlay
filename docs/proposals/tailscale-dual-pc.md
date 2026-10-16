# Proposal: dual-PC streaming through Tailscale Serve

Status: **Not built; a no-code workaround was chosen instead** (2026-10-15, see the update below). Kept as background in
case a built-in mode is wanted later; if that happens it becomes decision record 0009. Written 2026-10-15 by a side session; to be reviewed by the master session and the advisor
before anyone writes code.

> Update 2026-10-15: the advisor recommended documenting a no-code workaround (an SSH tunnel over Tailscale) instead of building this; see [README: Using two PCs](../../README.md#using-two-pcs-game-on-one-obs-on-the-other). The design below is kept as background in case a built-in mode is wanted later.

## Problem
Some streamers use two PCs: a **gaming PC** (where the keys are pressed and this app runs) and a **streaming PC** (where OBS
runs). OBS loads the overlay from `http://localhost:7878/`, which on the streaming PC means *its own* localhost, so the
overlay cannot work. Today there is no supported way to reach the app from another computer, by design
([decision 0002](../decisions/0002-local-only-server-and-optional-secure-link.md)).

## Goal
Let OBS on a second PC show the overlay **without** making the app listen on the network and **without** weakening the
privacy promises for everyone who doesn't use this.

## Non-goals
- No public internet exposure (no Tailscale Funnel).
- No "listen on the local network" (`0.0.0.0`) mode.
- The app does not install, start or control Tailscale, and does not call the `tailscale` command.
- No change for single-PC users: the feature is off by default and invisible until the secure link is on.

## Proposed design
Tailscale Serve (documented in [Tailscale's Serve docs](https://tailscale.com/docs/features/tailscale-serve)) publishes a
local port to the user's own private tailnet over HTTPS, for example `tailscale serve --bg 7878`. The app keeps listening on
`127.0.0.1` only; Tailscale connects to it locally and does the exposing. Two pieces are missing in the app:

1. **A new optional setting, `general.allowedHost`** (empty by default): one exact host name, for example
   `gaming-pc.tail1234.ts.net`. It is only editable while the secure link is on.
2. **The request guard in `server.rs` also accepts that one name.**
   - `Host` may be `<allowedHost>` or `<allowedHost>:<port>` (a browser sends no port for HTTPS on 443).
   - If an `Origin` header is present it may also be `https://<allowedHost>`.
   - Everything else stays exactly as now (localhost / 127.0.0.1 only). A wrong host still gets HTTP 403.
   - The secure-link key is still required for `/api/*`, `/ws`, `/fonts/*`, `/user/*` (HTTP 401 without it).

Validation of the setting (in `settings.rs`, same style as the other sanitisers):
- lower-case letters, digits, hyphens and dots only, at most 253 characters;
- must end in `.ts.net` (so the feature cannot be pointed at an arbitrary domain);
- anything invalid is dropped back to empty.

User-facing pieces:
- **General → Secure link:** a "Tailscale name" box with one line of help, shown only when the secure link is on.
- **Copy link:** when a name is set, a second button copies `https://<name>/?key=<key>` (the link for OBS on the other PC).
- **README section** "Two PCs with Tailscale": install Tailscale on both PCs, run one command on the gaming PC, paste the
  link into OBS on the streaming PC, plus a note about Tailscale access rules (let only the streaming PC reach the gaming PC).

## Why this design
| | |
|---|---|
| App still binds `127.0.0.1` only | The `check:privacy` guarantee and decision 0002's core promise stay true. Tailscale, not the app, opens the door. |
| One exact name, `.ts.net` only | The Host/Origin check exists to stop DNS-rebinding and other websites. Allowing a single known name that only resolves inside the user's tailnet keeps that protection. |
| Secure link required | Two locks: being on the tailnet, and knowing the key. |
| Off by default, hidden unless secure link is on | Single-PC users see no change. |

## Alternatives considered
- **Bind to the Tailscale address (100.x.y.z) from the app:** more code (interface detection), and the app itself would then
  listen on a network interface. Rejected.
- **Tailscale Funnel (public):** [anyone with the URL can connect](https://tailscale.com/blog/reintroducing-serve-funnel). Too
  risky for a live keystroke stream, even with the key. Rejected.
- **LAN mode (`0.0.0.0`):** unencrypted and visible to everything on the network. Rejected; Tailscale is the safer way to get
  the same result.
- **Do nothing:** dual-PC streamers cannot use the app. Acceptable, but it leaves a real group out.

## Unknowns to verify BEFORE building (about 30 minutes, two devices on one tailnet)
1. Does Serve forward the **original Host name** to the app? (One user report says yes; Tailscale's own docs do not say.)
   Today's app would then answer 403, which also confirms the problem.
2. Does the **WebSocket upgrade** (`/ws`) work through Serve, and what `Origin` does OBS's browser source send?
3. What exactly does OBS's browser source send for `Host` when loading an `https://….ts.net/` URL? (Port or no port.)
4. How much **delay** do key events show over a direct connection vs a relayed one?

## Test plan (when built)
- Unit tests in `server.rs`: Host/Origin matrix (localhost, 127.0.0.1, allowed name with and without port, `https` origin,
  a look-alike name such as `evil.tail1234.ts.net.attacker.com`, an empty setting = old behaviour exactly).
- Unit tests in `settings.rs`: the validation rules above.
- End-to-end: extend the `secure-link` suite with raw HTTP requests carrying custom `Host` headers; confirm the plain
  behaviour is unchanged when the setting is empty.
- Manual two-device test following the README steps, recorded in the pull request.

## Docs to update if accepted
- New decision record `0009` (and a line in `docs/decisions/README.md`); update the dual-PC bullet in
  `docs/decisions/ideas-not-decided.md` and the "Consequences" of decision 0002.
- `docs/PROTOCOL.md` (the Host/Origin rules and the new setting), `docs/FILE-FORMATS.md` (the setting and its range),
  `PRIVACY.md` and the README privacy section (key presses can now leave the PC, only to the user's own device, over
  Tailscale's encrypted connection, only with the secure link on).

## Risks
- **Security review needed:** this is the first relaxation of the Host/Origin guard. It should be reviewed by the advisor
  before implementation, with the look-alike-name tests above as the minimum bar.
- **Support burden:** Tailscale setup problems will show up as app issues. The README section should say plainly what the app
  does and does not do.
- **Overlay appears slightly ahead of video** with capture cards. An optional "delay the overlay" setting is a separate idea.

## Effort
Small to medium: one setting, a guard change, one UI box and button, tests, and the doc updates listed above. The
verification step comes first and may change the design.
