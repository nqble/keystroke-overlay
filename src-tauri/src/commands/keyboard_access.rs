//! Whether the app may read the keyboard: on macOS, Input Monitoring and whether macOS has switched key capture off for a
//! password field (Secure Input); on a Linux Wayland desktop, whether the person is in the `input` group. Elsewhere both
//! answers are "fine". The window shows a notice from these (ui/settings/keyboard-access.js); see docs/MAC-PORT.md and
//! docs/LINUX-PORT.md.

use crate::keyboard;
use crate::state::AppState;
use serde_json::{json, Value};
use tauri::{AppHandle, State};

/// The answer sent to the window, in get_state and get_keyboard_access. `applies` is false where the window must not show
/// a notice (Windows, Linux on X11: a capture problem there has its own message in General). `system` picks the wording.
/// `renewAfterUpdate`: see `needs_renewal`.
pub fn status(st: &AppState) -> Value {
    let access = keyboard::access();
    let capture_seen = st.shared.bus.has_seen_keys();
    remember_proof(st, capture_seen);
    let proven = st.shared.settings.read().unwrap()["general"]["keyboardProvenVersion"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let renew = needs_renewal(&Renewal {
        system: crate::platform::name(),
        allowed: access.allowed,
        capture_seen,
        proven_version: &proven,
        this_version: env!("CARGO_PKG_VERSION"),
        updated_this_launch: st.updated_this_launch,
    });
    json!({
        "applies": access.applies,
        "system": crate::platform::name(),
        "allowed": access.allowed,
        "secureInput": access.secure_input,
        "allowedAtStart": st.shared.bus.was_allowed_at_start(),
        "captureSeen": capture_seen,
        "renewAfterUpdate": renew,
    })
}

/// What `needs_renewal` looks at.
pub struct Renewal<'a> {
    pub system: &'a str,
    pub allowed: bool,
    pub capture_seen: bool,
    /// The version that last proved capture worked (`general.keyboardProvenVersion`, "" if none has yet).
    pub proven_version: &'a str,
    pub this_version: &'a str,
    /// The version changed since the last launch (the same test as "What's new").
    pub updated_this_launch: bool,
}

/// A Mac app signed ad hoc gets a new identity with every build, so after an update macOS keeps showing the keyboard
/// permission as on while it delivers no keys (docs/MAC-PORT.md, "The permission belongs to one exact build"). The
/// window then offers to renew it: on a Mac, while macOS says "allowed", no key has arrived yet in this launch, and this
/// is another version than the one that last proved capture worked (or, before any version has, the app was just updated).
pub fn needs_renewal(renewal: &Renewal) -> bool {
    if renewal.system != "macos" || !renewal.allowed || renewal.capture_seen {
        return false;
    }
    if renewal.proven_version.is_empty() {
        return renewal.updated_this_launch;
    }
    renewal.proven_version != renewal.this_version
}

/// Once a key has arrived, remember which version proved capture works: only the version number, never a key.
fn remember_proof(st: &AppState, capture_seen: bool) {
    let this_version = env!("CARGO_PKG_VERSION");
    if !capture_seen || st.shared.settings.read().unwrap()["general"]["keyboardProvenVersion"] == this_version {
        return;
    }
    let mut current = st.shared.settings.write().unwrap();
    current["general"]["keyboardProvenVersion"] = json!(this_version);
    let _ = crate::settings::save(&st.shared.paths.settings(), &current);
}

/// Asked again whenever the window gets focus, so coming back from System Settings shows the new answer at once.
#[tauri::command]
pub fn get_keyboard_access(st: State<AppState>) -> Value {
    status(&st)
}

/// The "Renew keyboard access" button after a Mac update: clear the old, stale permission entry, then ask again (the
/// person switches the app on, then restarts it). Nothing to do on other systems.
#[tauri::command]
pub fn renew_keyboard_access(app: AppHandle) {
    crate::platform::reset_keyboard_permission(&app.config().identifier);
    keyboard::request_access();
}

/// The "Allow keyboard access" button: macOS's own prompt, and the System Settings page to tick the app in. Linux has
/// no prompt to open: its notice gives the command to run instead.
#[tauri::command]
pub fn request_keyboard_access() {
    keyboard::request_access();
}

/// macOS only starts delivering keys to an app that was already running after the app is restarted.
#[tauri::command]
pub fn restart_app(app: AppHandle) {
    crate::platform::restart_app(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn after(proven_version: &str, updated_this_launch: bool) -> Renewal<'_> {
        Renewal {
            system: "macos",
            allowed: true,
            capture_seen: false,
            proven_version,
            this_version: "2.2.0",
            updated_this_launch,
        }
    }

    #[test]
    fn a_mac_update_without_keys_asks_to_renew() {
        assert!(
            needs_renewal(&after("2.1.0", false)),
            "another version proved capture: this build is new"
        );
        assert!(
            needs_renewal(&after("", true)),
            "updated from a version that did not remember"
        );
    }

    #[test]
    fn nothing_to_renew_otherwise() {
        assert!(
            !needs_renewal(&after("2.2.0", false)),
            "this very version already captured keys"
        );
        assert!(
            !needs_renewal(&after("", false)),
            "a first install: the usual Allow notice handles it"
        );
        assert!(
            !needs_renewal(&Renewal {
                capture_seen: true,
                ..after("2.1.0", true)
            }),
            "keys arrive: it works"
        );
        assert!(
            !needs_renewal(&Renewal {
                allowed: false,
                ..after("2.1.0", true)
            }),
            "not allowed: the Allow notice"
        );
        assert!(!needs_renewal(&Renewal {
            system: "windows",
            ..after("2.1.0", true)
        }));
    }
}
