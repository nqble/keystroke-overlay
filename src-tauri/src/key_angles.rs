//! A key's turn angle (key rotation, docs/proposals/key-rotation.md): how a layout file's `r` and a profile's
//! `rotations` are cleaned before they are used or saved. sanitize.rs calls these; the editor and the overlay come later.

use serde_json::{json, Map, Value};

/// The furthest a key may be turned, in degrees either way (clockwise is positive).
pub(crate) const MAX_ANGLE: f64 = 180.0;
/// Only the "shape" style has rotations: the even grid keeps neat columns (decided 2026-10-24).
const STYLE_WITH_ROTATIONS: &str = "shape";

/// A clean angle: a finite number limited to ±MAX_ANGLE and rounded to one decimal. None for anything else, and for 0,
/// which is never written, so files without rotation stay exactly as they were.
pub(crate) fn clean_angle(raw: &Value) -> Option<f64> {
    let angle = raw.as_f64().filter(|n| n.is_finite())?.clamp(-MAX_ANGLE, MAX_ANGLE);
    let rounded = (angle * 10.0).round() / 10.0;
    (rounded != 0.0).then_some(rounded)
}

/// Adds a style's cleaned `rotations` (key code → angle) to its other edits, when the style can have them and any are
/// left. The key codes follow the same rule as positions and sizes, and at most `max_keys` are kept.
pub(crate) fn add_rotations(edits: &mut Map<String, Value>, style: &str, raw_style: Option<&Value>, max_keys: usize) {
    if style != STYLE_WITH_ROTATIONS {
        return;
    }
    let Some(raw_rotations) = raw_style.and_then(|s| s.get("rotations")).and_then(Value::as_object) else {
        return;
    };
    let mut rotations = Map::new();
    for (code, raw_angle) in raw_rotations
        .iter()
        .filter(|(k, _)| !k.is_empty() && k.len() <= 40)
        .take(max_keys)
    {
        if let Some(angle) = clean_angle(raw_angle) {
            rotations.insert(code.clone(), json!(angle));
        }
    }
    if !rotations.is_empty() {
        edits.insert("rotations".into(), Value::Object(rotations));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn angles_are_limited_rounded_and_zero_is_dropped() {
        assert_eq!(clean_angle(&json!(15)), Some(15.0));
        assert_eq!(clean_angle(&json!(-37.26)), Some(-37.3));
        assert_eq!(clean_angle(&json!(400)), Some(MAX_ANGLE));
        assert_eq!(clean_angle(&json!(-400)), Some(-MAX_ANGLE));
        assert_eq!(clean_angle(&json!(0)), None);
        assert_eq!(clean_angle(&json!(0.04)), None, "rounds to 0");
        assert_eq!(clean_angle(&json!("15")), None);
        assert_eq!(clean_angle(&Value::Null), None);
    }

    #[test]
    fn only_the_shape_style_keeps_rotations() {
        let raw = json!({ "rotations": { "KeyW": 15, "KeyA": 0, "KeyS": "x", "": 10 } });
        let mut shape = Map::new();
        add_rotations(&mut shape, "shape", Some(&raw), 300);
        assert_eq!(Value::Object(shape), json!({ "rotations": { "KeyW": 15.0 } }));
        let mut grid = Map::new();
        add_rotations(&mut grid, "grid", Some(&raw), 300);
        assert!(grid.is_empty());
    }

    #[test]
    fn nothing_is_written_when_no_angle_is_left_and_the_key_limit_holds() {
        let mut edits = Map::new();
        add_rotations(&mut edits, "shape", Some(&json!({ "rotations": { "KeyW": 0 } })), 300);
        assert!(edits.is_empty());
        let many: Map<String, Value> = (0..10).map(|i| (format!("Key{i}"), json!(5))).collect();
        add_rotations(&mut edits, "shape", Some(&json!({ "rotations": many })), 3);
        assert_eq!(edits["rotations"].as_object().unwrap().len(), 3);
    }

    #[test]
    fn a_version_4_file_loads_unchanged_and_turned_keys_survive_a_save() {
        use crate::settings::{migrate, CURRENT_VERSION};
        let profile = json!({ "styles": { "shape": { "positions": { "KeyW": { "x": 1, "y": 0 } } } } });
        let migrated = migrate(json!({ "version": 4, "layout": { "id": "wasd", "profiles": { "wasd": profile } } }));
        assert_eq!(migrated["version"], json!(CURRENT_VERSION));
        let shape = &migrated["layout"]["profiles"]["wasd"]["styles"]["shape"];
        assert_eq!(shape["positions"]["KeyW"]["x"].as_f64(), Some(1.0));
        assert!(
            shape.get("rotations").is_none(),
            "nothing is added to a file without rotation"
        );

        let turned = json!({ "styles": { "shape": { "rotations": { "KeyW": 15 } } } });
        let saved = migrate(json!({ "version": 5, "layout": { "id": "wasd", "profiles": { "wasd": turned } } }));
        let again = migrate(saved);
        assert_eq!(
            again["layout"]["profiles"]["wasd"]["styles"]["shape"]["rotations"]["KeyW"],
            json!(15.0)
        );
    }

    #[test]
    fn a_layout_file_key_keeps_its_angle() {
        let keys = crate::sanitize::clean_layout_keys(&json!([
            { "code": "KeyW", "x": 1, "y": 0, "r": 15 },
            { "code": "KeyA", "x": 0, "y": 1, "r": 0 }
        ]));
        assert_eq!(keys[0]["r"], json!(15.0));
        assert!(keys[1].get("r").is_none());
    }
}
