//! The global shortcuts (setting `hotkeys`; docs/design/future-inputs.md, Global hotkeys): General → Pause shortcut and
//! General → Open settings shortcut. Uses Tauri's global-shortcut plugin, which asks the operating system for those key
//! combinations only: no other key is seen through it, and nothing is registered while they are off or empty (the
//! default).
//!
//! The pause shortcut does the same as the tray's Pause overlay (tray::toggle_pause_inner), so the tray and the overlay
//! always show the pause state; the open settings shortcut does the same as the tray's Open settings.
//!
//! The plugin is loaded only once a shortcut is wanted, not at start-up: on Linux (X11) it starts a thread that checks for
//! events 20 times a second, which would break the "about 0% CPU at idle" promise for everyone who never sets one. Once
//! loaded it stays until the app quits (Tauri can't unload a plugin), so turning the shortcut off takes the wake-ups
//! away at the next start.

use crate::settings;
use crate::state::AppState;
use serde_json::{json, Value};
use tauri::Wry;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcut, GlobalShortcutExt, Shortcut, ShortcutState};

/// The longest shortcut text accepted ("CommandOrControl+Shift+Alt+NumpadSubtract" fits). Must match
/// MAX_SHORTCUT_LENGTH in ui/settings/shortcut.js.
pub const MAX_SHORTCUT_LENGTH: usize = 48;

/// True for text that can be a shortcut: key names joined by "+" ("Ctrl+Shift+KeyP"), or empty for none.
pub fn is_shortcut_text(text: &str) -> bool {
    text.len() <= MAX_SHORTCUT_LENGTH && text.chars().all(|c| c.is_ascii_alphanumeric() || c == '+')
}

/// What a shortcut does.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Action {
    Pause,
    OpenSettings,
}

/// The shortcuts the settings ask for, each with what it does: the pause shortcut when it is on and set, the open
/// settings shortcut when it is set (empty is off).
fn wanted(settings: &Value) -> Vec<(&str, Action)> {
    let hotkeys = &settings["hotkeys"];
    let pause = hotkeys["pause"].as_str().unwrap_or("");
    let open_settings = hotkeys["openSettings"].as_str().unwrap_or("");
    let mut shortcuts = Vec::new();
    if hotkeys["enabled"].as_bool() == Some(true) && !pause.is_empty() {
        shortcuts.push((pause, Action::Pause));
    }
    if !open_settings.is_empty() {
        shortcuts.push((open_settings, Action::OpenSettings));
    }
    shortcuts
}

/// True when two actions ask for the same key combination (one of them would never work).
fn uses_the_same_keys_twice(shortcuts: &[(&str, Action)]) -> bool {
    shortcuts
        .iter()
        .enumerate()
        .any(|(index, (text, _))| shortcuts[index + 1..].iter().any(|(other, _)| other == text))
}

/// The pause shortcut, when it is on and set (for the event log).
fn pause_wanted(settings: &Value) -> bool {
    wanted(settings).iter().any(|&(_, action)| action == Action::Pause)
}

/// Whether the plugin must be loaded now: only when a shortcut is wanted and it isn't loaded yet.
fn must_load_plugin(loaded: bool, shortcut_wanted: bool) -> bool {
    shortcut_wanted && !loaded
}

/// Register exactly the shortcuts the settings ask for (none when off). Called at start-up and when the user changes one.
pub fn apply(app: &AppHandle, settings: &Value) -> Result<(), String> {
    let shortcuts_wanted = wanted(settings);
    if uses_the_same_keys_twice(&shortcuts_wanted) {
        return Err("The pause and open settings shortcuts can't be the same. Choose another.".into());
    }
    let loaded = app.try_state::<GlobalShortcut<Wry>>().is_some();
    if must_load_plugin(loaded, !shortcuts_wanted.is_empty()) {
        app.plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .map_err(|e| e.to_string())?;
    } else if !loaded {
        return Ok(()); // no shortcut, and nothing was ever registered
    }
    app.global_shortcut().unregister_all().map_err(|e| e.to_string())?;
    for (text, action) in shortcuts_wanted {
        register(app, text, action)?;
    }
    Ok(())
}

/// Register one shortcut and what it does.
fn register(app: &AppHandle, text: &str, action: Action) -> Result<(), String> {
    let shortcut: Shortcut = text
        .parse()
        .map_err(|_| format!("“{text}” isn’t a shortcut this app knows."))?;
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            match action {
                Action::Pause => {
                    crate::tray::toggle_pause_inner(app);
                }
                Action::OpenSettings => crate::window::open_settings_async(app),
            }
        })
        .map_err(|_| format!("{text} is already used by another app. Choose another shortcut."))
}

/// Saves `next` as the settings if its shortcuts can be registered; otherwise the old ones stay registered.
fn change_shortcuts(app: &AppHandle, change: impl FnOnce(&mut Value)) -> Result<(), String> {
    let st = app.state::<AppState>();
    let mut current_settings = st.shared.settings.write().unwrap();
    let mut next = current_settings.clone();
    change(&mut next["hotkeys"]);
    if let Err(problem) = apply(app, &next) {
        let _ = apply(app, &current_settings);
        return Err(problem);
    }
    let _ = settings::save(&st.shared.paths.settings(), &next);
    *current_settings = next;
    Ok(())
}

