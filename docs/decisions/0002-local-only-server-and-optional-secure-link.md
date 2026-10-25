# 0002: The overlay server is local-only; the secure link is optional
Status: Accepted
Date: 2026-10-15

## Context
OBS shows the overlay by loading a web page from the app, so the app runs a small web server. A server that listens on
the network could expose live key presses to other computers or to websites.

## Decision
- The server binds to `127.0.0.1` only. Other computers cannot reach it.
- Requests must carry a `Host` of `localhost:<port>` or `127.0.0.1:<port>`, and any `Origin` header must be the same
  local address. This blocks DNS-rebinding and other websites from reading the stream.
- An **optional secure link** (**General → Connection → Secure my OBS URL**, off by default) adds a private key (`?key=`). With it on, the data
  endpoints and the key stream refuse requests without the key.

## Why
- Local-only is the simplest promise to keep and to verify (`npm run check:privacy` enforces the bind address).
- The secure link is optional because the plain link is simpler for most people, and the remaining risk (another program
  on the same PC) is already able to install its own keyboard hook.

## Consequences
- Anything that needs network access, such as a dual-PC streaming mode, must be an opt-in setting, must require the
  secure link, must carry a clear warning, and needs a new decision record and a privacy-docs update.
- Protected paths: `/api/*`, `/ws`, `/fonts/*`, `/user/*`. The overlay page and its code (`/`, `/overlay/*`) stay open
  because they contain nothing private. See [PROTOCOL.md](../PROTOCOL.md).
