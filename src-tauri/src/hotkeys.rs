//! The global pause shortcut (setting `hotkeys`, General → Pause shortcut; docs/design/future-inputs.md, Global
//! hotkeys). Uses Tauri's global-shortcut plugin, which asks the operating system for that one key combination only:
//! no other key is seen through it, and nothing is registered while the setting is off or empty (the default).
//!
//! The shortcut does the same as the tray's Pause overlay (tray::toggle_pause_inner), so the tray and the overlay
//! always show the pause state.

use crate::settings;
use crate::state::AppState;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// The longest shortcut text accepted ("CommandOrControl+Shift+Alt+NumpadSubtract" fits). Must match
/// MAX_SHORTCUT_LENGTH in ui/settings/shortcut.js.
pub const MAX_SHORTCUT_LENGTH: usize = 48;

/// True for text that can be a shortcut: key names joined by "+" ("Ctrl+Shift+KeyP"), or empty for none.
pub fn is_shortcut_text(text: &str) -> bool {
    text.len() <= MAX_SHORTCUT_LENGTH && text.chars().all(|c| c.is_ascii_alphanumeric() || c == '+')
}

/// The shortcut the settings ask for, or None when the feature is off or no shortcut is set.
fn wanted(settings: &Value) -> Option<&str> {
    let hotkeys = &settings["hotkeys"];
    let pause = hotkeys["pause"].as_str().unwrap_or("");
    (hotkeys["enabled"].as_bool() == Some(true) && !pause.is_empty()).then_some(pause)
}

/// Register exactly the shortcut the settings ask for (none when off). Called at start-up and when the user changes it.
pub fn apply(app: &AppHandle, settings: &Value) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    shortcuts.unregister_all().map_err(|e| e.to_string())?;
    let Some(text) = wanted(settings) else {
        return Ok(());
    };
    let shortcut: Shortcut = text
        .parse()
        .map_err(|_| format!("“{text}” isn’t a shortcut this app knows."))?;
    shortcuts
        .on_shortcut(shortcut, |app, _, event| {
            if event.state() == ShortcutState::Pressed {
                crate::tray::toggle_pause_inner(app);
            }
        })
        .map_err(|_| format!("{text} is already used by another app. Choose another shortcut."))
}

/// Change the pause shortcut from the settings window. The old one stays when the new one can't be registered.
#[tauri::command]
pub fn set_pause_hotkey(app: AppHandle, enabled: bool, shortcut: String) -> Result<(), String> {
    if !is_shortcut_text(&shortcut) {
        return Err("That isn’t a shortcut this app knows.".into());
    }
    let st = app.state::<AppState>();
    let mut current_settings = st.shared.settings.write().unwrap();
    let mut next = current_settings.clone();
    next["hotkeys"] = json!({ "enabled": enabled, "pause": shortcut });
    if let Err(problem) = apply(&app, &next) {
        let _ = apply(&app, &current_settings);
        return Err(problem);
    }
    let _ = settings::save(&st.shared.paths.settings(), &next);
    *current_settings = next;
    crate::debug::log(format!(
        "pause shortcut {}",
        if wanted(&current_settings).is_some() {
            "set"
        } else {
            "off"
        }
    ));
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
        assert_eq!(wanted(&on), Some("Ctrl+Shift+KeyP"));
        assert_eq!(wanted(&off), None);
        assert_eq!(wanted(&empty), None);
        assert_eq!(wanted(&settings::defaults()), None, "off by default");
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
