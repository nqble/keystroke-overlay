//! macOS only matters here: whether the app may read the keyboard (Input Monitoring) and whether macOS has switched key
//! capture off for a password field (Secure Input). Elsewhere both answers are "fine". The window shows a notice from
//! these (ui/settings/keyboard-access.js); see docs/MAC-PORT.md.

use crate::keyboard;
use serde_json::{json, Value};
use tauri::AppHandle;

/// The answer sent to the window, in get_state and get_keyboard_access. `applies` is false off macOS, where the window
/// must not show a notice (a capture problem on Windows or Linux has its own message in General).
pub fn status() -> Value {
    let access = keyboard::access();
    json!({
        "applies": crate::platform::name() == "macos",
        "allowed": access.allowed,
        "secureInput": access.secure_input,
    })
}

/// Asked again whenever the window gets focus, so coming back from System Settings shows the new answer at once.
#[tauri::command]
pub fn get_keyboard_access() -> Value {
    status()
}

/// The "Allow keyboard access" button: macOS's own prompt, and the System Settings page to tick the app in.
#[tauri::command]
pub fn request_keyboard_access() {
    keyboard::request_access();
}

/// macOS only starts delivering keys to an app that was already running after the app is restarted.
#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}
