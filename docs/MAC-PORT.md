# Porting to macOS — research (nothing implemented yet)

**Verdict: yes, and the best route is to keep Tauri.** Roughly 80% of the app is already cross-platform
(overlay, settings window, local server, settings storage, tray, updater, autostart). What is Windows-only is the
keyboard hook, one memory call, and the way the app is packaged and signed.

## What carries over unchanged

| Part | On macOS |
|---|---|
| Overlay page, settings UI, layouts, animations, themes | Same HTML/CSS/JS. The web view is **WKWebView** instead of WebView2, so it needs one visual test pass. OBS on Mac uses the same Browser Source, so the OBS setup is identical. |
| Local server + WebSocket (axum/tokio) | Same code. |
| Settings, presets, migrations | Same code (data folder becomes `~/Library/Application Support/com.keyoverlay.app`). |
| Tray / menu bar, pause, layout switch | Tauri supports it (becomes a **menu-bar icon**). Needs a monochrome "template" icon. |
| Autostart, clipboard, dialogs, single-instance | Tauri plugins already support macOS (autostart uses a LaunchAgent). |
| Updater | Supported (macOS uses a `.app.tar.gz` + the same signature scheme). Manifest gains `darwin-aarch64` and `darwin-x86_64` entries. |

## What has to be written for Mac

1. **Keyboard capture.** Replace the Windows `WH_KEYBOARD_LL` hook with a **listen-only `CGEventTap`** (via the
   `core-graphics` crate) on its own thread with a CFRunLoop — same shape as today: tiny callback, channel, dispatcher.
   - Needs the **Input Monitoring** permission. A *listen-only* tap asks for Input Monitoring; a default tap asks for
     the broader Accessibility permission, so listen-only is the right choice (least privilege).
   - Add a **key-code map**: macOS virtual key codes → the same DOM names the layouts use (`KeyW`, `Space`, …). About
     100 entries, physical-position based, same idea as `code_name()` in `keyhook.rs`.
   - **Repeat filtering** and the stuck-key self-heal carry over (macOS exposes key state via `CGEventSourceKeyState`).
2. **Permission flow (new first-run UX).** macOS will not deliver keys until the user ticks the app in
   *System Settings → Privacy & Security → Input Monitoring*, and the tap **fails silently** without it. So the app
   needs: a friendly "Allow keyboard access" screen, a button that opens that settings pane, a re-check, and an app restart
   after granting. Apple's forums report the app sometimes doesn't appear in the list until it has requested access
   (`CGRequestListenEventAccess`) and created a tap, so the flow should do both.
