//! Mouse buttons and wheel (docs/proposals/mouse-input.md): which buttons are held and which way the wheel turned, never
//! where the pointer is or how it moves (docs/design/future-inputs.md, section 7). Off by default (`inputs.mouse.enabled`);
//! while off nothing is captured and no thread runs.
//!
//! - `names`: every system's button and wheel codes -> our names. Plain logic, tested everywhere.
//! - `wheel`: wheel turns -> whole notches, and at most one press per direction per `MIN_TAP_MS`. Plain logic.
//! - `rawinput`: the Windows method (Raw Input on a message-only window, nothing in the input path).
//! - `x11` and `linux_devices`: the Linux methods (XInput2 raw buttons on X11; the mice in /dev/input on Wayland).
//!
//! `start` picks the method for this system and sends the names into the same event stream as the keyboard (the `Sender`
//! the keyboard's capture methods use), so the dispatcher, the held keys and Pause work the same. The Bus starts and
//! stops it (`keyboard::Bus::set_mouse`) and the command `set_mouse_input` (commands/settings.rs) turns it on and off.

#[cfg(target_os = "linux")]
mod linux_devices;
#[allow(dead_code)] // the macOS method uses the rest of it (step 10 of the plan)
mod names;
#[cfg(windows)]
mod rawinput;
#[allow(dead_code)] // the macOS method uses the rest of it (step 10 of the plan)
mod wheel;
#[cfg(target_os = "linux")]
mod x11;

use crate::keyboard::KeyEvent;
use std::sync::mpsc::Sender;

/// A running capture. `stop` ends its thread and lets go of everything it registered.
#[cfg(windows)]
pub use rawinput::Handle;
/// X11 reads raw button events, Wayland the mice themselves.
#[cfg(target_os = "linux")]
pub enum Handle {
    X11(crate::keyboard::x11::Handle),
    Devices(linux_devices::Handle),
}
#[cfg(target_os = "linux")]
impl Handle {
    pub fn stop(self) {
        match self {
            Self::X11(handle) => handle.stop(),
            Self::Devices(handle) => handle.stop(),
        }
    }
}
#[cfg(not(any(windows, target_os = "linux")))]
pub struct Handle;
#[cfg(not(any(windows, target_os = "linux")))]
impl Handle {
    pub fn stop(self) {}
}

/// Starts the mouse capture for this system, sending button and wheel names into `tx`. A system without a method yet
/// says so, so the settings window can show it and the setting stays off.
#[cfg(windows)]
pub fn start(tx: Sender<KeyEvent>) -> Result<Handle, String> {
    rawinput::start(tx)
}
#[cfg(target_os = "linux")]
pub fn start(tx: Sender<KeyEvent>) -> Result<Handle, String> {
    if crate::keyboard::wayland() {
        linux_devices::start(tx).map(Handle::Devices)
    } else {
        x11::start(tx).map(Handle::X11)
    }
}
#[cfg(not(any(windows, target_os = "linux")))]
pub fn start(_tx: Sender<KeyEvent>) -> Result<Handle, String> {
    Err("Mouse buttons aren't available on this system yet.".into())
}

/// Is this name one of the mouse's (a button or a wheel direction)? The Bus tells them from keys by it.
pub fn is_mouse_name(code: &str) -> bool {
    code.starts_with("Mouse") || code.starts_with("Wheel")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mouse_names_are_told_from_keys() {
        for name in [
            "MouseLeft",
            "MouseRight",
            "MouseMiddle",
            "MouseBack",
            "MouseForward",
            "WheelUp",
            "WheelDown",
            "WheelLeft",
            "WheelRight",
        ] {
            assert!(is_mouse_name(name), "{name}");
        }
        for name in ["KeyW", "Space", "MetaLeft", "NumpadEnter", "ArrowLeft", "F5"] {
            assert!(!is_mouse_name(name), "{name}");
        }
    }

    #[cfg(not(any(windows, target_os = "linux")))]
    #[test]
    fn a_system_without_a_method_says_so() {
        let (tx, _rx) = std::sync::mpsc::channel();
        assert!(start(tx).is_err());
    }
}
