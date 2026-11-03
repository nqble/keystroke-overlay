//! Mouse buttons and wheel (docs/proposals/mouse-input.md): which buttons are held and which way the wheel turned, never
//! where the pointer is or how it moves (docs/design/future-inputs.md, section 7). Off by default (`inputs.mouse.enabled`);
//! while off nothing is captured and no thread runs.
//!
//! - `names`: every system's button and wheel codes -> our names. Plain logic, tested everywhere.
//! - `wheel`: wheel turns -> whole notches, and at most one press per direction per `MIN_TAP_MS`. Plain logic.
//! - `rawinput`: the Windows method (Raw Input on a message-only window, nothing in the input path).
//!
//! `start` picks the method for this system and sends the names into the same event stream as the keyboard (the `Sender`
//! the keyboard's capture methods use), so the dispatcher, the held keys and Pause work the same. The Bus starts and
//! stops it (`keyboard::Bus::set_mouse`) and the command `set_mouse_input` (commands/settings.rs) turns it on and off.

#[allow(dead_code)] // the Linux and macOS methods use the rest of it (steps 9 and 10 of the plan)
mod names;
#[cfg(windows)]
mod rawinput;
#[allow(dead_code)] // the Linux and macOS methods use the rest of it (steps 9 and 10 of the plan)
mod wheel;

use crate::keyboard::KeyEvent;
use std::sync::mpsc::Sender;

/// A running capture. `stop` ends its thread and lets go of everything it registered.
#[cfg(windows)]
pub use rawinput::Handle;
#[cfg(not(windows))]
pub struct Handle;
#[cfg(not(windows))]
impl Handle {
    pub fn stop(self) {}
}

/// Starts the mouse capture for this system, sending button and wheel names into `tx`. A system without a method yet
/// says so, so the settings window can show it and the setting stays off.
#[cfg(windows)]
pub fn start(tx: Sender<KeyEvent>) -> Result<Handle, String> {
    rawinput::start(tx)
}
#[cfg(not(windows))]
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

    #[cfg(not(windows))]
    #[test]
    fn a_system_without_a_method_says_so() {
        let (tx, _rx) = std::sync::mpsc::channel();
        assert!(start(tx).is_err());
    }
}
