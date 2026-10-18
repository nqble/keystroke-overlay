//! Developer tools behind the optional "Debug mode" (General → App → Debug mode).
//!
//! WHAT THIS IS
//!   Debug mode adds a "Debug" tab to the settings window (see ui/settings/debug.js). This file is its Rust half:
//!   a small in-memory event log, a snapshot of the app's health, and a few switches for testing.
//!
//! RULES (they keep the privacy promises in PRIVACY.md true)
//!   * The event log has two levels. `log()` records the few important events (the server, keyboard input, updates,
//!     errors) at all times, so a bug report has them even when Debug mode was turned on after the problem: the last
//!     100 lines. `detail()` records the everyday steps (tray clicks, the window opening) only while Debug mode is on:
//!     then the last 300 lines. Turning Debug mode off forgets the details and keeps the important lines.
//!   * The event log lives in memory only. It is never written to disk and never sent anywhere.
//!   * It records what the APP did ("server restarted", "layout changed"), never which keys were pressed.
//!   * The one tool that shows key presses, the key monitor, must be started by hand, stops by itself after 60 seconds,
//!     and only sends events to the settings window on this PC.
//!
//! HOW TO ADD A LOG LINE
//!   Anywhere in the Rust code:   crate::debug::log("server could not start");     (important: always kept)
//!                         or     crate::debug::detail(format!("layout set to {id}"));   (only while Debug mode is on)
//!   Use log() for what helps explain a problem (something started, failed or changed how the app works), detail() for
//!   the rest. It shows up in the Debug tab → Event log and in the bug report.
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

/// How many log lines are kept: important lines only while Debug mode is off, every line while it is on. Older lines
/// fall off the front. (docs/DEBUGGING.md and PRIVACY.md state the same numbers.)
const IMPORTANT_CAPACITY: usize = 100;
const LOG_CAPACITY: usize = 300;
/// A longer line is cut to this many characters.
const LINE_MAX: usize = 300;
/// The key monitor stops by itself after this long.
const MONITOR_MAX: Duration = Duration::from_secs(60);
/// How long the key monitor waits for a key before it checks that the Debug tab is still open.
const MONITOR_POLL: Duration = Duration::from_millis(400);

static ENABLED: AtomicBool = AtomicBool::new(false);
static STARTED: OnceLock<Instant> = OnceLock::new();
/// Each line: milliseconds since start, whether it is a Debug-mode detail, and the text.
static LOG: Mutex<VecDeque<(u64, bool, String)>> = Mutex::new(VecDeque::new());
/// The crash note from the last run, if it crashed (crash.rs), for the bug report.
static LAST_CRASH: Mutex<Option<String>> = Mutex::new(None);
/// When Debug mode was last turned on (milliseconds since start), for the bug report.
static DETAIL_SINCE: Mutex<Option<u64>> = Mutex::new(None);
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

/// Turn Debug mode's detail on or off. Turning it off forgets the details and keeps the latest important lines.
pub fn set_enabled(on: bool) {
    let was = ENABLED.swap(on, Ordering::Relaxed);
    if on && !was {
        *DETAIL_SINCE.lock().unwrap() = Some(uptime_ms());
        log("debug mode turned on");
    }
    if !on && was {
        *DETAIL_SINCE.lock().unwrap() = None;
        let mut lines = LOG.lock().unwrap();
        lines.retain(|(_, is_detail, _)| !is_detail);
        while lines.len() > IMPORTANT_CAPACITY {
            lines.pop_front();
        }
    }
}

/// Remember the last run's crash note for the Debug tab and the bug report.
pub fn set_last_crash(note: String) {
    *LAST_CRASH.lock().unwrap() = Some(note);
}

/// Record an important event: kept at all times (the last 100 while Debug mode is off).
pub fn log(what: impl AsRef<str>) {
    push(false, what.as_ref());
}

/// Record an everyday step: kept only while Debug mode is on.
pub fn detail(what: impl AsRef<str>) {
    if ENABLED.load(Ordering::Relaxed) {
        push(true, what.as_ref());
    }
}

fn push(is_detail: bool, text: &str) {
    let capacity = if ENABLED.load(Ordering::Relaxed) {
        LOG_CAPACITY
    } else {
        IMPORTANT_CAPACITY
    };
    let mut lines = LOG.lock().unwrap();
    while lines.len() >= capacity {
        lines.pop_front();
    }
    lines.push_back((uptime_ms(), is_detail, text.chars().take(LINE_MAX).collect()));
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
        "detailSinceMs": *DETAIL_SINCE.lock().unwrap(),
        "lastCrash": *LAST_CRASH.lock().unwrap(),   // null unless the last run crashed   // null: the log has only the important lines
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
    LOG.lock()
        .unwrap()
        .iter()
        .map(|(ms, _, text)| (*ms, text.clone()))
        .collect()
}

