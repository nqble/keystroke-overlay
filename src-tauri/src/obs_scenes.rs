//! The "OBS scenes" rules (`obs.scenes.rules` in settings.rs): hide the overlay, or show another layout, in the OBS
//! scenes the user lists. The overlay page follows them inside OBS (ui/overlay/obs-source.js); this file only cleans the
//! saved list. Proposal: docs/proposals/obs-source-events.md.

use serde_json::{json, Map, Value};

/// At most this many rules (must match MAX_RULES in ui/settings/tabs/general-obs-scenes.js).
pub const MAX_SCENE_RULES: usize = 20;
/// The longest scene name kept, in characters. OBS has no fixed limit; longer names are almost surely junk.
const MAX_SCENE_NAME: usize = 100;

/// Keeps well-formed rules only: `{ scene, show, layout }`, at most MAX_SCENE_RULES, each scene once.
/// A bad `show` becomes `true` (shown), a bad `layout` becomes `""` (the layout chosen in the settings window).
pub fn clean_scene_rules(raw: &Value) -> Value {
    let mut rules: Vec<Value> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    for rule in raw.as_array().into_iter().flatten().filter_map(Value::as_object) {
        let Some(scene) = clean_scene_name(rule) else {
            continue;
        };
        let key = scene.to_lowercase();
        if seen.contains(&key) || rules.len() >= MAX_SCENE_RULES {
            continue;
        }
        seen.push(key);
        rules.push(json!({ "scene": scene, "show": show_of(rule), "layout": layout_of(rule) }));
    }
    Value::Array(rules)
}

/// The rule's scene name, trimmed; `None` when missing, empty, too long or holding control characters.
fn clean_scene_name(rule: &Map<String, Value>) -> Option<String> {
    let scene = rule.get("scene")?.as_str()?.trim();
    let fits = !scene.is_empty() && scene.chars().count() <= MAX_SCENE_NAME;
    (fits && !scene.chars().any(char::is_control)).then(|| scene.to_string())
}

fn show_of(rule: &Map<String, Value>) -> bool {
    rule.get("show").and_then(Value::as_bool).unwrap_or(true)
}

fn layout_of(rule: &Map<String, Value>) -> String {
    let layout = rule.get("layout").and_then(Value::as_str).unwrap_or("");
    if crate::sanitize::is_id(layout) {
        layout.to_string()
    } else {
        String::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn good_rules_are_kept_as_they_are() {
        let rules = json!([{ "scene": "Coding", "show": true, "layout": "full" }, { "scene": "Chat", "show": false, "layout": "" }]);
        assert_eq!(clean_scene_rules(&rules), rules);
    }

    #[test]
    fn junk_is_dropped_or_given_a_safe_value() {
        let cleaned = clean_scene_rules(&json!([
            "not a rule",
            { "show": false },
            { "scene": "   " },
            { "scene": "Bad\u{7}name" },
            { "scene": "x".repeat(MAX_SCENE_NAME + 1) },
            { "scene": "  Game  ", "show": "no", "layout": "../evil", "extra": 1 },
        ]));
        assert_eq!(cleaned, json!([{ "scene": "Game", "show": true, "layout": "" }]));
    }

    #[test]
    fn each_scene_counts_once_whatever_its_case() {
        let cleaned =
            clean_scene_rules(&json!([{ "scene": "Game", "show": false }, { "scene": "GAME", "show": true }]));
        assert_eq!(cleaned, json!([{ "scene": "Game", "show": false, "layout": "" }]));
    }

    #[test]
    fn at_most_the_limit_is_kept() {
        let many: Vec<Value> = (0..MAX_SCENE_RULES + 5)
            .map(|n| json!({ "scene": format!("Scene {n}") }))
            .collect();
        assert_eq!(
            clean_scene_rules(&json!(many)).as_array().unwrap().len(),
            MAX_SCENE_RULES
        );
    }

    #[test]
    fn not_a_list_becomes_an_empty_list() {
        assert_eq!(clean_scene_rules(&json!({ "scene": "A" })), json!([]));
        assert_eq!(clean_scene_rules(&json!(null)), json!([]));
    }
}
