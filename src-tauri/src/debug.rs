//! Developer tools behind the optional "Debug mode" (General → App → Debug mode).
//!
//! WHAT THIS IS
//!   Debug mode adds a "Debug" tab to the settings window (see ui/settings/debug.js). This file is its Rust half:
//!   a small in-memory event log, a snapshot of the app's health, and a few switches for testing.
//!
//! RULES (they keep the privacy promises in PRIVACY.md true)
//!   * Everything is OFF until the user turns Debug mode on. While it is off, `log()` does nothing at all.
//!   * The event log lives in memory only (last 300 lines). It is never written to disk and never sent anywhere.
//!   * It records what the APP did ("server restarted", "layout changed"), never which keys were pressed.
//!   * The one tool that shows key presses, the key monitor, must be started by hand, stops by itself after 60 seconds,
//!     and only sends events to the settings window on this PC.
//!
//! HOW TO ADD A LOG LINE
//!   Anywhere in the Rust code:   crate::debug::log("what just happened");     or    crate::debug::log(format!("port is
//!   {port}"));
//!   It shows up in the Debug tab → Event log (and in the bug report that tab can copy).
//!
//! HOW TO ADD A NEW DEBUG TOOL
//!   Add a #[tauri::command] here, list it in `generate_handler!` in main.rs, then add a section in
//!   ui/settings/debug.js.
//!   See docs/DEBUGGING.md for the full walk-through.

use crate::settings;
use crate::state::AppState;
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

/// How many log lines are kept. Older lines fall off the front.
const LOG_CAPACITY: usize = 300;
/// The key monitor stops by itself after this long.
const MONITOR_MAX: Duration = Duration::from_secs(60);
/// How long the key monitor waits for a key before it checks that the Debug tab is still open.
const MONITOR_POLL: Duration = Duration::from_millis(400);

static ENABLED: AtomicBool = AtomicBool::new(false);
static STARTED: OnceLock<Instant> = OnceLock::new();
static LOG: Mutex<VecDeque<(u64, String)>> = Mutex::new(VecDeque::new());
/// Each time the key monitor is started or stopped this number goes up; a running monitor that sees a newer number
/// quits.
static MONITOR: AtomicU64 = AtomicU64::new(0);

fn uptime_ms() -> u64 {
    STARTED.get_or_init(Instant::now).elapsed().as_millis() as u64
}

/// Called once at start-up with the saved setting.
pub fn init(enabled: bool) {
    STARTED.get_or_init(Instant::now);
    set_enabled(enabled);
}

/// Turn the event log on or off. Turning it off also forgets everything that was recorded.
pub fn set_enabled(on: bool) {
    let was = ENABLED.swap(on, Ordering::Relaxed);
    if on && !was {
        log("debug mode turned on");
    }
    if !on && was {
        LOG.lock().unwrap().clear();
    }
}

/// Record one line in the event log (does nothing unless Debug mode is on).
pub fn log(what: impl AsRef<str>) {
    if !ENABLED.load(Ordering::Relaxed) {
        return;
    }
    let mut log = LOG.lock().unwrap();
    if log.len() >= LOG_CAPACITY {
        log.pop_front();
    }
    log.push_back((uptime_ms(), what.as_ref().chars().take(300).collect()));
}

/// Can the app create and delete a file in its data folder? (Settings can only be saved if it can.)
fn folder_writable(dir: &std::path::Path) -> bool {
    let probe = dir.join(".write-test");
    let ok = std::fs::write(&probe, b"ok").is_ok();
    let _ = std::fs::remove_file(&probe);
    ok
}

// ---------------------------------------------------------------- commands used by the Debug tab

/// A snapshot of the app's health, shown at the top of the Debug tab.
#[tauri::command]
pub fn debug_info(st: State<AppState>) -> Value {
    let current = st.shared.settings.read().unwrap().clone();
    let (memory_mb, handles) = crate::platform::process_stats();
    json!({
        "version": env!("CARGO_PKG_VERSION"),
        "build": if cfg!(debug_assertions) { "debug (development build)" } else { "release" },
        "os": format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
        "uptimeSecs": uptime_ms() / 1000,
        "memoryMb": (memory_mb * 10.0).round() / 10.0,
        "handles": handles,
        "dataDir": st.shared.paths.root.to_string_lossy(),
        "settingsFile": st.shared.paths.settings().to_string_lossy(),
        "dataWritable": folder_writable(&st.shared.paths.root),
        "settingsValid": settings::migrate(current.clone()) == current,   // would the sanitizer change anything?
        "port": current["general"]["port"],
        "serverError": *st.server_error.lock().unwrap(),
        "inputActive": st.shared.bus.method().id(),
        "inputError": st.shared.bus.error(),
        "logLines": LOG.lock().unwrap().len(),
    })
}

