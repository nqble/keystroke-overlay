# Porting to macOS — plan and status (Phases 1 and 2 done and checked on one Mac and merged into v2.0; Phase 3 is the free route)

**Verdict: yes, and the best route is to keep Tauri.** Roughly 80% of the app is already cross-platform
(overlay, settings window, local server, settings storage, tray, updater, autostart). What is Windows-only is key capture (the hook and Raw
Input), two small calls in `platform.rs` (`trim_memory`, `process_stats`; `process_stats` is now measured on a Mac too, `trim_memory` is a no-op there), and the way the app is packaged and signed.

## What carries over unchanged

| Part | On macOS |
|---|---|
| Overlay page, settings UI, layouts, animations, themes | Same HTML/CSS/JS. The web view is **WKWebView** instead of WebView2, so it needs one visual test pass. OBS on Mac uses the same Browser Source, so the OBS setup is identical. |
| Local server + WebSocket (axum/tokio) | Same code. |
| Settings, presets, migrations | Same code (data folder becomes `~/Library/Application Support/com.keyoverlay.app`). |
| Tray / menu bar, pause, layout switch | Tauri supports it (becomes a **menu-bar icon**). Uses a monochrome "template" icon (`src-tauri/icons/tray-template.png`, made from `assets/logo/logo-tray.svg`). |
| Autostart, clipboard, dialogs, single-instance | Tauri plugins already support macOS (autostart uses a LaunchAgent). |
| Updater | Not used on a Mac: `latest.json` and `stable.json` have no `darwin` entries, and the update check on a Mac says so and points to the Releases page. |

## What has to be written for Mac

1. **Keyboard capture.** Replace the Windows `WH_KEYBOARD_LL` hook with a **listen-only `CGEventTap`** (via the
   `core-graphics` crate) on its own thread with a CFRunLoop — same shape as today: tiny callback, channel, dispatcher.
   - Needs the **Input Monitoring** permission. A *listen-only* tap asks for Input Monitoring; a default tap asks for
     the broader Accessibility permission, so listen-only is the right choice (least privilege).
   - Add a **key-code map**: macOS virtual key codes → the same DOM names the layouts use (`KeyW`, `Space`, …). About
     100 entries, physical-position based, same idea as `code_name()` in `keyboard/keymap.rs`.
   - **Repeat filtering** and the stuck-key self-heal carry over (macOS exposes key state via `CGEventSourceKeyState`).
2. **Permission flow (new first-run UX).** macOS will not deliver keys until the user ticks the app in
   *System Settings → Privacy & Security → Input Monitoring*, and without it the tap either fails to start or starts and never receives a key (the second is what macOS 26 did on the test Mac). So the app
   needs: a friendly "Allow keyboard access" screen, a button that opens that settings pane, a re-check, and an app restart
   after granting. Apple's forums report the app sometimes doesn't appear in the list until it has requested access
   (`CGRequestListenEventAccess`) and created a tap, so the flow should do both.
