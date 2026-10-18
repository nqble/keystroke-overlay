# Debugging

Keystroke Overlay has a built-in **Debug mode** for anyone working on the code (and for collecting good bug reports).

## Turn it on

- **In the app:** General → App → **Debug mode (for developers)**. A **Debug** tab appears in the left menu. Turn the switch off and the tab disappears and the log's everyday details are forgotten (the important events stay; see below).
- **For development:** `npm run dev:debug` starts a separate development copy of the app with Debug mode already on and the browser inspector ready (see below). It needs Windows. It has its own settings folder (`%APPDATA%\com.keyoverlay.dev`) and its own port (7880), so it never clashes with an installed Keystroke Overlay.

## What the Debug tab has

| Tool | What it is for |
|---|---|
| **This app** | Version, uptime, memory, open handles, server and key-capture status, whether your settings are valid, whether the data folder is writable. Refreshes every 2 seconds. |
| **Self-test** | One click checks the server, the overlay page, key capture, your settings, the data folder and every layout. |
| **Event log** | What the app itself did. Always kept: the last 100 important events (server, keyboard input, updates, errors, layout changes). With Debug mode on, also everyday steps (tray clicks, the window opening): last 300 lines. In memory only. |
| **Key monitor** | Shows each key the app sees, with the milliseconds since the previous event. You must press Start; it stops by itself after 60 seconds. |
| **Settings (raw)** | The settings as the app holds them. Edit and Apply to try odd values; it shows which ones the app corrected (a quick way to test the settings sanitizer). |
| **Test helpers** | A fake update (button, orange tray dot and tray entry without a real release), the What's new popup, popups and toasts, restart server, reload window. |
| **Developer tools** | How to open the full browser inspector (elements, console, network) on the settings window. |
| **Bug report** | Copies one block of Markdown for a GitHub issue, or to paste into a Claude session (format 2, from v1.4.0). Top to bottom: a line for what happened, the problems the self-test found, the app's state as a table, the settings that differ from the defaults, the recent events as a timeline, then the same facts as one compact JSON block (`format`, `app`, `state`, `lastUpdate`, `selfTest`, `settingsDiff`, `logDetailSinceMs`, `log`), folded away on GitHub. The format is in `ui/settings/debug-report.js`; raise `BUG_REPORT_FORMAT` when a field is renamed or removed. |

## The browser inspector

The settings window is a web page, so you can inspect it like one:

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
2. In `ui/settings/debug.js`, add one object to the `SECTIONS` list:

```js
{
  id: 'my-tool', // a short name for tests (goes into data-card)
  title: 'My tool',
  build() {
    const out = el('div');
    every(out, 2000, async () => { out.textContent = JSON.stringify(await invoke('debug_info')); });   // refresh every 2 s
    return [note('What this shows.'), out];
  },
},
```

debug.js is an ES module, so import what you use at the top of the file (`helpers.js` for the small tools, `state.js` for the settings and layouts, `popups.js`, `messages.js`, `settings.js`).

Helpers you can use there: `el()`, `heading()`, `note()`, `button()`, `row()`, `toast()`, `call()`, `invoke()`, the `settings`, `layouts`, `showNotes()`, `resync()`, `render()`. The file's header comment lists them.

3. Add a check to `tests/e2e/suites/debug.mjs` and run `npm run test:e2e -- --suite debug`.

## Other things that speed up development

- `npm test` runs the Rust unit tests, the UI unit tests and the privacy check (about a minute).
- `npm run test:e2e -- --suite <name>` runs one end-to-end suite instead of everything (see `tests/README.md`).
- `npm run check:privacy` fails if network code, logging or file writes appear where the privacy promises forbid them.
