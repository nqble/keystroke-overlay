# 0005: Keystrokes live in memory only, and tests enforce it
Status: Accepted
Date: 2026-10-15

## Context
An app that reads every key press has to prove it is not a keylogger, not just say so.

## Decision
A key event exists only as `{key name, down or up}` in memory, moves through one pipeline to the local overlay page, and
is gone when the key is released. The app records no text, no history, no files and no logs of keys.

Rules, each enforced by `npm run check:privacy` (it runs on every change on GitHub):
- network code lives in exactly one file (`src-tauri/src/commands/updates.rs`);
- the server binds `127.0.0.1` only;
- no file writes in the keyboard code or the server;
- no logging calls;
- no external requests from the web pages.

The optional Debug mode keeps its event log in memory only and is off by default.

## Why
Rules a computer checks last longer than promises in a README, and they let a stranger verify the claim in one command.

## Consequences
- A change that needs one of these exceptions needs a new decision record and an update to PRIVACY.md and README.
- Do not add analytics, crash reporting or "send log" features.