3. **Secure Input (a privacy plus, and a gotcha).** While a password field has focus, macOS turns on *Secure Event
   Input* and **stops all event taps system-wide**. Good: passwords can never reach the overlay on Mac. The gotcha: buggy
   apps sometimes leave it stuck on (reports exist for Cursor and 1Password), which silently kills the overlay. The app
   should detect it (`IsSecureEventInputEnabled`) and show a hint ("macOS is blocking key capture; lock/unlock the screen
   or quit the app holding secure input").
4. **Platform glue (small).** Menu-bar app (hide the Dock icon with the *accessory* activation policy, and show it while the settings window is open), template tray
   icon, the Windows-only WebView2 flags in `window.rs` are ignored on a Mac (Tauri's `additional_browser_args` is Windows-only), `trim_memory` already a no-op via `platform.rs`, folder opening already uses `open`.
5. **Packaging, signing, notarization** (the part that costs money and time) — below.

## Distribution options

| Option | Cost | User experience | Notes |
|---|---|---|---|
| **Developer ID + notarization** (not used: Jordan chose the free route) | Apple Developer Program, **US$99/year** | Double-click, no warnings | Tauri automates signing + notarization from CI using a certificate and App Store Connect API key. **Permissions (Input Monitoring) survive updates** because the signing identity stays the same. |
| Ad-hoc signed, unsigned/un-notarized | Free | Gatekeeper blocks the first launch; user must open *Privacy & Security → Open Anyway* (right-click → Open no longer works on recent macOS) | Required to run at all on Apple Silicon (ad-hoc signing). Because the identity changes every build, macOS does **not honor the old Input Monitoring permission after each update** (verified on the M1: it must be cleared and allowed again, see below). Acceptable for early testers only. |
| **Build from source** (free, available as soon as the port exists) | Free | Command Line Tools, Rust, Node, `npm ci`, `npx tauri build --bundles app ...` (see the README) | A locally built app is not quarantined, so Gatekeeper doesn't block it. Good for developers and early adopters, and a natural fit for an open-source project. |
| Homebrew cask | Free (needs a notarized or at least stable download) | `brew install --cask keystroke-overlay` | Nice later, once releases are signed. |

Not done: the build is Apple Silicon only (Jordan's choice), and Intel Macs are untested. A universal binary (`--target universal-apple-darwin`) would cover both.

## Most efficient plan

Everything is already prepared: OS-specific calls are isolated in `platform.rs`, and the Rust code is split into modules.

1. **Phase 1 — it runs.** Already done: the capture methods sit behind one interface (`Method` in `keyboard/mod.rs`),
   Windows-only crates are gated with `[target.'cfg(windows)'.dependencies]`, and CI builds and tests on `macos-latest` (the
   `other-systems` job, which is still allowed to fail until its first green run). `keyboard/macos.rs` (listen-only CGEventTap) and `keyboard/macos_keys.rs` (key-code map, repeat filter, stuck-key
   release) are written and unit-tested, and seen working on a real Mac. The workflow that builds an unsigned `.app` in CI and attaches it to a release
   (`mac-app.yml`) is written and has not yet run on GitHub.
2. **Phase 2 — it behaves.** Done and merged into v2.0: a notice under the header (Allow keyboard access / restart / Secure
   Input hint, `ui/settings/keyboard-access.js`), menu-bar app (in the Dock only while the settings window is open) with a monochrome template tray
   icon, and a native window frame (real red/yellow/green buttons, rounded corners). Seen on a Mac: the tray icon, the native
   window and header fit, the Dock icon (shown only while the settings window is open), the Allow and restart notices, the update dot on the tray icon, and every tab. The Secure Input hint is tested
   in code but has not been seen on screen.
3. **Phase 3 — it ships (decided by Jordan: the free route only).** No Apple Developer account, no signing certificate and no
   notarization. Every release from `main` gets an Apple Silicon download (`mac-app.yml`, attached by `release.yml`); it is signed
   ad hoc, so a first launch needs **Open Anyway**, and the keyboard permission must be allowed again after every update
   (the user guide says how). The Mac port is for v2.0 and later. The Advisory Session owns the download workflow and its
   first real run, which needs Jordan's OK for a pull request or a release. Intel Macs, in-app updates on a Mac and
   a Homebrew cask are not part of this.
4. **Phase 4 — polish.** Mac-specific docs, Homebrew cask, community testers.

Rough effort (the original estimate): about **3–5 working days** of development plus the Apple account setup, most of it in steps 1–2; the Apple account is not used.
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
  runs on Apple Silicon (the release workflow signs the whole app ad hoc again, which makes the identifier `com.keyoverlay.app`). A locally built app is not quarantined, so macOS opens it without the Open Anyway step.
- [x] **Restart after granting.** The first version of the "Restart now" button made the app vanish: Tauri's restart opens
  the new copy while the old one still runs, and the single-instance guard sends the new copy away. `platform::restart_app`
  now waits for the old copy to exit and then opens the app. Checked on the M1 by running that wait-then-open step against
  the real app (it came back with a new process id); the button itself is not clicked yet.
- [x] Input Monitoring: the `.app` appears in the list as "Keystroke Overlay" with the keycap logo, and after granting and a
  restart keys are captured (checked on the M1).
- [x] **Does the permission survive a rebuild?** Not in general (see "The permission belongs to one exact build" below). One
  early rebuild (the build's own signature, code hash changed, identifier did not) happened to keep capturing without
  granting again, while macOS's own check (`CGPreflightListenEventAccess`) answered "not allowed" for it, which is why the
  window's notice does not trust that check alone.
- [x] README: the short "On a Mac" build steps, and the "On a Mac" section of USER-GUIDE.md (first launch, keyboard access,
  Fn, Secure Input, troubleshooting). Written from the commands run on the M1; a clean-machine run is not done.

- **A denied app can still start a tap.** After the permission record was reset, macOS's log said "does not allow
  prompting; returning denied", yet the tap started without an error and received no keys, so "no error" does not prove
  capture works. Also seen: an app whose permission no longer matched its build still received the modifier keys (⌃ ⌥ ⌘, Shift, Caps Lock) but none of the ordinary keys, so the overlay lit only the modifiers; the app therefore counts only an ordinary key as proof that capture works. The window shows the Allow bar while macOS says no and no ordinary key has arrived yet (the app
  remembers only that a key arrived, never which). Also seen: a build re-signed as a whole (new identity) lost its
  Input Monitoring permission until the old record was removed and the app allowed again.

- **The permission belongs to one exact build.** macOS's log says "Failed to match existing code requirement" after a
  rebuild: an ad-hoc signed app's identity is its code hash (`designated => cdhash ...`), which changes with every build.
  The old Input Monitoring entry then still looks on but does nothing. What fixed it on the M1: `tccutil reset
  ListenEvent com.keyoverlay.app`, then Allow keyboard access, switch it on, restart (the app usually then appears in the list and keys light up; once it did not appear even though macOS logged the request, and
  adding it with the **+** button and the app's folder worked, then Restart now, then keys lit up). Toggling the old entry, or removing it with the minus button, did not (as far as the test on the M1 showed). So Mac users must re-allow after
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
login" (there is no Minimize switch on a Mac, see "Closing, quitting and reopening" below), no Compatibility input
method (only Windows has it; Linux has none either), "⌘-click to add" and "delete" in the Keys tab hints, and the pause
shortcut shows ⌘ ⌥ ⌃ ⇧ and asks for "⌘, ⌥ or ⌃". A Command shortcut is saved as "Super", which the shortcut library reads
(tested). On the M1 a pause shortcut set with Command worked for two-key combinations (⌘P, ⌘↑), which fired with another app in front, and ⌘⌥P and ⌃⌥P were set successfully (firing with another app in front was not separately confirmed); ⌘⇧P did not work (the cause is not known, another app may use it). Before that fix, Esc and a click did nothing while recording a shortcut, because Safari's engine does not focus a clicked button; clicking now focuses the button. Fonts: the Style → Font family list shows "Mac fonts" on a Mac; the saved default stays "Segoe UI" (changing it
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
simulated Safari pinch, and the Windows mode (the wheel zooms, a sideways scroll does nothing). Then tried with
real fingers on the M1 trackpad in the Mac window: the pinch zooms around the pointer, and the two-finger scroll pans
(it lagged until sliding was switched off during the scroll, then felt right). The Windows precision-touchpad pinch
(Ctrl + a small wheel delta) is not yet tried on a PC.

## Idle CPU and memory on a Mac (measured on the M1, macOS 26, the built app)

Average CPU from the processes' own cumulative CPU time, memory as resident size, the app plus its web view helper processes:

| State | CPU | Memory | Processes |
|---|---|---|---|
| Settings window open (preview running) | 0% over 45 s and 60 s | about 183 to 191 MB | 4 (the app, the web content for the settings page and the preview, and Apple's networking helper) |
| Settings window closed, menu-bar only | 0% over 60 s and 90 s | about 99 to 108 MB | 2 (the app about 83 MB, and `com.apple.WebKit.Networking` about 16 MB) |

So the "about 0% CPU at idle" promise holds on a Mac, and closing the window really ends its web view processes (about 80
MB less). The memory is much higher than the few MB the Windows build is described with, because the app process itself
holds about 83 MB at rest (Tauri, the WebKit framework and the key tap) and Apple's networking helper stays; that is a
fact about the Mac build, not measured against the Windows number. Not measured: memory over hours, or with OBS
connected.

## Open at login on a Mac

Read from the `auto-launch` crate source (the autostart plugin uses `MacosLauncher::LaunchAgent`): turning it on writes
`~/Library/LaunchAgents/<app name>.plist` pointing at the running app and its `--autostart` argument; turning it off removes
that file. Jordan turned it on in the real app: the app then appeared in System Settings under the background items ("Allow in the Background"), not in the "Open at Login" list at the top, which is how macOS lists a LaunchAgent; whether it starts after a real log in was not tried. To check by hand: open
General, scroll to Startup, turn **Open at login** on, look for the file with `ls ~/Library/LaunchAgents | grep -i keystroke`,
turn it off, and look again (it should be gone). A login item points at the app's current location, so it breaks if the app is
moved or rebuilt elsewhere.

## Why there is no Command+, shortcut

A Settings item with Command+, was tried and removed: the app only has a menu bar while its settings window is open (otherwise it
is a menu-bar app with no menus), and then Command+, could only bring the window that is already open forward, so it looked
broken. Opening Settings is the menu-bar icon's **Open settings**, or opening the app again from Finder or Launchpad.

## Bundle and the minimum macOS version

`tauri.conf.json` gives the Mac bundle the category Utility (`LSApplicationCategoryType`) and the minimum system version 11.0
(`LSMinimumSystemVersion`). Before this the bundle said 10.13 while the program itself is built for macOS 11.0 (its
`minos`, from Rust's default Mac target), so an older Mac would have started it and failed. Only the newest macOS (26) on
one Apple Silicon Mac has been tried.

## Closing, quitting and reopening on a Mac

Jordan's decisions: Command+Q quits the app; Command+W, the red button and the yellow button all close the settings window to
the menu bar (the app keeps running, the Dock icon goes away); the green button keeps its default. How it works:
- `platform::install_app_menu` gives the app its own menu bar while the window is open (the app name menu with Hide, Hide Others and Quit
  Keystroke Overlay (⌘Q); Edit, so copy and paste work in the settings fields; Window with
  Close Window (⌘W)). Quit has to be our own item: the default one asks the app to exit without a code, which the app
  refuses so that closing the last window leaves it in the tray (`RunEvent::ExitRequested` in `main.rs`).
- The yellow button: macOS sends no resize event when a window is minimized, so `window.rs` checks 400 ms after the window
  loses focus whether it is minimized and closes it (`platform::minimize_closes_window`: always on a Mac; elsewhere the
  "Minimize to tray" setting). The Minimize switch is hidden on a Mac (`hasMinimizeSetting` in `system-words.js`).
- Opening the app again from Finder, Launchpad or Spotlight while it runs in the menu bar brings the window back
  (`platform::on_run_event`, macOS's "reopen" message); a second start of the program reuses the first (single instance).
- Checked on the M1 with the built app, clicking the real buttons and the menu items (not by pressing keys): Window → Close
  Window, the red button and the yellow button (with the app in front) each close the window, keep the process running and
  hide the Dock icon; opening the app again brings a window back with the same process; Quit ends the process with no helper
  left. The key presses ⌘W and ⌘Q themselves were not pressed (no way to send keys from here): try them by hand.
  A closed window can still show in tools that list windows as a lingering off-screen window; it is not on screen.

## Checked on the M1: Secure Input and the update dot

- **Secure Input:** a macOS-only test (`secure_input_on_follows_the_system` in `keyboard/macos.rs`) turns Secure Input on and
  off the way a password box does and checks `secure_input_on` follows it, so the window's hint and the bug report's
  row have a working source.
- **Update dot on the tray icon:** a development copy run with `KEYOVERLAY_TEST_UPDATE_BASE` pointing at a local mock
  update file (a newer version with a `darwin-aarch64` entry) found the "update"; Jordan saw the colored icon with the
  orange dot, and "Update available" at the top of the tray menu. Since v2.0 the in-window update button is the
  "Update ready" button in the header's top right.

## Every tab checked in the real Mac window

Layout, Keys, Style, Animation, General and Debug were opened in the real app (a built `.app`, Debug mode on) and
looked at: the real window frame and buttons line up with the header; the keys show the Mac names (⌃ ⌘ ⌥, delete, return);
the Keys tab has the Layout style switch, Close gaps, Reset and the Pinch / Scroll hints; General shows only Standard
with "listen-only event tap"; the Debug tab shows memory and open files, Input Monitoring, Secure Input and "Standard
(event tap)". It also showed the browser engine as a long text (now "WebKit 605.1.15"), and Debug's intro said
"General → App → Debug mode" (the section is called Advanced).

## Things to double-check before relying on them

These came from community sources. Confirmed on the M1: ad-hoc signed builds do lose their Input Monitoring permission after a rebuild (macOS's log says it fails to match the code requirement), and the app appears in the list once it has asked. Still to confirm in Apple's docs or on other macOS versions: the exact Input Monitoring behavior for listen-only taps (the test Mac runs macOS 26 only).

## Sources

- Tauri — [macOS code signing](https://v2.tauri.app/distribute/sign/macos/)
- Apple Developer Forums — [Input Monitoring permission list](https://developer.apple.com/forums/thread/828052), [why input monitoring permission is/isn't required](https://developer.apple.com/forums/thread/122492)
- [tauri-plugin-macos-input-monitor](https://github.com/yigitkonur/tauri-plugin-macos-input-monitor) (community plugin README: silent tap failure, restart after granting)
- Secure Event Input stalls taps system-wide: [Cursor report](https://forum.cursor.com/t/cursor-leaks-secure-event-input-breaks-all-system-wide-input-taps-until-quit-or-screen-lock/167585), [1Password community](https://www.1password.community/1password-at-work-58/secure-input-blocking-other-apps-event-taps-25015)
- Gatekeeper changes: [App permissions on macOS Sequoia](https://troz.net/post/2024/sequoia_app_permissions/), [Open unverified apps on Sequoia](https://iboysoft.com/tips/allow-apps-to-run-sequoia.html)
