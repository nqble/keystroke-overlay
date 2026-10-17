//! Key labels that follow the user's keyboard language (setting `style.keyLabels`, Style → Text → Key labels). On a
//! French AZERTY keyboard the key in the Q spot types "A", so its label should say "A". The layout files are written
//! for the US English keyboard; when the user's keyboard is another one, the layouts are shown with its letters and
//! punctuation instead (the digit row keeps its digits, see keyboard/keymap.rs TYPING_KEYS). A user's own label for a
//! key always wins, because it is applied on top of these by the overlay and the key editor.
//!
//! What each key types is asked from Windows once, at start-up (platform::keyboard_labels). Nothing about what the
//! user types is read.

use crate::server;
use crate::settings::Paths;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;

static KEYBOARD: OnceLock<HashMap<&'static str, String>> = OnceLock::new();

/// Ask the operating system what the user's keyboard prints (once, at start-up).
pub fn init() {
    KEYBOARD.get_or_init(crate::platform::keyboard_labels);
}

/// The label for one character a key types: upper case, as on a keycap. None for anything that isn't a visible
/// character (a control code or a space), so that key keeps its layout's label.
#[cfg_attr(not(windows), allow(dead_code))] // used by platform::keyboard_labels on Windows, and by the tests
pub fn label_for(utf16: u16) -> Option<String> {
    let typed = char::from_u32(u32::from(utf16))?;
    if typed.is_control() || typed.is_whitespace() {
        return None;
    }
    Some(typed.to_uppercase().collect())
}

/// Put the keyboard's own labels on every layout key that has one.
pub fn apply(layouts: &mut [Value], labels: &HashMap<&'static str, String>) {
    for key in layouts
        .iter_mut()
        .filter_map(|layout| layout["keys"].as_array_mut())
        .flatten()
    {
        if let Some(label) = key["code"].as_str().and_then(|code| labels.get(code)) {
            key["label"] = Value::String(label.clone());
        }
    }
}

/// The layouts as the overlay and the settings window show them: with the keyboard's own labels, unless the user chose
/// the layout files' labels (`style.keyLabels` = "layout").
pub fn layouts_to_show(paths: &Paths, settings: &Value) -> Vec<Value> {
    let mut layouts = server::layouts(paths);
    if settings["style"]["keyLabels"].as_str() != Some("layout") {
        apply(&mut layouts, KEYBOARD.get_or_init(crate::platform::keyboard_labels));
    }
    layouts
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_label_is_the_visible_character_in_upper_case() {
        assert_eq!(label_for('a' as u16), Some("A".into()));
        assert_eq!(label_for('ü' as u16), Some("Ü".into()));
        assert_eq!(label_for(';' as u16), Some(";".into()));
        assert_eq!(label_for(' ' as u16), None);
        assert_eq!(label_for(0x1B), None, "a control code keeps the layout's label");
    }

    #[test]
    fn the_keyboards_labels_replace_only_the_keys_it_names() {
        let mut layouts = vec![json!({ "id": "full", "keys": [
            { "code": "KeyQ", "label": "Q" },
            { "code": "Semicolon", "label": ";" },
            { "code": "ShiftLeft", "label": "Shift" },
        ] })];
        let azerty = HashMap::from([("KeyQ", "A".to_string()), ("Semicolon", "M".to_string())]);
        apply(&mut layouts, &azerty);
        let labels: Vec<_> = layouts[0]["keys"]
            .as_array()
            .unwrap()
            .iter()
            .map(|key| key["label"].clone())
            .collect();
        assert_eq!(labels, vec![json!("A"), json!("M"), json!("Shift")]);
    }
}
