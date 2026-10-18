# Porting to macOS — plan and status (Phases 1 and 2 on `mac/port`; Phase 1 seen working on a Mac, Phase 2 partly)

**Verdict: yes, and the best route is to keep Tauri.** Roughly 80% of the app is already cross-platform
(overlay, settings window, local server, settings storage, tray, updater, autostart). What is Windows-only is key capture (the hook and Raw
Input), two small calls in `platform.rs` (`trim_memory`, `process_stats`), and the way the app is packaged and signed.

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
     100 entries, physical-position based, same idea as `code_name()` in `keyboard/keymap.rs`.
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
4. **Platform glue (small).** Menu-bar app (hide the Dock icon with the *accessory* activation policy, and show it while the settings window is open), template tray
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

1. **Phase 1 — it runs.** Already done: the capture methods sit behind one interface (`Method` in `keyboard/mod.rs`),
   Windows-only crates are gated with `[target.'cfg(windows)'.dependencies]`, and CI builds and tests on `macos-latest` (the
   `other-systems` job). `keyboard/macos.rs` (listen-only CGEventTap) and `keyboard/macos_keys.rs` (key-code map, repeat filter, stuck-key
   release) are written and unit-tested; it still has to be seen working on a real Mac. Still to do: make CI upload an
   unsigned `.app`.
2. **Phase 2 — it behaves.** Written on `mac/port`: a notice under the header (Allow keyboard access / restart / Secure
   Input hint, `ui/settings/keyboard-access.js`), menu-bar app (in the Dock only while the settings window is open) with a monochrome template tray
   icon, and a native window frame (real red/yellow/green buttons, rounded corners). Seen on a Mac: the tray icon, the native
   window and header fit. The Dock icon (shown only while the settings window is open) is not yet seen. Not yet seen: the Allow / restart / Secure Input notices on screen, the
   update badge on the template icon, and a visual pass over every tab.
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

## Seen on a real Mac (M1 MacBook Air, macOS 26)

- **Key capture works** with a listen-only tap once Input Monitoring is allowed. A dev build started *before* the
  permission was granted showed nothing; after a restart it captured normally, so the restart hint is needed.
- **F keys:** all of F1 to F12 arrive when Fn is held. Without Fn only some of them arrive as F keys: on a Mac laptop
  the top row is brightness, volume and media keys by default, which are not ordinary key events. A test pressing
  F1 to F12 with and without Fn gave F1, F2, F3 and F11 twice and the other eight once.

## Free route, Stage A: build from source (status, so the work can pause at any point)

Plan: build a real `.app`, test it, write the README steps. Nothing in this stage touches GitHub beyond pushing `mac/port`.

- [x] **The app builds.** `npx tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'` makes
  `src-tauri/target/release/bundle/macos/Keystroke Overlay.app` (5.9 MB, about 2 minutes on an M1 after the first build).
  The updater setting is switched off for this build because it needs the release signing key, which stays outside the
  project. If the Command Line Tools are older than their newest SDK, the linker fails with a "malformed file" error;
  `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk` (any older SDK there) works around it, and updating the
  Command Line Tools fixes it for good.
- [x] **It is signed ad hoc by the build** (`codesign -dv` says `Signature=adhoc`, identifier `keyoverlay-<hash>`), so it
  runs on Apple Silicon. A locally built app is not quarantined, so macOS opens it without the Open Anyway step.
- [x] **Restart after granting.** The first version of the "Restart now" button made the app vanish: Tauri's restart opens
  the new copy while the old one still runs, and the single-instance guard sends the new copy away. `platform::restart_app`
  now waits for the old copy to exit and then opens the app. Checked on the M1 by running that wait-then-open step against
  the real app (it came back with a new process id); the button itself is not clicked yet.
- [x] Input Monitoring: the `.app` appears in the list as "Keystroke Overlay" with the keycap logo, and after granting and a
  restart keys are captured (checked on the M1).
- [x] **Does the permission survive a rebuild?** On the M1 (macOS 26), yes for one rebuild: after a rebuild with a new
  signature (the code hash changed, the identifier did not) keys were still captured without granting again. Oddly,
  macOS's own check (`CGPreflightListenEventAccess`) answered "not allowed" for that rebuilt app, so the window's notice
  now trusts whether capture is really running instead of that check. Not tested across several rebuilds or updates.
- [x] README: the short "On a Mac" build steps, and the "On a Mac" section of USER-GUIDE.md (first launch, keyboard access,
  Fn, Secure Input, troubleshooting). Written from the commands run on the M1; a clean-machine run is not done.

