# Debugging

Keystroke Overlay has a built-in **Debug mode** for anyone working on the code (and for collecting good bug reports).

## Turn it on

- **In the app:** General → Advanced → **Debug mode (for developers)**. A **Debug** tab appears in the left menu. Turn the switch off and the tab disappears and the log's everyday details are forgotten (the important events stay; see below).
- **For development:** `npm run dev:debug` starts a separate development copy of the app with Debug mode already on and the browser inspector ready (see below). It works on Windows, macOS and Linux. It has its own settings folder (`com.keyoverlay.dev` in the system's app-data folder: `%APPDATA%` on Windows, `~/Library/Application Support` on a Mac, `~/.local/share` on Linux) and its own port (7880), so it never clashes with an installed Keystroke Overlay. On a Mac the inspector is Safari's Develop menu instead of edge://inspect.

## What the Debug tab has

| Tool | What it is for |
|---|---|
| **This app** | Version, uptime, memory, open handles, server and key-capture status, whether your settings are valid, whether the data folder is writable. Refreshes every 2 seconds. |
| **Self-test** | One click checks the server, the overlay page, key capture, your settings, the data folder and every layout. |
| **Event log** | What the app itself did. Always kept: the last 100 important events (server, keyboard input, updates, errors, layout changes). With Debug mode on, also everyday steps (tray clicks, the window opening): last 300 lines. In memory only. |
| **Key monitor** | Shows each key the app sees, with the milliseconds since the previous event. You must press Start; it stops by itself after 60 seconds. |
| **Settings (raw)** | The settings as the app holds them. Edit and Apply to try odd values; it shows which ones the app corrected (a quick way to test the settings sanitizer). |
| **Test helpers** | A fake update (button, orange tray dot and tray entry without a real release; it stays until cleared, and update checks answer with it meanwhile), a picture of the tray icon exactly as the tray has it now (with the first menu entry and the tooltip, so the update dot can be checked on any system), the What's new popup, popups and toasts, restart server, reload window. |
| **Developer tools** | How to open the full browser inspector (elements, console, network) on the settings window. |
| **Bug report** | Copies one block of Markdown for a GitHub issue, or to paste into a Claude session (format 2, from v1.4.0). Top to bottom: a line for what happened, the problems the self-test found, the app's state as a table, the settings that differ from the defaults, the recent events as a timeline, then the same facts as one compact JSON block (`format`, `app`, `state`, `lastUpdate`, `lastCrash`, `selfTest`, `settingsDiff`, `logDetailSinceMs`, `log`), folded away on GitHub. The format is in `ui/settings/debug-report.js`; raise `BUG_REPORT_FORMAT` when a field is renamed or removed. |

## The browser inspector

The settings window is a web page, so you can inspect it like one. Its own browser shortcuts (F12, Ctrl+Shift+I, print, reload, zoom) are switched off, so use the steps below:

1. Quit Keystroke Overlay.
2. In a Command Prompt run `set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, then start the app from that same window (`npm run dev:debug` does this for you).
3. In Microsoft Edge open `edge://inspect`, add `localhost:9222` under "Configure…", and click **inspect**.

In the inspector's console, the object **`ko`** has shortcuts: `ko.info()`, `ko.log()`, `ko.state()`, `ko.settings()`, `ko.layouts()`, `ko.goto('style')`, and `ko.invoke('command', { args })` to call any Rust command.

## Privacy rules (these are kept by design)

- The Debug tools are **off** until Debug mode is switched on. The event log keeps only the last 100 important events
  while it is off (`debug::log()`); everyday steps (`debug::detail()`) are recorded only while it is on.
- The log is in memory only (never on disk, never sent anywhere) and records what the **app** did, never which keys were pressed. A test checks this.
- **Keyboard-hook watch:** Windows can remove the keyboard hook without telling the app (for example when the PC is
  overloaded). While an overlay page is connected, the hook thread checks every 30 s; if the PC is in use but the hook
  has heard nothing for over a minute, it installs the hook again and the event log says so. With no overlay connected,
  nothing runs. It only compares times; it never records keys.
- If the app crashes, `crash.rs` saves one line (version, place in the code, thread, minutes since start; never the
  message or a key) to `crash-note.txt` in the data folder. The next start puts it in the event log and the bug
  report's problems, then deletes it.
- The Key monitor is the only tool that shows key presses. It must be started by hand, stops after 60 seconds, and only talks to the settings window on this PC.
- The bug report contains no key presses and no private link key, and your user name is removed from paths (from v1.4.0
  in its Windows, Linux and macOS forms; v1.3.0 removes the usual Windows form).

## Adding to it

### A log line (one line of Rust)

```rust
crate::debug::log("what just happened");            // or  crate::debug::log(format!("port is {port}"));
```

### A new debug tool

1. If it needs data from the app, add a `#[tauri::command]` in `src-tauri/src/debug.rs` and list it in `generate_handler!` in `src-tauri/src/main.rs`.
2. Add a file in `ui/settings/debug/` (one per tool) that exports it, and add its name to `SECTIONS` in
   `ui/settings/debug/index.js`:

```js
import { invoke } from '../helpers.js';
import { html, useState } from '../html.js';
import { Facts, Hint, useEvery } from './shared.js';

function MyTool() {
  const [info, setInfo] = useState(null);
  useEvery(2000, async () => setInfo(await invoke('debug_info'))); // refresh every 2 s, only while the tab is open
  return html`<${Hint} text="What this shows." />
    <${Facts} rows=${info ? [['Version', info.version]] : []} />`;
}

export const myTool = { id: 'my-tool', title: 'My tool', Body: MyTool }; // id goes into data-card for the tests
```

Each section is a small Preact component (`html` from `../html.js`, like the other tabs). Import what you use at the
top: `../helpers.js` for `invoke()`, `call()` and `toast()`, `../state.js` for the settings and layouts, `./shared.js`
for the Debug tab's blocks (`Button`, `Hint`, `Facts`, `Check`, `LogLine`), `useEvery()` and its wording, and
`./checks.js` for the self-test; the other sections show the pattern. `ui/settings/debug/index.js`'s header comment has
the steps.

3. Add a check to `tests/e2e/suites/debug.mjs` and run `npm run test:e2e -- --suite debug`.

## Other things that speed up development

- `npm test` runs the Rust unit tests, the UI unit tests, the privacy check and the every-system check (about a minute).
- `npm run test:e2e -- --suite <name>` runs one end-to-end suite instead of everything (see `tests/README.md`).
- `npm run check:privacy` fails if network code, logging or file writes appear where the privacy promises forbid them.

## Without the app: the UI sandbox

`npm run ui-sandbox` opens the real settings window in any browser, with `tools/sandbox/fake-app.js` standing in for the
app (made-up answers, nothing saved). Every hard-to-reach screen has an address, so people, screenshot tests and Claude
sessions can open it directly:

| Address | Shows |
|---|---|
| `?state=live` (default) / `off` | OBS connected / not connected |
| `?state=paused` / `paused-no-obs` | paused, with and without OBS |
| `?state=port-in-use` | the server could not start |
| `?state=first-run` | the first run setup screen of a new install |
| `?state=mac-allow`, `mac-restart`, `mac-secure` | the macOS keyboard access notice: not allowed yet, allowed but restart needed, Secure Input on |
| `?state=update` / `whats-new` / `whats-new-long` | the update button and popup / the What's new popup / with notes long enough to scroll |
| `?tab=debug` | Debug mode on, Debug tab open (any tab name works) |

In the browser console, `__sandbox.emit('overlays-changed', 0)` sends an app message, and `__sandbox.copied` holds the
last text a Copy button copied. A copy of the default settings lives in `tools/sandbox/default-settings.json`; a Rust
test fails if it drifts from `defaults()` in `settings.rs`.

**The building blocks on their own:** `/__sandbox__/blocks.html` shows every shared block (`ui/settings/blocks.js`) with
real state, so hover, press, keyboard focus, on and off and selected can all be checked by eye or in a screenshot.

