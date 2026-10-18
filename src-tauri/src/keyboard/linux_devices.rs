//! Linux, Wayland desktops: keyboard capture by reading the keyboard devices in /dev/input (docs/LINUX-PORT.md).
//!
//! Wayland stops apps from seeing other apps' keys, and no portal offers "all keys", so the one way that works on every
//! Wayland desktop is reading the keyboards themselves. They are opened read-only and never grabbed, so every other app
//! still gets every key, unchanged. The files belong to the `input` group: until the person is in it, nothing can be
//! opened and the settings window explains how to join (ui/settings/access-notice.js). The X11 method (`x11.rs`) stays
//! the one used on X11 desktops, which needs no permission.
//!
//! One thread waits on every keyboard at once with poll(), so at idle it sleeps in the kernel and uses no CPU. To stop
//! it, the handle closes its end of a pipe the thread also waits on (a closed pipe wakes poll), so nothing is written. The event codes are the same evdev codes the
//! X11 method sees, so `linux_keys.rs` names them and filters key repeat.
//!
//! Keyboards plugged in after capture started are not picked up until it restarts (switching the method in General, or
//! restarting the app).
//!
//! Privacy: events are only turned into key names and sent down the same channel as every other method. Nothing about
//! them is written anywhere (PRIVACY.md).

use super::linux_keys::KeyFilter;
use super::KeyEvent;
use evdev::raw_stream::RawDevice;
use evdev::{EventType, KeyCode};
use std::io::{ErrorKind, PipeReader, PipeWriter};
use std::os::fd::{AsRawFd, RawFd};
use std::sync::mpsc::Sender;
use std::thread::JoinHandle;

/// Where the kernel lists input devices.
const INPUT_FOLDER: &str = "/dev/input";

/// evdev event values for a key: 1 is a press, 0 a release, 2 the keyboard's own repeat (ignored).
const KEY_RELEASED: i32 = 0;
const KEY_PRESSED: i32 = 1;

/// Shown in General when no keyboard could be opened for lack of permission. The settings window shows the fix.
pub const NO_PERMISSION: &str = "no permission to read the keyboards (the input group, see the notice above)";
const NO_KEYBOARD: &str = "no keyboard found in /dev/input";

/// poll() from the C library, which std does not wrap. It only reads and fills the array it is given.
#[repr(C)]
struct PollFd {
    fd: RawFd,
    events: i16,
    revents: i16,
}
const POLLIN: i16 = 0x1;
const WAIT_FOREVER: i32 = -1;
extern "C" {
    fn poll(fds: *mut PollFd, count: std::os::raw::c_ulong, timeout_ms: i32) -> i32;
}

/// True on a Wayland desktop. Both the display variable and the session type are checked, because some desktops set only one.
pub fn wayland_session() -> bool {
    is_wayland(
        std::env::var("WAYLAND_DISPLAY").ok().as_deref(),
        std::env::var("XDG_SESSION_TYPE").ok().as_deref(),
    )
}

fn is_wayland(wayland_display: Option<&str>, session_type: Option<&str>) -> bool {
    let has_display = wayland_display.is_some_and(|name| !name.is_empty());
    has_display || session_type == Some("wayland")
}

/// A device counts as a keyboard when it has letter keys and Space: this skips mice, power buttons and the like, which
/// also report keys.
fn is_keyboard(device: &RawDevice) -> bool {
    let Some(keys) = device.supported_keys() else {
        return false;
    };
    keys.contains(KeyCode::KEY_A) && keys.contains(KeyCode::KEY_Z) && keys.contains(KeyCode::KEY_SPACE)
}

/// The key change in one evdev event, as (evdev code, pressed), or None for everything else (sync, repeat, LEDs…).
fn key_change(event_type: EventType, code: u16, value: i32) -> Option<(u32, bool)> {
    if event_type != EventType::KEY {
        return None;
    }
    match value {
        KEY_PRESSED => Some((u32::from(code), true)),
        KEY_RELEASED => Some((u32::from(code), false)),
        _ => None,
    }
}

/// The keyboards that could be opened, and whether any device was refused for lack of permission.
struct Found {
    keyboards: Vec<RawDevice>,
    denied: bool,
}

fn find_keyboards() -> Found {
    let mut found = Found {
        keyboards: Vec::new(),
        denied: false,
    };
    let Ok(entries) = std::fs::read_dir(INPUT_FOLDER) else {
        return found;
    };
    for entry in entries.flatten() {
        let is_event_file = entry.file_name().to_string_lossy().starts_with("event");
        if !is_event_file {
            continue;
        }
        match open_read_only(&entry.path()) {
            Ok(device) if is_keyboard(&device) => found.keyboards.push(device),
            Ok(_) => {}
            Err(error) if error.kind() == ErrorKind::PermissionDenied => found.denied = true,
            Err(_) => {}
        }
    }
    found
}

/// Opens one device read-only. Not `RawDevice::open`, which opens it for writing too when it can: the app must never be
/// able to send anything to a keyboard (PRIVACY.md).
fn open_read_only(path: &std::path::Path) -> std::io::Result<RawDevice> {
    let file = std::fs::File::open(path)?;
    RawDevice::from_fd(file.into())
}

/// The error to show when no keyboard could be opened.
fn nothing_opened(denied: bool) -> &'static str {
    if denied {
        NO_PERMISSION
    } else {
        NO_KEYBOARD
    }
}

