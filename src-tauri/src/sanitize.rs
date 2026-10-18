//! Cleaning settings that come from outside (a hand-edited settings.json, an imported preset or layout): anything of
//! the wrong type goes back to its default, numbers are kept in range, and text, colours and ids are checked, so no file
//! can break the overlay. `sanitize` walks the defaults; the tables of special rules sit right above `clean_value`.
//! Defaults, migrations, loading and saving are in settings.rs, which also holds the tests.
use serde_json::{json, Map, Value};

/// (path, min, max) for numeric settings. Anything out of range is clamped.
pub(crate) const RANGES: &[(&str, f64, f64)] = &[
    ("general.port", 1024.0, 65535.0),
    ("style.borderWidth", 0.0, 20.0),
    ("style.radius", 0.0, 100.0),
    ("style.fontSize", 0.0, 120.0),
    ("style.fontWeight", 100.0, 900.0),
    ("style.glowSize", 0.0, 100.0),
    ("style.keySize", 16.0, 200.0),
    ("style.gap", 0.0, 60.0),
    ("style.scale", 0.2, 4.0),
    ("style.opacity", 0.0, 1.0),
    ("animation.speed", 0.0, 2000.0),
    ("animation.intensity", 0.0, 4.0),
];

/// The snap steps the Keys tab offers, in key widths (0 = off). Keep in step with the Snap menu in
/// ui/settings/tabs/keys-toolbar.js.
pub(crate) const SNAP_CHOICES: [f64; 4] = [0.0, 0.25, 0.5, 1.0];

pub(crate) fn is_hex_color(color: &str) -> bool {
    color.starts_with('#')
        && (color.len() == 7 || color.len() == 9)
        && color[1..].chars().all(|c| c.is_ascii_hexdigit())
}
pub(crate) fn is_ident(ident: &str) -> bool {
    !ident.is_empty() && ident.len() <= 40 && ident.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}
/// Layout ids may also contain dots and spaces (they come from user-made files).
pub(crate) fn is_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 40 && id.chars().all(|c| c.is_ascii_alphanumeric() || "-_. ".contains(c))
}
pub(crate) fn is_version(version: &str) -> bool {
    version.len() <= 24
        && version
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
}

fn clean_strings(value: Option<&Value>) -> Value {
    Value::Array(
        value
            .and_then(|a| a.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter(|x| x.as_str().is_some_and(|s| s.len() <= 40))
                    .take(300)
                    .cloned()
                    .collect()
            })
            .unwrap_or_default(),
    )
}
fn clean_labels(value: Option<&Value>) -> Value {
    Value::Object(
        value
            .and_then(|o| o.as_object())
            .map(|entries| {
                entries
                    .iter()
                    .filter(|(k, x)| k.len() <= 40 && x.as_str().is_some_and(|s| s.chars().count() <= 16))
                    .take(300)
                    .map(|(k, x)| (k.clone(), x.clone()))
                    .collect()
            })
            .unwrap_or_default(),
    )
}
/// How far a key's position may be, in key widths. The Keys tab keeps keys inside a smaller board; this only stops a
/// hand-edited file from breaking the overlay. Positions may be negative (a key left of or above the layout's own
/// origin, so the layout can sit in the middle of the board). Keep in step with MIN_POSITION and MAX_POSITION in
/// ui/settings/profiles.js.
pub(crate) const MIN_POSITION: f64 = -100.0;
pub(crate) const MAX_POSITION: f64 = 100.0;
/// The narrowest and widest a resized key may be, in key widths (the Keys tab limits it further, to the board).
/// Keep in step with MIN_KEY_WIDTH and MAX_KEY_WIDTH in ui/settings/profiles.js and ui/overlay/overlay.js.
pub(crate) const MIN_KEY_WIDTH: f64 = 0.25;
pub(crate) const MAX_KEY_WIDTH: f64 = 100.0;
/// The layout styles a profile can keep positions for: "shape" (keys as the layout file draws them) and "grid" (every
/// key one key wide in neat columns).
const LAYOUT_STYLES: [&str; 2] = ["shape", "grid"];
/// The most keys one profile may move or resize.
pub(crate) const MAX_EDITED_KEYS: usize = 300;

fn round_to_hundredths(units: f64) -> f64 {
    (units * 100.0).round() / 100.0
}

