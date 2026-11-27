//! A layout's choices for its drawn devices (docs/design/future-inputs.md §2), kept with the layout's other edits in
//! `settings.layout.profiles[id]`:
//! - `deviceDrawings`: which drawing a device block shows, e.g. `{ "Mouse": "mouse-gaming" }`, so a built-in layout,
//!   whose file can't be changed, can still show another shape;
//! - `deviceKeys`: the key each extra button lights up with, e.g. `{ "side3": "F13" }`. An extra button is a part of a
//!   drawing with a `data-slot`: a button the system doesn't report as a mouse button, which the mouse's software sends
//!   as a key instead.
//!
//! sanitize.rs calls `add_device_choices` while cleaning a profile; the overlay (ui/overlay/devices.js) and the Keys
//! tab (ui/settings/editor/device-drawing.js) read the result.

use serde_json::{Map, Value};

/// The most extra buttons one layout may assign (a drawing has far fewer; this only stops a hand-edited file).
const MAX_DEVICE_KEYS: usize = 32;
/// The longest slot name (`side3`, `right1`, `top2`).
const MAX_SLOT_LENGTH: usize = 16;

/// A slot name is lower-case letters and digits, as the drawings write them.
fn is_slot(slot: &str) -> bool {
    !slot.is_empty()
        && slot.len() <= MAX_SLOT_LENGTH
        && slot.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
}

/// `deviceDrawings`, cleaned: only device blocks (Mouse, Controller) and only drawing names that can name a file in
/// ui/overlay/devices/ (the same rule as a layout file's `device` field).
fn clean_drawings(raw: Option<&Value>) -> Map<String, Value> {
    let mut drawings = Map::new();
    for (code, raw_drawing) in raw.and_then(Value::as_object).into_iter().flatten() {
        if let Some(drawing) = crate::sanitize::clean_device(code, raw_drawing) {
            drawings.insert(code.clone(), Value::String(drawing));
        }
    }
    drawings
}

/// `deviceKeys`, cleaned: slot names and key codes of the plain kind only, at most MAX_DEVICE_KEYS of them.
fn clean_keys(raw: Option<&Value>) -> Map<String, Value> {
    let mut keys = Map::new();
    for (slot, raw_code) in raw.and_then(Value::as_object).into_iter().flatten() {
        if keys.len() == MAX_DEVICE_KEYS {
            break;
        }
        let Some(code) = raw_code.as_str().filter(|code| crate::sanitize::is_key_code(code)) else {
            continue;
        };
        if is_slot(slot) {
            keys.insert(slot.clone(), Value::String(code.to_string()));
        }
    }
    keys
}

/// Adds a profile's cleaned `deviceDrawings` and `deviceKeys` to the cleaned profile, each only when it has something
/// in it, so profiles without devices stay as they were.
pub(crate) fn add_device_choices(cleaned: &mut Map<String, Value>, profile: &Value) {
    let drawings = clean_drawings(profile.get("deviceDrawings"));
    if !drawings.is_empty() {
        cleaned.insert("deviceDrawings".into(), Value::Object(drawings));
    }
    let keys = clean_keys(profile.get("deviceKeys"));
    if !keys.is_empty() {
        cleaned.insert("deviceKeys".into(), Value::Object(keys));
    }
}

#[cfg(test)]
mod tests {
    use super::add_device_choices;
    use serde_json::{json, Map, Value};

    fn cleaned(profile: Value) -> Value {
        let mut out = Map::new();
        add_device_choices(&mut out, &profile);
        Value::Object(out)
    }

    #[test]
    fn keeps_good_choices() {
        let profile = json!({
            "deviceDrawings": { "Mouse": "mouse-gaming" },
            "deviceKeys": { "side3": "F13", "top1": "KeyQ" }
        });
        assert_eq!(cleaned(profile.clone()), profile);
    }

    #[test]
    fn drops_what_could_name_another_file_or_break_the_page() {
        let profile = json!({
            "deviceDrawings": { "Mouse": "../layouts/full", "KeyA": "mouse", "Controller": "Big Pad" },
            "deviceKeys": { "side3": "<b>", "Side 4": "F14", "side5": 13, "": "F15" }
        });
        assert_eq!(cleaned(profile), json!({}));
    }

    #[test]
    fn writes_nothing_for_a_profile_without_devices() {
        assert_eq!(cleaned(json!({ "labels": {} })), json!({}));
    }

    #[test]
    fn keeps_at_most_the_limit() {
        let many: Map<String, Value> = (0..100).map(|n| (format!("slot{n}"), json!("F13"))).collect();
        let result = cleaned(json!({ "deviceKeys": many }));
        assert_eq!(
            result["deviceKeys"].as_object().map(Map::len),
            Some(super::MAX_DEVICE_KEYS)
        );
    }
}