#[tauri::command]
pub fn debug_log_clear() {
    LOG.lock().unwrap().clear();
}

/// Is a fake update showing (Debug tab → Fake update available)? While it is, update checks answer with it instead of
/// asking GitHub, so a real "up to date" can't take the tray dot away in the middle of a test.
static FAKE_UPDATE: AtomicBool = AtomicBool::new(false);

/// The fake update's answer, while one is showing.
pub fn fake_update() -> Option<Value> {
    FAKE_UPDATE.load(Ordering::Relaxed).then(|| {
        json!({ "available": true, "version": "9.9.9", "current": env!("CARGO_PKG_VERSION"), "channel": "stable", "manual": false, "url": "",
                "notes": "**This is a fake update** made by Debug mode.\n\n- Nothing can be downloaded.\n- Use *Clear fake update* in the Debug tab to remove it." })
    })
}

/// Pretend an update is (or is no longer) available, so the update button, the tray dot and the tray entry can be tried
/// without publishing a release. It stays until cleared: update checks answer with it meanwhile. Nothing is downloaded;
/// "Update now" on a fake update says there is nothing to install.
#[tauri::command]
pub fn debug_simulate_update(app: AppHandle, on: bool) {
    log(format!("simulated update {}", if on { "ON" } else { "OFF" }));
    FAKE_UPDATE.store(on, Ordering::Relaxed);
    crate::tray::set_update_badge(&app, on);
    let result = fake_update()
        .unwrap_or_else(|| json!({ "available": false, "current": env!("CARGO_PKG_VERSION"), "channel": "stable" }));
    let _ = app.emit("update-result", result);
}

/// What the tray shows right now (tray::indicator_state), for the Debug tab and the tests.
#[tauri::command]
pub fn debug_tray_state(app: AppHandle) -> Value {
    crate::tray::indicator_state(&app)
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
    fn a_fake_update_answers_checks_until_it_is_cleared() {
        FAKE_UPDATE.store(false, Ordering::Relaxed);
        assert!(fake_update().is_none(), "no fake update unless one was asked for");
        FAKE_UPDATE.store(true, Ordering::Relaxed);
        let fake = fake_update().expect("a fake update while it is on");
        assert_eq!(fake["available"], true);
        assert_eq!(fake["version"], "9.9.9");
        FAKE_UPDATE.store(false, Ordering::Relaxed);
        assert!(fake_update().is_none(), "cleared again");
    }

    #[test]
    fn important_lines_are_always_kept_details_only_in_debug_mode_and_both_are_capped() {
        // One test on purpose: the log is a global, so separate parallel tests would trip over each other.
        set_enabled(false);
        debug_log_clear();
        detail("ignored: debug mode is off");
        log("server running");
        assert_eq!(
            debug_log().len(),
            1,
            "an important line is kept with Debug mode off, a detail is not"
        );
        for i in 0..(IMPORTANT_CAPACITY + 20) {
            log(format!("important {i}"));
        }
        assert_eq!(
            debug_log().len(),
            IMPORTANT_CAPACITY,
            "with Debug mode off, only the newest 100 are kept"
        );

        set_enabled(true);
        assert!(
            DETAIL_SINCE.lock().unwrap().is_some(),
            "the report can say since when details are recorded"
        );
        for i in 0..(LOG_CAPACITY + 50) {
            detail(format!("line {i}"));
        }
        let lines = debug_log();
        assert_eq!(lines.len(), LOG_CAPACITY);
        assert_eq!(lines.last().unwrap().1, format!("line {}", LOG_CAPACITY + 49));
        detail("x".repeat(1000));
        assert_eq!(
            debug_log().last().unwrap().1.chars().count(),
            LINE_MAX,
            "a long line is cut"
        );

        log("update check failed");
        set_enabled(false);
        let kept = debug_log();
        assert!(
            kept.iter()
                .all(|(_, text)| !text.starts_with("line ") && !text.starts_with('x')),
            "details are forgotten"
        );
        assert!(
            kept.iter().any(|(_, text)| text == "update check failed"),
            "important lines stay"
        );
        assert!(kept.len() <= IMPORTANT_CAPACITY);
        assert!(DETAIL_SINCE.lock().unwrap().is_none());
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