/// Where the user dragged keys to in one layout style: { "KeyW": { "x": 1.25, "y": 0 } } in key units. Anything that is
/// not a pair of finite numbers is dropped; numbers are limited to MIN_POSITION..MAX_POSITION and rounded to 2 decimals.
fn clean_positions(value: Option<&Value>) -> Value {
    let mut out = Map::new();
    if let Some(moved_keys) = value.and_then(|x| x.as_object()) {
        for (code, position) in moved_keys
            .iter()
            .filter(|(k, _)| !k.is_empty() && k.len() <= 40)
            .take(MAX_EDITED_KEYS)
        {
            if let (Some(x), Some(y)) = (
                position.get("x").and_then(Value::as_f64),
                position.get("y").and_then(Value::as_f64),
            ) {
                if x.is_finite() && y.is_finite() {
                    let limited = |units: f64| round_to_hundredths(units.clamp(MIN_POSITION, MAX_POSITION));
                    out.insert(code.clone(), json!({ "x": limited(x), "y": limited(y) }));
                }
            }
        }
    }
    Value::Object(out)
}

/// How wide and tall the user made keys in one layout style: { "Space": { "w": 4.5 }, "KeyW": { "h": 2 } } in key sizes (an
/// entry may hold a width, a height or both). Anything that is not a finite number is dropped; sizes are limited to
/// MIN_KEY_WIDTH..MAX_KEY_WIDTH and rounded to 2 decimals.
fn clean_sizes(value: Option<&Value>) -> Value {
    let mut out = Map::new();
    if let Some(resized_keys) = value.and_then(|x| x.as_object()) {
        for (code, size) in resized_keys
            .iter()
            .filter(|(k, _)| !k.is_empty() && k.len() <= 40)
            .take(MAX_EDITED_KEYS)
        {
            let mut entry = Map::new();
            for part in ["w", "h"] {
                if let Some(length) = size.get(part).and_then(Value::as_f64).filter(|n| n.is_finite()) {
                    entry.insert(
                        part.into(),
                        json!(round_to_hundredths(length.clamp(MIN_KEY_WIDTH, MAX_KEY_WIDTH))),
                    );
                }
            }
            if !entry.is_empty() {
                out.insert(code.clone(), Value::Object(entry));
            }
        }
    }
    Value::Object(out)
}

/// One layout style's edits: only the parts that have something in them, so untouched profiles stay small.
fn clean_style(raw_style: Option<&Value>, fallback_positions: Option<&Value>) -> Map<String, Value> {
    let mut cleaned = Map::new();
    let positions = clean_positions(raw_style.and_then(|s| s.get("positions")).or(fallback_positions));
    if positions.as_object().is_some_and(|m| !m.is_empty()) {
        cleaned.insert("positions".into(), positions);
    }
    let sizes = clean_sizes(raw_style.and_then(|s| s.get("sizes")));
    if sizes.as_object().is_some_and(|m| !m.is_empty()) {
        cleaned.insert("sizes".into(), sizes);
    }
    cleaned
}

pub fn clean_profiles(raw_profiles: &Value) -> Value {
    let mut out = Map::new();
    if let Some(entries) = raw_profiles.as_object() {
        for (id, profile) in entries.iter().filter(|(id, _)| is_id(id)).take(50) {
            let mut cleaned = Map::new();
            cleaned.insert("disabledKeys".into(), clean_strings(profile.get("disabledKeys")));
            cleaned.insert("labels".into(), clean_labels(profile.get("labels")));
            // "shape" is the default style and is not written; only a chosen "grid" is
            if profile.get("layoutStyle").and_then(Value::as_str) == Some("grid") {
                cleaned.insert("layoutStyle".into(), json!("grid"));
            }
            let mut styles = Map::new();
            for style in LAYOUT_STYLES {
                // files written before version 3 (an older layout export, say) keep positions straight on the profile
                let legacy_positions = if style == "shape" {
                    profile.get("positions")
                } else {
                    None
                };
                let edits = clean_style(profile.get("styles").and_then(|s| s.get(style)), legacy_positions);
                if !edits.is_empty() {
                    styles.insert(style.to_string(), Value::Object(edits));
                }
            }
            if !styles.is_empty() {
                cleaned.insert("styles".into(), Value::Object(styles));
            }
            out.insert(id.clone(), Value::Object(cleaned));
        }
    }
    Value::Object(out)
}

/// The allowed range of a number setting; unlimited when RANGES doesn't list it.
fn range_for(path: &str) -> (f64, f64) {
    RANGES
        .iter()
        .find(|(name, _, _)| *name == path)
        .map(|(_, lo, hi)| (*lo, *hi))
        .unwrap_or((f64::MIN, f64::MAX))
}

/// Make arbitrary JSON (hand-edited file, imported preset) safe to use: wrong types fall back to defaults, numbers are
/// clamped, colours and ids validated. Each setting follows the default's type; the tables below hold every setting
/// with a rule of its own, so a new rule is one line there.
pub fn sanitize(value: &mut Value, def: &Value) {
    clean_value(value, def, "");
}