/// Whether at least one keyboard can be read now. The settings window asks this to decide on the input-group notice.
pub fn can_read_a_keyboard() -> bool {
    !find_keyboards().keyboards.is_empty()
}

pub struct Handle {
    /// Dropping it closes the pipe, which wakes the capture thread.
    wake: PipeWriter,
    join: JoinHandle<()>,
}

impl Handle {
    pub fn stop(self) {
        drop(self.wake);
        let _ = self.join.join();
    }
}

pub fn start(tx: Sender<KeyEvent>) -> Result<Handle, String> {
    let found = find_keyboards();
    if found.keyboards.is_empty() {
        return Err(nothing_opened(found.denied).to_string());
    }
    let (wake_reader, wake) = std::io::pipe().map_err(|e| e.to_string())?;
    let join = std::thread::Builder::new()
        .name("key-devices".into())
        .spawn(move || capture(found.keyboards, &wake_reader, &tx))
        .map_err(|e| e.to_string())?;
    Ok(Handle { wake, join })
}

/// The capture loop: wait until a keyboard has events or the wake pipe is closed, then pass on the key changes.
fn capture(mut keyboards: Vec<RawDevice>, wake: &PipeReader, tx: &Sender<KeyEvent>) {
    let mut filter = KeyFilter::default();
    loop {
        let ready = wait_for_events(&keyboards, wake);
        let Some(ready) = ready else {
            return; // asked to stop, or poll itself failed
        };
        // Read the ready keyboards; a keyboard that fails to read (unplugged) is dropped.
        let mut still_there = Vec::with_capacity(keyboards.len());
        for (mut keyboard, has_events) in keyboards.into_iter().zip(ready) {
            if has_events && !read_keys(&mut keyboard, &mut filter, tx) {
                continue;
            }
            still_there.push(keyboard);
        }
        keyboards = still_there;
    }
}

/// Blocks until something is ready. Returns which keyboards have events, or None when the wake pipe was closed.
fn wait_for_events(keyboards: &[RawDevice], wake: &PipeReader) -> Option<Vec<bool>> {
    let mut fds: Vec<PollFd> = keyboards
        .iter()
        .map(|keyboard| keyboard.as_raw_fd())
        .chain(std::iter::once(wake.as_raw_fd()))
        .map(|fd| PollFd {
            fd,
            events: POLLIN,
            revents: 0,
        })
        .collect();
    loop {
        // SAFETY: fds is a valid array of fds.len() entries for the whole call, and poll only writes their revents.
        let result = unsafe { poll(fds.as_mut_ptr(), fds.len() as std::os::raw::c_ulong, WAIT_FOREVER) };
        if result >= 0 {
            break;
        }
        if std::io::Error::last_os_error().kind() != ErrorKind::Interrupted {
            return None;
        }
    }
    let (wake_fd, keyboard_fds) = fds.split_last()?;
    if wake_fd.revents != 0 {
        return None;
    }
    Some(keyboard_fds.iter().map(|fd| fd.revents != 0).collect())
}

/// Reads the waiting events of one keyboard. False when the keyboard can no longer be read.
fn read_keys(keyboard: &mut RawDevice, filter: &mut KeyFilter, tx: &Sender<KeyEvent>) -> bool {
    let Ok(events) = keyboard.fetch_events() else {
        return false;
    };
    for event in events {
        let Some((code, down)) = key_change(event.event_type(), event.code(), event.value()) else {
            continue;
        };
        if let Some(key_event) = filter.handle(code, down) {
            let _ = tx.send(key_event);
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wayland_is_found_from_either_variable() {
        assert!(is_wayland(Some("wayland-0"), None));
        assert!(is_wayland(None, Some("wayland")));
        assert!(!is_wayland(None, Some("x11")));
        assert!(!is_wayland(Some(""), None));
        assert!(!is_wayland(None, None));
    }

    /// A recorded stream of typing "w": the kernel sends a scan code (MSC), the key, a sync, the keyboard's repeats, then the release.
    #[test]
    fn a_recorded_stream_becomes_one_press_and_one_release() {
        let recorded = [
            (EventType::MISC, 4, 0x11),
            (EventType::KEY, 17, KEY_PRESSED),
            (EventType::SYNCHRONIZATION, 0, 0),
            (EventType::KEY, 17, 2),
            (EventType::KEY, 17, 2),
            (EventType::MISC, 4, 0x11),
            (EventType::KEY, 17, KEY_RELEASED),
            (EventType::SYNCHRONIZATION, 0, 0),
        ];
        let mut filter = KeyFilter::default();
        let mut seen = Vec::new();
        for (event_type, code, value) in recorded {
            let Some((code, down)) = key_change(event_type, code, value) else {
                continue;
            };
            if let Some(event) = filter.handle(code, down) {
                seen.push((event.down, event.code));
            }
        }
        assert_eq!(seen, vec![(true, "KeyW"), (false, "KeyW")]);
    }

    #[test]
    fn the_error_says_when_permission_is_missing() {
        assert_eq!(nothing_opened(true), NO_PERMISSION);
        assert_eq!(nothing_opened(false), NO_KEYBOARD);
    }

    #[test]
    fn stops_promptly_while_waiting() {
        let (wake_reader, wake) = std::io::pipe().unwrap();
        let (tx, _rx) = std::sync::mpsc::channel();
        let join = std::thread::spawn(move || capture(Vec::new(), &wake_reader, &tx));
        drop(wake);
        join.join().unwrap();
    }
}
