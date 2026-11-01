//! Mouse buttons and wheel (docs/proposals/mouse-input.md). Step 1 only: a spike on Windows behind the cargo feature
//! `mouse`, which is off by default, so a normal build has none of this code. It is started and stopped by the Debug
//! command `debug_mouse_trial` and counts what it sees, to measure the cost (idle, a moving mouse, clicks, and the
//! thread count over on/off cycles) before the real feature is built. The pointer's position and movement are never
//! read (docs/design/future-inputs.md, section 7).

mod names;
#[cfg(windows)]
mod rawinput;

#[cfg(windows)]
use std::sync::atomic::{AtomicU64, Ordering};
#[cfg(windows)]
use std::sync::Mutex;

/// Mouse records Windows delivered (moves included) and the button or wheel events among them, since the last start.
#[cfg(windows)]
static RECORDS: AtomicU64 = AtomicU64::new(0);
#[cfg(windows)]
static EVENTS: AtomicU64 = AtomicU64::new(0);
#[cfg(windows)]
static RUNNING: Mutex<Option<rawinput::Handle>> = Mutex::new(None);

/// The Debug command: "start", "stop" or "stats". Every answer says whether the capture is running and the counts.
#[cfg(windows)]
pub fn trial(
    action: &str,
    tx: std::sync::mpsc::Sender<crate::keyboard::KeyEvent>,
) -> Result<serde_json::Value, String> {
    let mut running = RUNNING.lock().unwrap();
    match action {
        "start" if running.is_none() => {
            RECORDS.store(0, Ordering::Relaxed);
            EVENTS.store(0, Ordering::Relaxed);
            *running = Some(rawinput::start(tx)?);
        }
        "stop" => {
            if let Some(handle) = running.take() {
                handle.stop();
            }
        }
        "start" | "stats" => {}
        other => return Err(format!("unknown action: {other}")),
    }
    Ok(serde_json::json!({
        "running": running.is_some(),
        "records": RECORDS.load(Ordering::Relaxed),
        "events": EVENTS.load(Ordering::Relaxed),
    }))
}
