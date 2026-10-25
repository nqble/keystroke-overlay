# The Mac version

How Keystroke Overlay works on macOS, how it is built and shipped, what has been checked on a real Mac, and what
hasn't. For using it, see the user guide's [On a Mac](USER-GUIDE.md#on-a-mac). The Mac version ships from v2.0, for
Apple Silicon Macs on macOS 11 or newer.

## What is the same as on Windows

Most of the app is shared: the overlay page, the settings window, layouts, themes and animations, the local server and
WebSocket, settings with their migrations, the tray (a menu-bar icon on a Mac), pause and layout switching, and the
autostart, clipboard, dialog and single-instance plugins. The differences:

| Part | On macOS |
|---|---|
| Web view | **WKWebView** instead of WebView2. OBS on a Mac uses the same Browser source, so the OBS setup is identical. |
| Data folder | `~/Library/Application Support/com.keyoverlay.app` |
| Tray | A menu-bar icon with a monochrome "template" picture (`src-tauri/icons/tray-template.png`, made from `assets/logo/logo-tray.svg`). |
| Autostart | "Open at login", through a LaunchAgent. |
| Updates | Not installed in the app: see [Releases and updates](#releases-and-updates). |
| `platform.rs` | `process_stats` measures memory (from the Mach kernel) and open files (`/dev/fd`); `trim_memory` does nothing. |

## Key capture

- **A listen-only event tap** (`CGEventTap` through the `core-graphics` crate, `keyboard/macos.rs`) on its own thread
  with a run loop: a tiny callback, a channel, the shared dispatcher, the same shape as on Windows. Listen-only matters:
  it needs only the **Input Monitoring** permission, where a default tap would ask for the broader Accessibility one.
  `tools/check-privacy.mjs` fails any change that would make the tap do more than listen.
- **Key codes:** `keyboard/macos_keys.rs` maps macOS virtual key codes to the same names the layouts use (`KeyW`,
  `Space`, …), by physical position, and filters repeats and releases stuck keys (unit-tested).
- **F keys:** on a Mac laptop the top row is brightness, volume and media keys by default, which aren't ordinary key
  events. All of F1 to F12 arrive while Fn is held; without Fn only some do (a test gave F1, F2, F3 and F11).
- **Secure Input:** while a password field has focus, macOS turns on Secure Event Input and stops every event tap on the
  system, so passwords can't reach the overlay. Some apps leave it stuck on (reports exist for Cursor and 1Password),
  which silently stops the overlay; the app checks `IsSecureEventInputEnabled` and shows a hint (lock and unlock the
  screen, or quit the app holding it). A macOS-only test (`secure_input_on_follows_the_system`) turns Secure Input on
  and off the way a password box does and checks the app follows it.

## The keyboard permission

macOS delivers no keys until the user switches the app on in **System Settings → Privacy & Security → Input
Monitoring**, and then the app must restart. The settings window shows a notice under the header (Allow keyboard access,
then Restart now; `ui/settings/keyboard-access.js`) until capture really works. Things learned on a real Mac:

- **A denied app can still start a tap**, with no error, and receive nothing. So "no error" doesn't prove capture works.
- **A stale permission can let only the modifiers through** (⌃ ⌥ ⌘, Shift, Caps Lock): so the app counts only an
  ordinary key as proof that capture works, and the notice stays until one has arrived (the app remembers only that a
  key arrived, never which). macOS's own check (`CGPreflightListenEventAccess`) isn't trusted alone either: once it said
  "not allowed" for a build that was capturing.
- **The app may only appear in the list after it has asked:** it calls `CGRequestListenEventAccess` and creates a tap,
  as Apple's forums advise.
- **Restart now** waits for the old copy to exit before opening the app again (`platform::restart_app`). Tauri's own
  restart opened the new copy while the old one ran, and the single-instance guard sent the new copy away.
- **The permission belongs to one exact build.** An ad-hoc signed app's identity is its code hash, which changes with
  every build, so after an update the old Input Monitoring entry still looks on but does nothing (macOS logs "Failed to
  match existing code requirement"). What works: `tccutil reset ListenEvent com.keyoverlay.app`, then Allow keyboard
  access, switch it on, Restart now. If the app isn't in the list after the reset, the **+** button and the app's folder
  add it. Switching the old entry off and on, or removing it, did not help. The user guide gives these steps.
  Ways around it, none used: a signing certificate that stays the same between builds (a self-signed one kept in CI,
  or Apple's paid Developer ID), or a signature rule that matches the identifier alone, which would let any program with
  the same identifier inherit the keyboard permission: a real weakening for this app.

## Releases and updates

| Option | Cost | What the user sees | Used? |
|---|---|---|---|
| Ad-hoc signed, not notarized | Free | Gatekeeper blocks the first launch: **Open Anyway** in Privacy & Security (right-click → Open no longer works on recent macOS); the keyboard permission again after each update | **Yes**: every release |
| Build from source | Free | No warning: a locally built app isn't quarantined | Yes, for developers (README, "Building from source") |
| Developer ID and notarization | Apple Developer Program, US$99 a year | Double-click, no warnings; the permission survives updates | No: the project uses the free route |
| Homebrew cask | Free | `brew install --cask keystroke-overlay` | Not yet: it wants a stable, ideally notarized download |

- `mac-app.yml` builds the ad-hoc signed `.app` (Apple Silicon, identifier `com.keyoverlay.app`) on every change, and
  `release.yml` attaches it to each release. Ad-hoc signing is required to run at all on Apple Silicon.
- **No in-app updates on a Mac:** the update files (`latest.json`, `stable.json`) have no `darwin` entry on purpose,
  and a Mac's update check says to download the new version from the Releases page.
- **Apple Silicon only;** Intel Macs are untested. A universal binary (`--target universal-apple-darwin`) would cover
  both.
- **macOS 11 or newer:** `tauri.conf.json` sets the bundle's minimum system version to 11.0 (`LSMinimumSystemVersion`),
  matching what the program is built for, and its category to Utility.

## The app on a Mac

- **Menu-bar app:** no Dock icon (the *accessory* activation policy), except while the settings window is open.
- **Closing and quitting:** ⌘Q quits; ⌘W, the red button and the yellow button close the settings window to the menu bar
  (the app keeps running and the Dock icon goes away); the green button keeps its default. While the window is open the
  app has its own menu bar (`platform::install_app_menu`: the app menu with Hide, Hide Others and Quit (⌘Q); Edit, so
  copy and paste work in fields; Window with Close Window (⌘W)). Quit is the app's own item, because the default one
  asks the app to exit in a way it refuses, so that closing the last window leaves it in the menu bar
  (`RunEvent::ExitRequested` in `main.rs`). macOS sends no event when a window is minimized, so `window.rs` checks 400 ms
  after the window loses focus and closes a minimized one (`platform::minimize_closes_window`); the Minimize switch is
  hidden on a Mac. Opening the app again from Finder, Launchpad or Spotlight brings the window back
  (`platform::on_run_event`); a second start reuses the running app.
- **No ⌘, shortcut:** the app only has a menu bar while its window is open, so ⌘, could only bring forward a window
  that's already open, which looked broken. Settings open from the menu-bar icon or by opening the app again.
- **Window frame:** the real red, yellow and green buttons and rounded corners, lined up with the header.
- **Words:** the settings window uses Mac words (`ui/settings/system-words.js`): "Open at login", no Minimize switch, no
  Compatibility input method (only Windows has it), "⌘-click to add to the selection" and "delete" in the Keys tab, and the pause shortcut
  shows ⌘ ⌥ ⌃ ⇧. A Command shortcut is saved as "Super", which the shortcut library reads (tested).
- **Fonts:** Style → Text lists the Mac fonts. The saved default stays "Segoe UI" (changing it would need a settings
  migration) and shows as "System font (default)"; the overlay falls back to the system font, so keys look right even when
  OBS runs on another computer (`FONT_FALLBACKS` in `ui/overlay/overlay.js`).
- **Key labels follow the keyboard language** (`keyboard/macos_labels.rs`: the current layout through Carbon's Text
  Input Sources and `UCKeyTranslate`, no extra crate; the US and ABC layouts give nothing). It follows a layout switch
  live: macOS posts a system-wide notice, the app asks the layout again, and the preview, OBS and the settings window
  re-read their layouts. No timer runs.
- **Trackpad:** the key editor pans with a two-finger scroll, zooms with a pinch (or ⌘ + scroll), and Space + drag pans
  (`editor/view-gestures.js`, unit-tested).
- **Open at login** writes `~/Library/LaunchAgents/<app name>.plist` pointing at the app (and removes it when turned
  off). macOS lists it under the background items ("Allow in the Background"), not in "Open at Login". To check by hand:
  turn it on, `ls ~/Library/LaunchAgents | grep -i keystroke`, turn it off, look again. It points at the app's current
  place, so moving the app breaks it.
  Checked after a real log in: the app starts and stays in the menu bar without opening the settings window, which is intended (`open_window_at_launch` in `main.rs` skips the window for an `--autostart` start). On v2.0 (`31b43d8`) with the window closed: 0.0% CPU over 120 s, one idle wake-up per sample, 21 MB footprint; keys still light up after the Mac sleeps and wakes; ⌘W and ⌘Q work.
- **Debug tab:** memory and open files are measured; the capture method shows as "Standard (event tap)", and Input
  Monitoring and Secure Input get their own rows and self-test lines, on a Mac only.

## Building and testing on a Mac

- **Build:** `npx tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'` makes
  `src-tauri/target/release/bundle/macos/Keystroke Overlay.app` (about 6 MB; about 2 minutes on an M1 after the first
  build). The updater files are switched off because they need the release signing key. If the linker fails with a
  "malformed file" error, the Command Line Tools are older than their newest SDK: setting
  `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk` (or any older SDK there) works around it, and updating
  the Command Line Tools fixes it.
- **CI** builds and tests on macOS on every change (`other-systems` in `ci.yml`, and `mac-app.yml`). The code can be
  written and compiled without a Mac, but the permission prompt, real key capture and the first-launch experience can
  only be checked by a person on a real Mac.
- **Screenshot tests** (`npm run test:visual`) run on Windows only: there are no macOS baselines.
- `npm run dev:debug` finds the Mac data folder, so the development copy gets its own port.

## Checked on a real Mac

On an M1 MacBook Air with macOS 26, with the built app:

- Key capture with the listen-only tap, after Input Monitoring and a restart; a build started before the permission
  showed nothing until restarted.
- Every tab in the real window (Layout, Keys, Style, Animation, General, Debug): the frame and buttons line up with the
  header, keys show the Mac names (⌃ ⌘ ⌥, delete, return), General shows only Standard ("listen-only event tap").
- Closing and quitting by clicking the real buttons and menu items: each close keeps the process and hides the Dock icon;
  opening the app again brings the window back; Quit leaves no helper process.
- The update dot on the menu-bar icon and "Update available", with a local mock update file
  (`KEYOVERLAY_TEST_UPDATE_BASE`).
- Key labels on a French (AZERTY) layout: Q shows A, W shows Z, A shows Q, Z shows W, the key beside L shows M, the
  comma, period and slash keys show semicolon, colon and equals, the quote key shows Ù, and the digits stay. Switching
  layout with the window open updated the preview by itself.
- A pause shortcut with Command: ⌘P and ⌘↑ fired with another app in front; ⌘⌥P and ⌃⌥P could be set; ⌘⇧P didn't work
  (cause unknown; another app may use it).
- Trackpad pinch and two-finger scroll in the key editor (smooth after sliding animation was switched off during the
  scroll).
- Idle cost, from the processes' own CPU time, memory as resident size, the app plus its web view helpers:

  | State | CPU | Memory | Processes |
  |---|---|---|---|
  | Settings window open (preview running) | 0% over 45 s and 60 s | about 183 to 191 MB | 4 (the app, the web content, Apple's networking helper) |
  | Settings window closed, menu bar only | 0% over 60 s and 90 s | about 99 to 108 MB | 2 (the app about 83 MB, `com.apple.WebKit.Networking` about 16 MB) |

  So about 0% CPU at idle holds on a Mac, and closing the window ends its web view processes (about 80 MB less). The app
  process itself holds much more memory than on Windows (Tauri, the WebKit framework and the key tap).

## Not checked yet

- The Secure Input hint on screen (its logic is tested in code).
- Safari's Develop menu for the settings window (development builds only).
- Memory over hours.
- Intel Macs, and macOS versions other than 26; the exact Input Monitoring behavior for listen-only taps there.
- A run of the README's build steps on a clean Mac.

## Sources

- Tauri — [macOS code signing](https://v2.tauri.app/distribute/sign/macos/)
- Apple Developer Forums — [Input Monitoring permission list](https://developer.apple.com/forums/thread/828052), [why input monitoring permission is/isn't required](https://developer.apple.com/forums/thread/122492)
- [tauri-plugin-macos-input-monitor](https://github.com/yigitkonur/tauri-plugin-macos-input-monitor) (community plugin README: silent tap failure, restart after granting)
- Secure Event Input stalls taps system-wide: [Cursor report](https://forum.cursor.com/t/cursor-leaks-secure-event-input-breaks-all-system-wide-input-taps-until-quit-or-screen-lock/167585), [1Password community](https://www.1password.community/1password-at-work-58/secure-input-blocking-other-apps-event-taps-25015)
- Gatekeeper changes: [App permissions on macOS Sequoia](https://troz.net/post/2024/sequoia_app_permissions/), [Open unverified apps on Sequoia](https://iboysoft.com/tips/allow-apps-to-run-sequoia.html)