/// The default settings, so the Debug tab's developer report can list only what the user changed.
#[tauri::command]
pub fn debug_defaults() -> Value {
    settings::defaults()
}

/// The event log as [[milliseconds since start, text], ...], oldest first.
#[tauri::command]
pub fn debug_log() -> Vec<(u64, String)> {
    LOG.lock().unwrap().iter().cloned().collect()
}

#[tauri::command]
pub fn debug_log_clear() {
    LOG.lock().unwrap().clear();
}

/// Pretend an update is (or is no longer) available, so the update button, the tray dot and the tray entry can be tried
/// without publishing a release. Nothing is downloaded; "Update now" on a fake update just says "Already up to date".
#[tauri::command]
pub fn debug_simulate_update(app: AppHandle, on: bool) {
    log(format!("simulated update {}", if on { "ON" } else { "OFF" }));
    crate::tray::set_update_badge(&app, on);
    let result = if on {
        json!({ "available": true, "version": "9.9.9", "current": env!("CARGO_PKG_VERSION"), "channel": "stable", "manual": false, "url": "",
                "notes": "**This is a fake update** made by Debug mode.\n\n- Nothing can be downloaded.\n- Use *Clear fake update* in the Debug tab to remove it." })
    } else {
        json!({ "available": false, "current": env!("CARGO_PKG_VERSION"), "channel": "stable" })
    };
    let _ = app.emit("update-result", result);
}

/// Start or stop the key monitor: while on, every key event is also sent to the settings window as a "debug-key" event
/// ({ k, down, ms }). It stops after 60 seconds, when asked, or when the window is gone. Nothing is stored.
#[tauri::command]
pub fn debug_key_monitor(app: AppHandle, st: State<AppState>, on: bool) {
    let monitor_id = MONITOR.fetch_add(1, Ordering::SeqCst) + 1;
    if !on {
        return;
    }
    let mut rx = st.shared.bus.tx.subscribe();
    let begun = Instant::now();
    tauri::async_runtime::spawn(async move {
        while MONITOR.load(Ordering::SeqCst) == monitor_id
            && begun.elapsed() < MONITOR_MAX
            && app.get_webview_window("settings").is_some()
        {
            use tokio::sync::broadcast::error::RecvError;
            match tokio::time::timeout(MONITOR_POLL, rx.recv()).await {
                Ok(Ok(event)) => {
                    let _ = app.emit(
                        "debug-key",
                        json!({ "k": event.code, "down": event.down, "ms": begun.elapsed().as_millis() as u64 }),
                    );
                }
                Ok(Err(RecvError::Lagged(_))) => {}
                Ok(Err(RecvError::Closed)) => break,
                Err(_) => {} // nothing arrived; loop around and re-check whether we should stop
            }
        }
        let _ = app.emit("debug-key-stopped", ());
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_is_silent_until_enabled_keeps_only_the_newest_lines_and_forgets_when_turned_off() {
        // One test on purpose: the log is a global, so separate parallel tests would trip over each other.
        set_enabled(false);
        log("ignored: debug mode is off");
        assert!(debug_log().is_empty());

        set_enabled(true);
        for i in 0..(LOG_CAPACITY + 50) {
            log(format!("line {i}"));
        }
        let lines = debug_log();
        assert_eq!(lines.len(), LOG_CAPACITY);
        assert_eq!(lines.last().unwrap().1, format!("line {}", LOG_CAPACITY + 49));
        assert!(
            !lines.iter().any(|(_, t)| t == "line 0"),
            "the oldest lines should have been dropped"
        );
        log("x".repeat(1000));
        assert_eq!(
            debug_log().last().unwrap().1.chars().count(),
            300,
            "a long line is cut to 300 characters"
        );

        set_enabled(false);
        assert!(debug_log().is_empty(), "turning debug mode off forgets the log");
        log("ignored again");
        assert!(debug_log().is_empty());
    }

    #[test]
    fn folder_check_notices_a_missing_or_usable_folder() {
        let dir = std::env::temp_dir().join(format!("ko-debug-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(folder_writable(&dir));
        assert!(!folder_writable(&dir.join("does-not-exist")));
        let _ = std::fs::remove_dir_all(dir);
    }
}
