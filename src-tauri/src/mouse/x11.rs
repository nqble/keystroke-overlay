//! Linux, X11 desktops: mouse buttons and the wheel with XInput2 raw button events (docs/proposals/mouse-input.md).
//!
//! The same way as the keyboard's X11 method (`keyboard/x11.rs`, whose connection and stop-by-wake-window this shares): a
//! second connection and thread, selecting raw button press and release events on the root window. Raw motion events are
//! never selected, so movement is not received at all and the thread sleeps while the mouse only moves. Raw button events
//! can carry valuators (movement deltas); nothing here reads them, and no pointer coordinate is read either.
//!
//! The raw event carries the physical button number: 1, 2 and 3 are left, middle and right, 4 to 7 the wheel (one press
//! per notch, also for smooth-scrolling mice, where X sends them as emulated buttons; only the press is used), 8 and 9
//! back and forward (`names::x11_button`).

use super::names;
use super::wheel::Throttle;
use crate::keyboard::x11::{connect, Handle};
use crate::keyboard::KeyEvent;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{sync_channel, Sender};
use std::sync::Arc;
use std::time::Instant;
use x11rb::connection::Connection;
use x11rb::protocol::xinput::XIEventMask;
use x11rb::protocol::Event;
use x11rb::rust_connection::RustConnection;

pub fn start(tx: Sender<KeyEvent>) -> Result<Handle, String> {
    let (connection, wake_window) = connect(XIEventMask::RAW_BUTTON_PRESS | XIEventMask::RAW_BUTTON_RELEASE)?;
    let connection = Arc::new(connection);
    let stopping = Arc::new(AtomicBool::new(false));
    let (ready_tx, ready_rx) = sync_channel::<()>(1);

    let thread_connection = connection.clone();
    let thread_stopping = stopping.clone();
    let join = std::thread::Builder::new()
        .name("mouse-x11".into())
        .spawn(move || {
            let _ = ready_tx.send(());
            capture(&thread_connection, &thread_stopping, &tx);
        })
        .map_err(|e| e.to_string())?;
    ready_rx
        .recv()
        .map_err(|_| "the X11 mouse thread stopped unexpectedly".to_string())?;
    Ok(Handle::new(connection, wake_window, stopping, join))
}

/// A wheel name (one notch, a press with no hold) as opposed to a button.
fn is_wheel(code: &str) -> bool {
    code.starts_with("Wheel")
}

/// The capture loop: turn raw button events into button and wheel names until asked to stop or the X server goes away.
fn capture(connection: &RustConnection, stopping: &AtomicBool, tx: &Sender<KeyEvent>) {
    let mut held: HashSet<&'static str> = HashSet::new();
    let mut throttle = Throttle::default();
    let started = Instant::now();
    while let Ok(event) = connection.wait_for_event() {
        if stopping.load(Ordering::Relaxed) {
            break;
        }
        let (button, down) = match event {
            Event::XinputRawButtonPress(press) => (press.detail, true),
            Event::XinputRawButtonRelease(release) => (release.detail, false),
            _ => continue,
        };
        let Some(code) = u8::try_from(button).ok().and_then(names::x11_button) else {
            continue;
        };
        if is_wheel(code) {
            // a notch is one short press, at most one per direction every MIN_TAP_MS; its release event is ignored
            let now_ms = started.elapsed().as_millis() as u64;
            if down && throttle.allow(code, now_ms) {
                let _ = tx.send(KeyEvent { down: true, code });
                let _ = tx.send(KeyEvent { down: false, code });
            }
            continue;
        }
        if down {
            held.insert(code);
        } else {
            held.remove(code);
        }
        let _ = tx.send(KeyEvent { down, code });
    }
    // Stopped (or the server went away): let go of any button still shown as down.
    for code in held {
        let _ = tx.send(KeyEvent { down: false, code });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn wheel_names_are_told_from_buttons() {
        for code in ["WheelUp", "WheelDown", "WheelLeft", "WheelRight"] {
            assert!(is_wheel(code), "{code}");
        }
        for code in ["MouseLeft", "MouseMiddle", "MouseRight", "MouseBack", "MouseForward"] {
            assert!(!is_wheel(code), "{code}");
        }
    }

    /// Needs an X display, so it is skipped by default. Run it with: xvfb-run cargo test -- --ignored
    #[test]
    #[ignore = "needs an X11 display (run under xvfb-run)"]
    fn starts_and_stops_promptly() {
        let (tx, _rx) = std::sync::mpsc::channel();
        let handle = start(tx).expect("capture should start on an X11 display");
        let started = Instant::now();
        handle.stop();
        assert!(
            started.elapsed() < Duration::from_secs(2),
            "stop must wake the capture thread"
        );
    }
}
