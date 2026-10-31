//! Commands the settings window can call (`invoke('name')` in ui/settings/settings.js).
//! Grouped by what they do; register new ones in `main.rs` (`generate_handler!`).

pub mod actions; // tray-style quick actions: pause, switch layout, restart server
pub mod appearance; // settings window themes: the built-in theme files
pub mod assets; // fonts, style presets, opening data folders
pub mod keyboard_access; // macOS: Input Monitoring permission and Secure Input
pub mod layout_import; // a layout made from a keyboard file the user picks (KLE)
pub mod settings; // app state, saving settings, port, autostart, small utilities
pub mod updates; // update check/install, release notes, "What's new"
