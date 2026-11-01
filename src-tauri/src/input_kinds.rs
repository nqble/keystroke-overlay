//! Showing or hiding a whole input (keyboard, mouse or controller) on the overlay. The choice is saved per layout, as
//! `settings.layout.profiles[<id>].hiddenInputs` (docs/FILE-FORMATS.md), and changed from the settings window's eye
//! button (ui/settings/eye-button.js) or the tray's Show menu (tray.rs). Which input a key belongs to is decided by
//! the overlay (ui/overlay/input-kinds.js); this file keeps the list clean and does the tray's toggle.

use crate::settings;
use crate::state::{announce, sync_tray, AppState};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

/// The inputs, in the order the eye button and the tray show them. Keep in step with INPUT_KINDS in
/// ui/overlay/input-kinds.js.
pub const INPUT_KINDS: [&str; 3] = ["keyboard", "mouse", "controller"];

/// A saved `hiddenInputs` list cleaned: only input names, each once, in INPUT_KINDS order.
pub fn clean_hidden_inputs(raw: Option<&Value>) -> Vec<Value> {
    let saved = raw.and_then(Value::as_array);
    let listed = |kind: &str| saved.is_some_and(|list| list.iter().any(|entry| entry == kind));
    INPUT_KINDS
        .iter()
        .filter(|kind| listed(kind))
        .map(|kind| json!(kind))
        .collect()
}

/// Can this input be shown at all? The keyboard always; the mouse and the controller only while their input is on
/// (General → Inputs, `settings.inputs`), which the eye button shows by graying them out.
pub fn input_enabled(current: &Value, kind: &str) -> bool {
    match kind {
        "keyboard" => true,
        "mouse" => current["inputs"]["mouse"]["enabled"] == true,
        "controller" => current["inputs"]["gamepad"]["enabled"] == true,
        _ => false,
    }
}

/// Is this input shown on the selected layout?
pub fn input_shown(current: &Value, kind: &str) -> bool {
    let layout_id = current["layout"]["id"].as_str().unwrap_or_default();
    let hidden = &current["layout"]["profiles"][layout_id]["hiddenInputs"];
    !hidden
        .as_array()
        .is_some_and(|list| list.iter().any(|entry| entry == kind))
}

/// Shows the input if it is hidden on the selected layout, else hides it. A layout with no saved edits gets a profile.
pub fn toggle_input(current: &mut Value, kind: &str) {
    let layout_id = current["layout"]["id"].as_str().unwrap_or_default().to_string();
    let now_shown = !input_shown(current, kind);
    let profile = &mut current["layout"]["profiles"][layout_id.as_str()];
    if !profile.is_object() {
        *profile = json!({ "disabledKeys": [], "labels": {} });
    }
    let mut hidden: Vec<Value> = clean_hidden_inputs(profile.get("hiddenInputs"));
    hidden.retain(|entry| entry != kind);
    if !now_shown {
        hidden.push(json!(kind));
    }
    let cleaned = clean_hidden_inputs(Some(&Value::Array(hidden)));
    if cleaned.is_empty() {
        profile.as_object_mut().map(|fields| fields.remove("hiddenInputs"));
    } else {
        profile["hiddenInputs"] = Value::Array(cleaned);
    }
}

/// The tray's Show keyboard / mouse / controller: the same choice as the eye button, saved and sent to the overlays.
pub fn toggle_input_inner(app: &AppHandle, kind: &str) -> Result<(), String> {
    let st = app.state::<AppState>();
    {
        let mut current = st.shared.settings.write().unwrap();
        if !input_enabled(&current, kind) {
            return Ok(());
        }
        toggle_input(&mut current, kind);
        settings::save(&st.shared.paths.settings(), &current).map_err(|e| e.to_string())?;
    }
    crate::debug::detail(format!("{kind} shown or hidden from the tray"));
    announce(app);
    sync_tray(app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings_with(profile: Value) -> Value {
        json!({ "layout": { "id": "tkl", "profiles": { "tkl": profile } } })
    }

    #[test]
    fn only_input_names_are_kept_once_in_order() {
        let raw = json!(["mouse", "toaster", 5, "keyboard", "mouse"]);
        assert_eq!(clean_hidden_inputs(Some(&raw)), vec![json!("keyboard"), json!("mouse")]);
        assert!(clean_hidden_inputs(Some(&json!("keyboard"))).is_empty());
        assert!(clean_hidden_inputs(None).is_empty());
    }

    #[test]
    fn toggling_hides_then_shows_and_leaves_the_other_edits() {
        let mut current = settings_with(json!({ "disabledKeys": ["KeyQ"], "labels": { "Space": "Jump" } }));
        toggle_input(&mut current, "keyboard");
        assert!(!input_shown(&current, "keyboard"));
        assert_eq!(
            current["layout"]["profiles"]["tkl"]["hiddenInputs"],
            json!(["keyboard"])
        );
        assert_eq!(
            current["layout"]["profiles"]["tkl"]["disabledKeys"],
            json!(["KeyQ"]),
            "hidden keys untouched"
        );
        toggle_input(&mut current, "keyboard");
        assert!(input_shown(&current, "keyboard"));
        assert!(
            current["layout"]["profiles"]["tkl"].get("hiddenInputs").is_none(),
            "nothing left to save"
        );
    }

    #[test]
    fn a_layout_without_edits_gets_a_profile() {
        let mut current = json!({ "layout": { "id": "wasd", "profiles": {} } });
        toggle_input(&mut current, "keyboard");
        let profile = &current["layout"]["profiles"]["wasd"];
        assert_eq!(profile["hiddenInputs"], json!(["keyboard"]));
        assert_eq!(profile["disabledKeys"], json!([]));
    }

    #[test]
    fn saved_profiles_keep_clean_hidden_inputs_only_when_there_are_some() {
        let raw = json!({ "tkl": { "hiddenInputs": ["keyboard", "x"] }, "wasd": { "hiddenInputs": [] } });
        let cleaned = crate::sanitize::clean_profiles(&raw);
        assert_eq!(cleaned["tkl"]["hiddenInputs"], json!(["keyboard"]));
        assert!(cleaned["wasd"].get("hiddenInputs").is_none());
    }

    #[test]
    fn mouse_and_controller_need_their_input_on() {
        let off = json!({});
        assert!(input_enabled(&off, "keyboard"));
        assert!(!input_enabled(&off, "mouse") && !input_enabled(&off, "controller"));
        let on = json!({ "inputs": { "mouse": { "enabled": true }, "gamepad": { "enabled": true } } });
        assert!(input_enabled(&on, "mouse") && input_enabled(&on, "controller"));
        assert!(!input_enabled(&on, "toaster"));
    }
}