/// Change the pause shortcut from the settings window. The old one stays when the new one can't be registered.
#[tauri::command]
pub fn set_pause_hotkey(app: AppHandle, enabled: bool, shortcut: String) -> Result<(), String> {
    if !is_shortcut_text(&shortcut) {
        return Err("That isn’t a shortcut this app knows.".into());
    }
    change_shortcuts(&app, |hotkeys| {
        hotkeys["enabled"] = json!(enabled);
        hotkeys["pause"] = json!(shortcut);
    })?;
    let now_set = pause_wanted(&app.state::<AppState>().shared.settings.read().unwrap());
    crate::debug::log(format!("pause shortcut {}", if now_set { "set" } else { "off" }));
    Ok(())
}

/// Change the open settings shortcut from the settings window ("" turns it off). The old one stays when the new one
/// can't be registered.
#[tauri::command]
pub fn set_open_settings_hotkey(app: AppHandle, shortcut: String) -> Result<(), String> {
    if !is_shortcut_text(&shortcut) {
        return Err("That isn’t a shortcut this app knows.".into());
    }
    let off = shortcut.is_empty();
    change_shortcuts(&app, |hotkeys| hotkeys["openSettings"] = json!(shortcut))?;
    crate::debug::log(format!("open settings shortcut {}", if off { "off" } else { "set" }));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_an_enabled_non_empty_shortcut_is_wanted() {
        let on = json!({ "hotkeys": { "enabled": true, "pause": "Ctrl+Shift+KeyP" } });
        let off = json!({ "hotkeys": { "enabled": false, "pause": "Ctrl+Shift+KeyP" } });
        let empty = json!({ "hotkeys": { "enabled": true, "pause": "" } });
        assert_eq!(wanted(&on), vec![("Ctrl+Shift+KeyP", Action::Pause)]);
        assert!(wanted(&off).is_empty());
        assert!(wanted(&empty).is_empty());
        assert!(wanted(&settings::defaults()).is_empty(), "off by default");
    }

    #[test]
    fn the_same_keys_cant_do_two_things() {
        let same = [
            ("Ctrl+Alt+KeyP", Action::Pause),
            ("Ctrl+Alt+KeyP", Action::OpenSettings),
        ];
        let different = [
            ("Ctrl+Alt+KeyP", Action::Pause),
            ("Ctrl+Alt+Comma", Action::OpenSettings),
        ];
        assert!(uses_the_same_keys_twice(&same));
        assert!(!uses_the_same_keys_twice(&different));
        assert!(!uses_the_same_keys_twice(&[]));
    }

    #[test]
    fn the_open_settings_shortcut_is_wanted_whenever_it_is_set() {
        let both =
            json!({ "hotkeys": { "enabled": true, "pause": "Ctrl+Shift+KeyP", "openSettings": "Ctrl+Alt+Comma" } });
        assert_eq!(
            wanted(&both),
            vec![
                ("Ctrl+Shift+KeyP", Action::Pause),
                ("Ctrl+Alt+Comma", Action::OpenSettings)
            ]
        );
        let only_open = json!({ "hotkeys": { "enabled": false, "pause": "", "openSettings": "Super+Alt+Comma" } });
        assert_eq!(wanted(&only_open), vec![("Super+Alt+Comma", Action::OpenSettings)]);
        assert!(!pause_wanted(&only_open));
        assert!("Ctrl+Alt+Comma".parse::<Shortcut>().is_ok() && "Super+Alt+Comma".parse::<Shortcut>().is_ok());
    }

    #[test]
    fn the_plugin_loads_only_when_a_shortcut_is_wanted() {
        assert!(
            !must_load_plugin(false, false),
            "no shortcut: no plugin, so no idle thread on Linux"
        );
        assert!(must_load_plugin(false, true));
        assert!(!must_load_plugin(true, true), "loaded once");
        assert!(!must_load_plugin(true, false));
    }

    #[test]
    fn shortcut_text_is_key_names_and_plus_signs_only() {
        assert!(is_shortcut_text("Ctrl+Shift+KeyP"));
        assert!(is_shortcut_text(""));
        assert!(!is_shortcut_text("Ctrl+<script>"));
        assert!(!is_shortcut_text(&"A".repeat(MAX_SHORTCUT_LENGTH + 1)));
    }

    /// The settings window saves Command on a Mac as "Super" (the browser calls the key meta). The library must read it
    /// (as Command on a Mac, the Windows key elsewhere), or a shortcut set with Command could never be registered.
    #[test]
    fn a_shortcut_with_the_command_key_saved_as_super_parses() {
        for text in ["Super+KeyP", "Shift+Super+KeyP", "Ctrl+Alt+Super+Digit2"] {
            assert!(text.parse::<Shortcut>().is_ok(), "{text}");
        }
    }

    #[test]
    fn the_settings_windows_shortcut_names_parse() {
        for text in ["Ctrl+Shift+KeyP", "Alt+F9", "Ctrl+Alt+Digit1", "Shift+Pause"] {
            assert!(text.parse::<Shortcut>().is_ok(), "{text}");
        }
    }
}
