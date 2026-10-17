//! Which layouts show, and in what order (the setting `layout.order`; docs/design/ui-design-v2.md, Layouts). Used by
//! the tray's Layout menu; the Layout tab follows the same rules in ui/settings/layout-order.js (keep the two in step:
//! both have tests with the same cases).
//!
//! - A built-in layout shows only while its id is in the order. The ones that aren't wait in "Other layouts".
//! - The user's own layouts always show: one missing from the order is added at the end.
//! - Ids for layouts that no longer exist are skipped.
use serde_json::{json, Value};

/// A new install's layouts, in order. Every other built-in layout file starts in "Other layouts".
pub const DEFAULT_ORDER: [&str; 4] = ["full", "tkl", "gameplay", "wasd"];

/// How many ids the order may hold (the 12 built-in layouts plus the user's 20, with room to spare).
const MAX_ORDER: usize = 64;

/// The layouts to show, in order. `all` is server::layouts() (built-in ones and the user's, which have "user": true).
pub fn shown_in_order<'a>(all: &'a [Value], order: &Value) -> Vec<&'a Value> {
    let ids: Vec<&str> = order
        .as_array()
        .map(|list| list.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    let by_id = |id: &str| all.iter().find(|layout| layout["id"] == id);
    let mut shown: Vec<&Value> = ids.iter().filter_map(|id| by_id(id)).collect();
    for layout in all.iter().filter(|layout| layout["user"] == true) {
        if !shown.iter().any(|seen| seen["id"] == layout["id"]) {
            shown.push(layout);
        }
    }
    shown
}

/// The order as saved: layout ids only (the same characters as any layout id), each once, at most MAX_ORDER.
pub fn clean_order(raw: &Value) -> Value {
    let mut seen: Vec<String> = Vec::new();
    for id in raw.as_array().into_iter().flatten().filter_map(Value::as_str) {
        if crate::sanitize::is_id(id) && !seen.iter().any(|known| known == id) && seen.len() < MAX_ORDER {
            seen.push(id.to_string());
        }
    }
    json!(seen)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn layout(id: &str, user: bool) -> Value {
        json!({ "id": id, "name": id, "keys": [], "user": user })
    }

    #[test]
    fn built_in_layouts_show_only_while_listed_in_their_order() {
        let all = [layout("full", false), layout("tkl", false), layout("numpad", false)];
        let ids: Vec<&Value> = shown_in_order(&all, &json!(["tkl", "full"]))
            .into_iter()
            .map(|l| &l["id"])
            .collect();
        assert_eq!(ids, [&json!("tkl"), &json!("full")]);
    }

    #[test]
    fn the_users_own_layouts_always_show_missing_ones_at_the_end() {
        let all = [layout("full", false), layout("mine", true), layout("also-mine", true)];
        let ids: Vec<&Value> = shown_in_order(&all, &json!(["also-mine", "full"]))
            .into_iter()
            .map(|l| &l["id"])
            .collect();
        assert_eq!(ids, [&json!("also-mine"), &json!("full"), &json!("mine")]);
    }

    #[test]
    fn ids_of_layouts_that_are_gone_are_skipped() {
        let all = [layout("full", false)];
        assert_eq!(shown_in_order(&all, &json!(["deleted", "full"])).len(), 1);
    }

    #[test]
    fn the_saved_order_keeps_valid_ids_once() {
        let raw = json!(["full", "full", "../x", 7, "", "tkl", "a".repeat(41)]);
        assert_eq!(clean_order(&raw), json!(["full", "tkl"]));
        assert_eq!(clean_order(&json!("not a list")), json!([]));
        let many: Vec<String> = (0..100).map(|i| format!("l{i}")).collect();
        assert_eq!(clean_order(&json!(many)).as_array().unwrap().len(), MAX_ORDER);
    }

    #[test]
    fn a_settings_file_from_before_the_order_existed_gets_the_four_defaults() {
        let migrated = crate::settings::migrate(json!({ "version": 3, "layout": { "id": "wasd" } }));
        assert_eq!(migrated["layout"]["order"], json!(DEFAULT_ORDER));
        assert_eq!(migrated["layout"]["id"], json!("wasd"));
    }
}
