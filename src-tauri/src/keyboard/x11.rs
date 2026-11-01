//! Linux, X11 desktops: keyboard capture with XInput2 raw key events (docs/LINUX-PORT.md).
//!
//! Raw events are what the keyboard itself sends, delivered to a listener on the root window whichever app has focus.
//! Listening this way never grabs, delays or changes key presses for other apps, and needs no special permission. On a
//! Wayland desktop it only sees keys typed into X11 apps, so Wayland gets its own method later.
//!
//! The capture thread blocks waiting for X events. To stop it, the handle sends a message to a tiny invisible window the
//! thread owns, which wakes it up so it can exit.

use super::linux_keys::{KeyFilter, X11_KEYCODE_OFFSET};
use super::KeyEvent;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{sync_channel, Sender};
use std::sync::Arc;
use std::thread::JoinHandle;
use x11rb::connection::Connection;
use x11rb::protocol::xinput::{self, ConnectionExt as _, XIEventMask};
use x11rb::protocol::xproto::{
    ClientMessageEvent, ConnectionExt as _, CreateWindowAux, EventMask, Window, WindowClass,
};
use x11rb::protocol::Event;
use x11rb::rust_connection::RustConnection;
use x11rb::COPY_FROM_PARENT;

/// XInput2's id for "every master device": one event per key press, not one per physical keyboard and master.
const ALL_MASTER_DEVICES: u16 = 1;

/// Raw events from master devices are only delivered to clients that ask for XInput 2.1 or newer (every X server from
/// the last ten years has it).
const XINPUT_MAJOR: u16 = 2;
const XINPUT_MINOR: u16 = 1;

pub struct Handle {
    connection: Arc<RustConnection>,
    wake_window: Window,
    stopping: Arc<AtomicBool>,
    join: JoinHandle<()>,
}

impl Handle {
    pub fn stop(self) {
        self.stopping.store(true, Ordering::Relaxed);
        // Wake the capture thread, which is waiting for the next X event.
        let wake = ClientMessageEvent::new(32, self.wake_window, 0u32, [0u32; 5]);
        let _ = self
            .connection
            .send_event(false, self.wake_window, EventMask::NO_EVENT, wake);
        let _ = self.connection.flush();
        let _ = self.join.join();
    }
}

/// Connect to the X server named by `DISPLAY` and ask for raw key events from every keyboard. Returns the window the
/// capture thread can be woken through.
fn connect() -> Result<(RustConnection, Window), String> {
    let (connection, screen_index) =
        RustConnection::connect(None).map_err(|e| format!("can't connect to the X11 display: {e}"))?;
    let version_request = connection
        .xinput_xi_query_version(XINPUT_MAJOR, XINPUT_MINOR)
        .map_err(|e| e.to_string())?;
    let version = version_request
        .reply()
        .map_err(|_| "the X server has no XInput2 support".to_string())?;
    if (version.major_version, version.minor_version) < (XINPUT_MAJOR, XINPUT_MINOR) {
        return Err("the X server's XInput is older than version 2.1".into());
    }
    let root = connection.setup().roots[screen_index].root;
    let mask = xinput::EventMask {
        deviceid: ALL_MASTER_DEVICES,
        mask: vec![XIEventMask::RAW_KEY_PRESS | XIEventMask::RAW_KEY_RELEASE],
    };
    connection
        .xinput_xi_select_events(root, &[mask])
        .map_err(|e| e.to_string())?;

    // An invisible window that never appears on screen: only used to wake the capture thread when stopping.
    let wake_window = connection.generate_id().map_err(|e| e.to_string())?;
    connection
        .create_window(
            COPY_FROM_PARENT as u8,
            wake_window,
            root,
            0,
            0,
            1,
            1,
            0,
            WindowClass::INPUT_ONLY,
            COPY_FROM_PARENT,
            &CreateWindowAux::new(),
        )
        .map_err(|e| e.to_string())?;
    connection.flush().map_err(|e| e.to_string())?;
    Ok((connection, wake_window))
}

pub fn start(tx: Sender<KeyEvent>) -> Result<Handle, String> {
    let (connection, wake_window) = connect()?;
    let connection = Arc::new(connection);
    let stopping = Arc::new(AtomicBool::new(false));
    let (ready_tx, ready_rx) = sync_channel::<()>(1);

    let thread_connection = connection.clone();
    let thread_stopping = stopping.clone();
    let join = std::thread::Builder::new()
        .name("key-x11".into())
        .spawn(move || {
            let _ = ready_tx.send(());
            capture(&thread_connection, &thread_stopping, &tx);
        })
        .map_err(|e| e.to_string())?;
    ready_rx
        .recv()
        .map_err(|_| "the X11 capture thread stopped unexpectedly".to_string())?;
    Ok(Handle {
        connection,
        wake_window,
        stopping,
        join,
    })
}

/// The capture loop: turn raw key events into clean key events until asked to stop or the X server goes away.
fn capture(connection: &RustConnection, stopping: &AtomicBool, tx: &Sender<KeyEvent>) {
    let mut filter = KeyFilter::default();
    while let Ok(event) = connection.wait_for_event() {
        if stopping.load(Ordering::Relaxed) {
            return;
        }
        // sourceid is the physical keyboard, so two keyboards holding one key make one press (linux_keys.rs)
        let (keycode, down, keyboard) = match event {
            Event::XinputRawKeyPress(press) => (press.detail, true, press.sourceid),
            Event::XinputRawKeyRelease(release) => (release.detail, false, release.sourceid),
            _ => continue,
        };
        let evdev_code = keycode.saturating_sub(X11_KEYCODE_OFFSET);
        if let Some(key_event) = filter.handle(usize::from(keyboard), evdev_code, down) {
            let _ = tx.send(key_event);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

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