3. **Secure Input (a privacy plus, and a gotcha).** While a password field has focus, macOS turns on *Secure Event
   Input* and **stops all event taps system-wide**. Good: passwords can never reach the overlay on Mac. The gotcha: buggy
   apps sometimes leave it stuck on (reports exist for Cursor and 1Password), which silently kills the overlay. The app
   should detect it (`IsSecureEventInputEnabled`) and show a hint ("macOS is blocking key capture; lock/unlock the screen
   or quit the app holding secure input").
4. **Platform glue (small).** Menu-bar-only app (hide the Dock icon with the *accessory* activation policy), template tray
   icon, remove Windows-only WebView2 flags, `trim_memory` already a no-op via `platform.rs`, folder opening already uses `open`.
5. **Packaging, signing, notarization** (the part that costs money and time) — below.

## Distribution options

| Option | Cost | User experience | Notes |
|---|---|---|---|
| **Developer ID + notarization (recommended)** | Apple Developer Program, **US$99/year** | Double-click, no warnings | Tauri automates signing + notarization from CI using a certificate and App Store Connect API key. **Permissions (Input Monitoring) survive updates** because the signing identity stays the same. |
| Ad-hoc signed, unsigned/un-notarized | Free | Gatekeeper blocks the first launch; user must open *Privacy & Security → Open Anyway* (right-click → Open no longer works on recent macOS) | Required to run at all on Apple Silicon (ad-hoc signing). Because the identity changes every build, macOS may **re-ask for Input Monitoring after each update** (to verify when testing). Acceptable for early testers only. |
| **Build from source** (free, available as soon as the port exists) | Free | `brew install rust node`, `npm install`, `npm run build` | A locally built app is not quarantined, so Gatekeeper doesn't block it. Good for developers and early adopters, and a natural fit for an open-source project. |
| Homebrew cask | Free (needs a notarized or at least stable download) | `brew install --cask keystroke-overlay` | Nice later, once releases are signed. |

Build once as a **universal binary** (`--target universal-apple-darwin`) so one download runs on Intel and Apple
Silicon Macs.

## Most efficient plan

Everything is already prepared: OS-specific calls are isolated in `platform.rs`, and the Rust code is split into modules.

1. **Phase 1 — it runs.** Introduce a small `KeySource` interface; keep the Windows hook as `keyboard/windows.rs`; add
   `keyboard/macos.rs` (CGEventTap + key-code map + repeat filter). Gate Windows-only crates with
   `[target.'cfg(windows)'.dependencies]`. Add a `macos-latest` job to CI that builds (unsigned) and uploads the `.app`.
2. **Phase 2 — it behaves.** Permission screen, Secure Input hint, menu-bar icon, Dock icon hidden, visual pass over
   the settings window in WKWebView.
3. **Phase 3 — it ships.** Apple Developer ID, signing + notarization in a GitHub Actions release workflow, universal
   build, `darwin-*` entries in `latest.json`/`stable.json`, README install steps.
4. **Phase 4 — polish.** Mac-specific docs, Homebrew cask, community testers.

Rough effort: about **3–5 working days** of development plus the Apple account setup, most of it in steps 1–2.
Making the repository public helps: GitHub's macOS build machines are free for public repositories, and Mac users can
help test.

## What cannot be done without a Mac

The code can be written and **compiled** in CI without one, but the permission prompt, the real key capture and the
Gatekeeper experience can only be verified by a person on a real Mac (an Apple Silicon one ideally, since that is
where signing rules are strictest). Borrow one, use a hosted Mac, or recruit a tester when Phase 1 lands.

## If you decide not to port natively

There is no good shortcut: a Windows VM or Wine cannot see keystrokes on the Mac host, and a browser-only version
cannot see keys while a game has focus. The realistic alternatives are (a) a Mac-only companion written separately, or
(b) telling Mac users to use another tool. A native Tauri port is the least work for the most reliable result.

## Things to double-check before relying on them

These came from community sources and should be confirmed on a real Mac / in Apple's docs when the work starts:
the exact Input Monitoring behaviour for listen-only taps, whether the app reliably appears in the Input Monitoring list,
and whether ad-hoc signed builds really lose their permission on every update.

## Sources

- Tauri — [macOS code signing](https://v2.tauri.app/distribute/sign/macos/)
- Apple Developer Forums — [Input Monitoring permission list](https://developer.apple.com/forums/thread/828052), [why input monitoring permission is/isn't required](https://developer.apple.com/forums/thread/122492)
- [tauri-plugin-macos-input-monitor](https://github.com/yigitkonur/tauri-plugin-macos-input-monitor) (community plugin README: silent tap failure, restart after granting)
- Secure Event Input stalls taps system-wide: [Cursor report](https://forum.cursor.com/t/cursor-leaks-secure-event-input-breaks-all-system-wide-input-taps-until-quit-or-screen-lock/167585), [1Password community](https://www.1password.community/1password-at-work-58/secure-input-blocking-other-apps-event-taps-25015)
- Gatekeeper changes: [App permissions on macOS Sequoia](https://troz.net/post/2024/sequoia_app_permissions/), [Open unverified apps on Sequoia](https://iboysoft.com/tips/allow-apps-to-run-sequoia.html)