- **A denied app can still start a tap.** After the permission record was reset, macOS's log said "does not allow
  prompting; returning denied", yet the tap started without an error and received no keys, so "no error" does not prove
  capture works. The window therefore shows the Allow bar while macOS says no and no key has arrived yet (the app
  remembers only that a key arrived, never which). Also seen: a build re-signed as a whole (new identity) lost its
  Input Monitoring permission until the old record was removed and the app allowed again.

- **The permission belongs to one exact build.** macOS's log says "Failed to match existing code requirement" after a
  rebuild: an ad-hoc signed app's identity is its code hash (`designated => cdhash ...`), which changes with every build.
  The old Input Monitoring entry then still looks on but does nothing. What fixed it on the M1: `tccutil reset
  ListenEvent com.keyoverlay.app`, then Allow keyboard access, switch it on, restart (the app then appears in the list
  and keys light up). Toggling the old entry, or removing it with the minus button, did not. (One earlier rebuild kept working; the log says why it normally does not.) So Mac users must re-allow after
  every update. Ways around it, none done: a signing certificate that stays the same between builds (a self-signed one
  kept as a secret in CI, or Apple's paid Developer ID), or signing with a rule that matches on the identifier alone,
  which would let any program with the same identifier inherit the keyboard permission, a real weakening for this app.

## Debug tab on a Mac (what is done and what is not checked)

- Memory (from the Mach kernel) and open files (counted in /dev/fd) are measured on a Mac; Linux reads /proc/self. A
  system that does not measure one says "not measured on this system" instead of showing 0.
- The Debug tab and the bug report name the capture method as the app knows it ("Standard (event tap)") and add Input
  Monitoring and Secure Input rows and two self-test lines, on a Mac only.
- The Developer tools steps for a Mac (Safari's Develop menu, a development build only) are not yet tried on the M1;
  `npm run dev:debug` now finds the Mac data folder, so the development copy gets its own port.
- The visual suite (`npm run test:visual`) is Windows only: there are no macOS baselines yet.

## Settings window words on a Mac

The settings window says what a Mac says (`ui/settings/system-words.js`, chosen by `platform` from the app): "Open at
login", "Minimize to the menu bar" (minimizing closes the window and leaves the menu-bar icon), no Compatibility input
method (only Windows has it; Linux has none either), "⌘-click to add" and "delete" in the Keys tab hints, and the pause
shortcut shows ⌘ ⌥ ⌃ ⇧ and asks for "⌘, ⌥ or ⌃". A Command shortcut is saved as "Super", which the shortcut library reads
(tested). Not yet checked on the M1: that a Command-based pause shortcut registers and fires. Fonts: the Style → Font family list shows "Mac fonts" on a Mac; the saved default stays "Segoe UI" (changing it
would need a settings migration) and shows as "System font (default)", and the overlay falls back to the system font, so
the keys look right even when OBS runs on another computer (`ui/overlay/overlay.js`, FONT_FALLBACKS). Key labels follow the keyboard language on a Mac too
(`keyboard/macos_labels.rs`: the current layout through the Text Input Sources and `UCKeyTranslate` calls in Carbon, no
crate; the US and ABC layouts give nothing; asked once at start-up on the main thread). Checked on the M1 on the US
layout with the lookup forced on: all 16 typing keys tried came back as the US letters, so the calls and the key-code
table work. Then checked on a real French (AZERTY) layout, added in System Settings and switched to before starting the
app: Q shows A, W shows Z, A shows Q, Z shows W, the key beside L shows M, the comma, period and slash keys show
semicolon, colon and equals, the quote key shows Ù, and the digit row keeps its digits.
It also follows the keyboard live: switching layout in the menu-bar input menu makes macOS post a system-wide notice
(`kTISNotifySelectedKeyboardInputSourceChanged`), the app asks the layout again on the main thread, and when the labels
changed the preview, OBS and the settings window re-read their layouts (checked on the M1: switched to French with the
window open, the preview changed by itself; no timer runs). `platform::watch_keyboard_layout` is the hook for the other
systems. The key editor pans with a two-finger scroll, zooms with a pinch (or ⌘ + scroll), and Space + drag pans everywhere
(`editor/view-gestures.js`); the gesture logic is unit-tested, and the wiring was driven in a real browser page through the UI sandbox
(`?platform=macos&tab=keys`) with synthetic events: a pinch, a two-finger scroll, Command + scroll, Space + drag (pans by
the pointer's distance, selects nothing, ignored in a text box), middle-button drag, a plain drag not panning, a
simulated Safari pinch, and the Windows mode (the wheel zooms, a sideways scroll does nothing). Not yet tried with
real trackpad fingers in the Mac window.

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
