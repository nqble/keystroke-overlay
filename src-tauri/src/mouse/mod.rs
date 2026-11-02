//! Mouse buttons and wheel (docs/proposals/mouse-input.md). So far two small pieces of plain logic, built and tested on
//! every system but not used by the app yet (the work order's step 2): `names` (every system's button and wheel codes
//! to our names) and `wheel` (turns into whole notches, and at most one press per direction per `MIN_TAP_MS`).
//!
//! Step 1 is a spike on Windows behind the cargo feature `mouse`, which is off by default, so a normal build has none of
//! its code. It is started and stopped by the Debug command `debug_mouse_trial` and counts what it sees, to measure the
//! cost (idle, a moving mouse, clicks, and the thread count over on/off cycles). The pointer's position and movement are
//! never read (docs/design/future-inputs.md, section 7).

#[allow(dead_code)] // the capture methods use it from step 4 on
mod names;
#[cfg(all(feature = "mouse", windows))]
mod rawinput;
#[allow(dead_code)] // the capture methods use it from step 4 on
mod wheel;

#[cfg(all(feature = "mouse", windows))]
use std::sync::atomic::{AtomicU64, Ordering};
#[cfg(all(feature = "mouse", windows))]
use std::sync::Mutex;

/// Mouse records Windows delivered (moves included) and the button or wheel events among them, since the last start.
#[cfg(all(feature = "mouse", windows))]
static RECORDS: AtomicU64 = AtomicU64::new(0);
#[cfg(all(feature = "mouse", windows))]
static EVENTS: AtomicU64 = AtomicU64::new(0);
#[cfg(all(feature = "mouse", windows))]
static RUNNING: Mutex<Option<rawinput::Handle>> = Mutex::new(None);

/// The Debug command: "start", "stop" or "stats". Every answer says whether the capture is running and the counts.
#[cfg(all(feature = "mouse", windows))]
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
