//! The pieces the two Linux device readers share (`keyboard/linux_devices.rs` and `mouse/linux_devices.rs`): where the
//! kernel lists input devices, opening a device file read-only, and waiting on many devices and a wake pipe at once with
//! poll(). Nothing here knows about keys or mice, and the input-device library (evdev) is not used here: each reader
//! turns the file into a device itself (tools/check-privacy.mjs allows evdev only in the two `linux_devices.rs` files).

use std::io::{ErrorKind, PipeReader};
use std::os::fd::{AsRawFd, RawFd};
use std::path::{Path, PathBuf};

/// Where the kernel lists input devices.
const INPUT_FOLDER: &str = "/dev/input";

/// The kernel's sign that it dropped some of a device's events because they came too fast (`SYN_DROPPED`, linux/input.h).
pub const SYN_DROPPED: u16 = 3;

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

/// The device files the kernel lists (`/dev/input/event*`); empty when the folder can't be read.
pub fn event_files() -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(INPUT_FOLDER) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|entry| entry.file_name().to_string_lossy().starts_with("event"))
        .map(|entry| entry.path())
        .collect()
}

/// Opens one device file for reading only. The app must never be able to send anything to a keyboard or a mouse
/// (PRIVACY.md), which is why this is `File::open` and not evdev's own `open` (that opens for writing too when it can).
pub fn open_read_only(path: &Path) -> std::io::Result<std::fs::File> {
    std::fs::File::open(path)
}

/// Is this error "no permission" (the `input` group is missing)?
pub fn is_denied(error: &std::io::Error) -> bool {
    error.kind() == ErrorKind::PermissionDenied
}

/// Blocks until one of `devices` has something to read, or the wake pipe was closed. Returns which devices are ready,
/// or None when the pipe was closed (asked to stop) or poll itself failed.
pub fn wait_for_events(devices: &[RawFd], wake: &PipeReader) -> Option<Vec<bool>> {
    let mut fds: Vec<PollFd> = devices
        .iter()
        .copied()
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
    let (wake_fd, device_fds) = fds.split_last()?;
    if wake_fd.revents != 0 {
        return None;
    }
    Some(device_fds.iter().map(|fd| fd.revents != 0).collect())
}