/// Cleans one free-form part of the settings and returns the clean copy.
type CleanFreeForm = fn(&Value) -> Value;
/// True when a text setting's value is acceptable.
type TextRule = fn(&str) -> bool;

/// Settings whose keys are free-form (not listed in the defaults), each cleaned by its own function.
const FREE_FORM: &[(&str, CleanFreeForm)] = &[("layout.profiles", clean_profiles)];

/// Numbers that must be one of a fixed set of choices; anything else goes back to the default.
const NUMBER_CHOICES: &[(&str, &[f64])] = &[("layout.editor.snap", &SNAP_CHOICES)];

/// Numbers that go back to their default when invalid instead of being clamped: they must also be whole, and a
/// clamped port would quietly be a different port.
const RESET_WHEN_INVALID: &[&str] = &["general.port"];

/// Text settings with a rule of their own. Text whose default is a colour must be a colour; any other text must be a
/// plain identifier (`is_ident`).
const TEXT_RULES: &[(&str, TextRule)] = &[
    ("style.fontFamily", is_font_name),
    ("general.lastSeenVersion", is_version),
    ("layout.id", is_id),
    ("general.updateChannel", |text| text == "stable" || text == "latest"),
    ("general.inputMethod", |text| text == "hook" || text == "rawinput"),
    ("general.linkKey", is_link_key),
];

fn rule_for<'a, T>(table: &'a [(&str, T)], path: &str) -> Option<&'a T> {
    table.iter().find(|(name, _)| *name == path).map(|(_, rule)| rule)
}

fn clean_value(value: &mut Value, def: &Value, path: &str) {
    match def {
        Value::Object(default_map) => clean_object(value, def, default_map, path),
        Value::Number(_) => clean_number(value, def, path),
        Value::Bool(_) => {
            if !value.is_boolean() {
                *value = def.clone();
            }
        }
        Value::String(default_text) => {
            if !value
                .as_str()
                .is_some_and(|text| text_is_valid(text, default_text, path))
            {
                *value = def.clone();
            }
        }
        Value::Array(_) => *value = clean_strings(Some(value)),
        Value::Null => {}
    }
}

/// Only the keys the defaults know survive, missing ones get their default, and each one is cleaned in turn.
fn clean_object(value: &mut Value, def: &Value, default_map: &Map<String, Value>, path: &str) {
    if let Some(clean_free_form) = rule_for(FREE_FORM, path) {
        *value = clean_free_form(value);
        return;
    }
    let Some(value_map) = value.as_object_mut() else {
        *value = def.clone();
        return;
    };
    value_map.retain(|key, _| default_map.contains_key(key));
    for (key, default_value) in default_map {
        let child_path = if path.is_empty() {
            key.clone()
        } else {
            format!("{path}.{key}")
        };
        match value_map.get_mut(key) {
            Some(child) => clean_value(child, default_value, &child_path),
            None => {
                value_map.insert(key.clone(), default_value.clone());
            }
        }
    }
}

fn clean_number(value: &mut Value, def: &Value, path: &str) {
    let Some(number) = value.as_f64().filter(|n| n.is_finite()) else {
        *value = def.clone();
        return;
    };
    if let Some(choices) = rule_for(NUMBER_CHOICES, path) {
        if !choices.contains(&number) {
            *value = def.clone();
        }
        return;
    }
    let (lo, hi) = range_for(path);
    let in_range = number >= lo && number <= hi;
    if RESET_WHEN_INVALID.contains(&path) {
        if !in_range || number.fract() != 0.0 {
            *value = def.clone();
        }
        return;
    }
    // valid and in range: left exactly as it was (no rewriting 1 as 1.0)
    if !in_range {
        *value = json!(number.clamp(lo, hi));
    }
}

fn text_is_valid(text: &str, default_text: &str, path: &str) -> bool {
    if default_text.starts_with('#') {
        return is_hex_color(text);
    }
    match rule_for(TEXT_RULES, path) {
        Some(rule) => rule(text),
        None => is_ident(text),
    }
}

/// A font name the overlay can put in its CSS safely: no quotes, braces or tags.
fn is_font_name(text: &str) -> bool {
    !text.is_empty() && text.len() <= 80 && !text.contains(['"', '\\', '{', '}', ';', '<', '>'])
}

/// The private link key: empty (none yet), or 32 to 64 hex characters.
fn is_link_key(text: &str) -> bool {
    text.is_empty() || (text.len() >= 32 && text.len() <= 64 && text.chars().all(|c| c.is_ascii_hexdigit()))
}
