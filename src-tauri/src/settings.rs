//! Settings storage: versioned JSON + migration chain + defaults merging.
//!
//! The file on disk is `{ "version": N, ... }`. On load it is migrated one
//! step at a time up to `CURRENT_VERSION`, then deep-merged on top of
//! `defaults()` so newly added settings always have a value, then sanitized.
//!
//! HOW TO ADD A SETTING: add it to `defaults()` (and to the control list in
//! ui/settings/settings.js). No migration is needed for purely additive changes.
//! HOW TO RENAME/RESTRUCTURE: bump CURRENT_VERSION and add a step to `MIGRATIONS`.

use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

pub const CURRENT_VERSION: u64 = 2;

pub fn defaults() -> Value {
    json!({
        "version": CURRENT_VERSION,
        "general": {
            "port": 7878, "autostart": false, "minimizeToTray": true, "openOnLaunch": true,
            // Developer tools: adds a Debug tab and an in-memory event log (src-tauri/src/debug.rs). Off by default.
            "debugMode": false,
            // Background update check (about once an hour while the app runs, and when the settings window opens).
            // Updates are
            // never installed without the user clicking the update button.
            "autoCheckUpdates": true,
            // How keys are read: "hook" (standard, default) or "rawinput" (compatibility, for games that block hooks).
            "inputMethod": "hook",
            // Optional "secure link": when on, the overlay link carries a private key (?key=...) and the local server
            // refuses
            // requests without it. Off by default (plain link, no extra step). The key is never sent to the overlay
            // itself.
            "secureLink": false,
            "linkKey": "",
            // "stable" = only releases that were promoted to the Stable channel; "latest" = every release.
            "updateChannel": "stable",
            // Last app version the user has seen the "What's new" window for (managed by the app).
            "lastSeenVersion": ""
        },
        // profiles[layoutId] = { disabledKeys: [...], labels: { code: text } }  (one per layout, saved automatically)
        "layout": { "id": "tkl", "profiles": {} },
        "style": {
            "keyFill": "#1e222bd9", "keyFillPressed": "#4f8cffff",
            "borderColor": "#ffffff40", "borderColorPressed": "#ffffffff", "borderWidth": 2, "radius": 8,
            "fontFamily": "Segoe UI", "fontSize": 18, "fontWeight": 600,
            "textColor": "#e6e9f0ff", "textColorPressed": "#ffffffff",
            "glowColor": "#4f8cffff", "glowSize": 18,
            "keySize": 52, "gap": 6, "scale": 1.0, "opacity": 1.0
        },
        "animation": { "type": "none", "speed": 120, "easing": "default", "intensity": 1.0 }
    })
}

type Migration = fn(&mut Value);

/// MIGRATIONS[i] upgrades a config from version (i+1) to (i+2).
const MIGRATIONS: &[Migration] = &[v1_to_v2];

/// v1 stored one global `layout.disabledKeys` / `layout.labels`.
/// v2 stores them per layout in `layout.profiles[layoutId]`.
fn v1_to_v2(config: &mut Value) {
    let Some(layout) = config.get_mut("layout").and_then(|l| l.as_object_mut()) else {
        return;
    };
    let id = layout.get("id").and_then(|x| x.as_str()).unwrap_or("tkl").to_string();
    let disabled = layout.remove("disabledKeys").unwrap_or_else(|| json!([]));
    let labels = layout.remove("labels").unwrap_or_else(|| json!({}));
    let mut profile = Map::new();
    profile.insert("disabledKeys".into(), disabled);
    profile.insert("labels".into(), labels);
    let mut profiles = Map::new();
    profiles.insert(id, Value::Object(profile));
    layout.insert("profiles".into(), Value::Object(profiles));
}

pub fn migrate(mut config: Value) -> Value {
    if !config.is_object() {
        return defaults();
    }
    let mut ver = config.get("version").and_then(|x| x.as_u64()).unwrap_or(1).max(1);
    while ver < CURRENT_VERSION {
        if let Some(migration) = MIGRATIONS.get((ver - 1) as usize) {
            migration(&mut config);
        }
        ver += 1;
    }
    config["version"] = json!(CURRENT_VERSION);
    let mut out = defaults();
    merge(&mut out, &config);
    sanitize(&mut out, &defaults());
    out
}

/// (path, min, max) for numeric settings. Anything out of range is clamped.
const RANGES: &[(&str, f64, f64)] = &[
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

fn is_hex_color(color: &str) -> bool {
    color.starts_with('#')
        && (color.len() == 7 || color.len() == 9)
        && color[1..].chars().all(|c| c.is_ascii_hexdigit())
}
fn is_ident(ident: &str) -> bool {
    !ident.is_empty() && ident.len() <= 40 && ident.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}
/// Layout ids may also contain dots and spaces (they come from user-made files).
fn is_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 40 && id.chars().all(|c| c.is_ascii_alphanumeric() || "-_. ".contains(c))
}
fn is_version(version: &str) -> bool {
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
/// Where the user dragged keys to in one layout: { "KeyW": { "x": 1.25, "y": 0 } } in key units. Anything that is not a
/// pair of finite numbers is dropped; numbers are limited to 0..100 and rounded to 2 decimals.
fn clean_positions(value: Option<&Value>) -> Value {
    let mut out = Map::new();
    if let Some(moved_keys) = value.and_then(|x| x.as_object()) {
        for (code, position) in moved_keys
            .iter()
            .filter(|(k, _)| !k.is_empty() && k.len() <= 40)
            .take(300)
        {
            if let (Some(x), Some(y)) = (
                position.get("x").and_then(Value::as_f64),
                position.get("y").and_then(Value::as_f64),
            ) {
                if x.is_finite() && y.is_finite() {
                    let round_units = |units: f64| (units.clamp(0.0, 100.0) * 100.0).round() / 100.0;
                    out.insert(code.clone(), json!({ "x": round_units(x), "y": round_units(y) }));
                }
            }
        }
    }
    Value::Object(out)
}

pub fn clean_profiles(raw_profiles: &Value) -> Value {
    let mut out = Map::new();
    if let Some(entries) = raw_profiles.as_object() {
        for (id, profile) in entries.iter().filter(|(id, _)| is_id(id)).take(50) {
            let mut cleaned = Map::new();
            cleaned.insert("disabledKeys".into(), clean_strings(profile.get("disabledKeys")));
            cleaned.insert("labels".into(), clean_labels(profile.get("labels")));
            let positions = clean_positions(profile.get("positions"));
            // only when keys were moved
            if positions.as_object().is_some_and(|m| !m.is_empty()) {
                cleaned.insert("positions".into(), positions);
            }
            out.insert(id.clone(), Value::Object(cleaned));
        }
    }
    Value::Object(out)
}

/// Make arbitrary JSON (hand-edited file, imported preset) safe to use:
/// wrong types fall back to defaults, numbers are clamped, colours/ids validated.
pub fn sanitize(value: &mut Value, def: &Value) {
    fn walk(value: &mut Value, def: &Value, path: &str) {
        match def {
            Value::Object(default_map) => {
                if path == "layout.profiles" {
                    *value = clean_profiles(value);
                    return;
                } // free-form map
                if !value.is_object() {
                    *value = def.clone();
                    return;
                }
                let value_map = value.as_object_mut().unwrap();
                value_map.retain(|k, _| default_map.contains_key(k));
                for (key, default_value) in default_map {
                    let child_path = if path.is_empty() {
                        key.clone()
                    } else {
                        format!("{path}.{key}")
                    };
                    match value_map.get_mut(key) {
                        Some(child) => walk(child, default_value, &child_path),
                        None => {
                            value_map.insert(key.clone(), default_value.clone());
                        }
                    }
                }
            }
            Value::Number(_) => {
                let number = value.as_f64().filter(|n| n.is_finite());
                let (lo, hi) = RANGES
                    .iter()
                    .find(|r| r.0 == path)
                    .map(|r| (r.1, r.2))
                    .unwrap_or((f64::MIN, f64::MAX));
                match number {
                    // Valid and in range: leave the value exactly as it was.
                    Some(n) if n >= lo && n <= hi && (path != "general.port" || n.fract() == 0.0) => {}
                    Some(_) if path == "general.port" => *value = def.clone(), // invalid port: back to the default
                    Some(n) => *value = json!(n.clamp(lo, hi)),
                    None => *value = def.clone(),
                }
            }
            Value::Bool(_) => {
                if !value.is_boolean() {
                    *value = def.clone()
                }
            }
            Value::String(default_text) => {
                let ok = match value.as_str() {
                    Some(text) if default_text.starts_with('#') => is_hex_color(text),
                    Some(text) if path == "style.fontFamily" => {
                        !text.is_empty() && text.len() <= 80 && !text.contains(['"', '\\', '{', '}', ';', '<', '>'])
                    }
                    Some(text) if path == "general.lastSeenVersion" => is_version(text),
                    Some(text) if path == "layout.id" => is_id(text),
                    Some(text) if path == "general.updateChannel" => text == "stable" || text == "latest",
                    Some(text) if path == "general.inputMethod" => text == "hook" || text == "rawinput",
                    Some(text) if path == "general.linkKey" => {
                        text.is_empty()
                            || (text.len() >= 32 && text.len() <= 64 && text.chars().all(|c| c.is_ascii_hexdigit()))
                    }
                    Some(text) => is_ident(text),
                    None => false,
                };
                if !ok {
                    *value = def.clone();
                }
            }
            Value::Array(_) => *value = clean_strings(Some(value)),
            Value::Null => {}
        }
    }
    walk(value, def, "");
}

/// A fresh private link key: 128 bits from the operating system's secure random generator, as 32 hex characters.
pub fn new_key() -> Result<String, String> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|e| format!("couldn't create a secure key: {e}"))?;
    Ok(bytes.iter().map(|x| format!("{x:02x}")).collect())
}

/// Settings as the overlay is allowed to see them: everything except the private link key.
pub fn public_settings(settings: &Value) -> Value {
    let mut public = settings.clone();
    if let Some(general) = public.get_mut("general").and_then(|g| g.as_object_mut()) {
        general.remove("linkKey");
    }
    public
}

/// Deep-merge `src` into `dst` (objects recurse, everything else replaces).
pub fn merge(dst: &mut Value, src: &Value) {
    match (dst, src) {
        (Value::Object(dst_map), Value::Object(src_map)) => {
            for (key, src_value) in src_map {
                match dst_map.get_mut(key) {
                    Some(dst_value) if dst_value.is_object() && src_value.is_object() => merge(dst_value, src_value),
                    _ => {
                        dst_map.insert(key.clone(), src_value.clone());
                    }
                }
            }
        }
        (dst_value, src_value) => *dst_value = src_value.clone(),
    }
}

fn read_json(path: &Path) -> Option<Value> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .filter(|v| v.is_object())
}

/// Loads settings. If settings.json is missing or corrupt, the last good copy (settings.json.bak) is used.
pub fn load(path: &Path) -> Value {
    read_json(path)
        .or_else(|| read_json(&path.with_extension("json.bak")))
        .map(migrate)
        .unwrap_or_else(defaults)
}

pub fn save(path: &Path, settings: &Value) -> std::io::Result<()> {
    if let Some(folder) = path.parent() {
        std::fs::create_dir_all(folder)?;
    }
    // Keep the previous good file as a backup (only if it is itself valid).
    if read_json(path).is_some() {
        let _ = std::fs::copy(path, path.with_extension("json.bak"));
    }
    // Write-then-rename so a crash can never leave a half-written config.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(settings).unwrap())?;
    std::fs::rename(tmp, path)
}

/// Per-user data folders (settings, fonts, presets, user layouts/animations/themes).
pub struct Paths {
    pub root: PathBuf,
}
impl Paths {
    pub fn settings(&self) -> PathBuf {
        self.root.join("settings.json")
    }
    pub fn fonts(&self) -> PathBuf {
        self.root.join("fonts")
    }
    pub fn presets(&self) -> PathBuf {
        self.root.join("presets")
    }
    pub fn user(&self, kind: &str) -> PathBuf {
        self.root.join(kind)
    } // layouts | animations | themes
    pub fn ensure(&self) {
        for folder_name in ["fonts", "presets", "layouts", "animations", "themes"] {
            let _ = std::fs::create_dir_all(self.root.join(folder_name));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn garbage_becomes_defaults() {
        assert_eq!(migrate(json!("nope")), defaults());
        assert_eq!(migrate(json!(null)), defaults());
    }
    #[test]
    fn missing_keys_get_defaults_and_known_values_survive() {
        let migrated = migrate(json!({ "version": 2, "style": { "radius": 20 } }));
        assert_eq!(migrated["style"]["radius"].as_f64(), Some(20.0));
        assert_eq!(migrated["general"]["port"], json!(7878));
        assert_eq!(migrated["version"], json!(CURRENT_VERSION));
    }
    #[test]
    fn bad_values_are_repaired() {
        let migrated = migrate(
            json!({ "version": 2, "general": { "port": 80 }, "style": { "keySize": "big", "opacity": 9, "keyFill": "red", "fontFamily": "x\"; }" },
                                "animation": { "type": "../../evil", "speed": -5 },
                                "layout": { "profiles": { "tkl": { "disabledKeys": [1, "KeyA"], "labels": { "KeyA": "ok", "KeyB": 5 } }, "../evil": {} } } }),
        );
        assert_eq!(migrated["general"]["port"], json!(7878));
        assert_eq!(migrated["style"]["keySize"], defaults()["style"]["keySize"]);
        assert_eq!(migrated["style"]["opacity"].as_f64(), Some(1.0));
        assert_eq!(migrated["style"]["keyFill"], defaults()["style"]["keyFill"]);
        assert_eq!(migrated["style"]["fontFamily"], defaults()["style"]["fontFamily"]);
        assert_eq!(migrated["animation"]["type"], defaults()["animation"]["type"]);
        assert_eq!(migrated["animation"]["speed"].as_f64(), Some(0.0));
        assert_eq!(migrated["layout"]["profiles"]["tkl"]["disabledKeys"], json!(["KeyA"]));
        assert_eq!(migrated["layout"]["profiles"]["tkl"]["labels"], json!({ "KeyA": "ok" }));
        assert!(migrated["layout"]["profiles"].get("../evil").is_none());
    }
    #[test]
    fn defaults_are_stable_under_sanitize() {
        assert_eq!(migrate(defaults()), defaults());
    }
    #[test]
    fn v1_settings_migrate_into_a_profile_without_losing_anything() {
        let old = json!({ "version": 1, "general": { "port": 9000, "autoCheckUpdates": true },
                          "layout": { "id": "tsb", "disabledKeys": ["KeyQ"], "labels": { "Space": "Jump" } } });
        let migrated = migrate(old);
        assert_eq!(migrated["version"], json!(2));
        assert_eq!(migrated["general"]["port"], json!(9000));
        assert_eq!(migrated["general"]["autoCheckUpdates"], json!(true));
        assert_eq!(migrated["layout"]["id"], json!("tsb"));
        assert_eq!(migrated["layout"]["profiles"]["tsb"]["disabledKeys"], json!(["KeyQ"]));
        assert_eq!(migrated["layout"]["profiles"]["tsb"]["labels"]["Space"], json!("Jump"));
        assert!(migrated["layout"].get("disabledKeys").is_none() && migrated["layout"].get("labels").is_none());
    }
    #[test]
    fn update_channel_is_limited_to_stable_or_latest() {
        assert_eq!(
            migrate(json!({ "version": 2 }))["general"]["updateChannel"],
            json!("stable")
        );
        assert_eq!(
            migrate(json!({ "version": 2, "general": { "updateChannel": "latest" } }))["general"]["updateChannel"],
            json!("latest")
        );
        assert_eq!(
            migrate(json!({ "version": 2, "general": { "updateChannel": "nightly" } }))["general"]["updateChannel"],
            json!("stable")
        );
        assert_eq!(
            migrate(json!({ "version": 2, "general": { "updateChannel": 5 } }))["general"]["updateChannel"],
            json!("stable")
        );
    }
    #[test]
    fn input_method_is_limited_to_hook_or_rawinput() {
        assert_eq!(
            migrate(json!({ "version": 2 }))["general"]["inputMethod"],
            json!("hook")
        );
        assert_eq!(
            migrate(json!({ "version": 2, "general": { "inputMethod": "rawinput" } }))["general"]["inputMethod"],
            json!("rawinput")
        );
        assert_eq!(
            migrate(json!({ "version": 2, "general": { "inputMethod": "driver" } }))["general"]["inputMethod"],
            json!("hook")
        );
        assert_eq!(
            migrate(json!({ "version": 2, "general": { "inputMethod": 3 } }))["general"]["inputMethod"],
            json!("hook")
        );
    }
    #[test]
    fn secure_link_defaults_off_and_key_is_validated() {
        let migrated = migrate(json!({ "version": 2 }));
        assert_eq!(migrated["general"]["secureLink"], json!(false));
        assert_eq!(migrated["general"]["linkKey"], json!(""));
        let good = "0123456789abcdef0123456789abcdef";
        assert_eq!(
            migrate(json!({ "version": 2, "general": { "secureLink": true, "linkKey": good } }))["general"]["linkKey"],
            json!(good)
        );
        for bad in [
            "short",
            "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
            "../../etc",
            &"a".repeat(65),
        ] {
            assert_eq!(
                migrate(json!({ "version": 2, "general": { "linkKey": bad } }))["general"]["linkKey"],
                json!(""),
                "{bad}"
            );
        }
        assert_eq!(
            migrate(json!({ "version": 2, "general": { "secureLink": "yes" } }))["general"]["secureLink"],
            json!(false)
        );
    }
    #[test]
    fn new_keys_are_random_hex_and_never_shown_to_the_overlay() {
        let (first_key, second_key) = (new_key().unwrap(), new_key().unwrap());
        assert_eq!(first_key.len(), 32);
        assert!(first_key.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(first_key, second_key);
        let mut full = defaults();
        full["general"]["linkKey"] = json!(first_key);
        let public = public_settings(&full);
        assert!(public["general"].get("linkKey").is_none());
        assert_eq!(public["general"]["port"], full["general"]["port"]); // everything else is kept
    }
    #[test]
    fn corrupt_settings_fall_back_to_the_backup() {
        let dir = std::env::temp_dir().join(format!("ko-settings-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let file = dir.join("settings.json");
        let mut current = defaults();
        current["general"]["autoCheckUpdates"] = json!(true);
        save(&file, &current).unwrap(); // first save: no backup yet
        save(&file, &current).unwrap(); // second save: previous file becomes the backup
        std::fs::write(&file, "{ this is not json").unwrap(); // simulate corruption
        assert_eq!(load(&file)["general"]["autoCheckUpdates"], json!(true));
        std::fs::remove_dir_all(&dir).ok();
    }
    #[test]
    fn profiles_and_version_survive_a_round_trip() {
        let mut current = defaults();
        current["general"]["lastSeenVersion"] = json!("1.1.2");
        current["general"]["autoCheckUpdates"] = json!(true);
        current["layout"]["profiles"] = json!({ "wasd": { "disabledKeys": ["KeyE"], "labels": { "Space": "⎵" } }, "my layout.v2": { "disabledKeys": [], "labels": {} } });
        assert_eq!(migrate(current.clone()), current);
    }
}

/// Hostile-input tests: files a user hand-edits, imports or downloads must never crash the app or slip past the rules.
/// A tiny deterministic random generator (no extra libraries) builds thousands of nasty JSON documents.
#[cfg(test)]
mod robustness_tests {
    use super::*;

    struct Rng(u64);
    impl Rng {
        fn next(&mut self) -> u64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            self.0
        }
        fn below(&mut self, limit: u64) -> u64 {
            self.next() % limit
        }
        fn pick<'a, T>(&mut self, items: &'a [T]) -> &'a T {
            &items[self.below(items.len() as u64) as usize]
        }
    }

    const KEYS: &[&str] = &[
        "version",
        "general",
        "style",
        "layout",
        "animation",
        "port",
        "autostart",
        "linkKey",
        "secureLink",
        "inputMethod",
        "updateChannel",
        "lastSeenVersion",
        "id",
        "profiles",
        "disabledKeys",
        "labels",
        "fontFamily",
        "fontSize",
        "opacity",
        "keyFill",
        "borderColor",
        "scale",
        "speed",
        "intensity",
        "type",
        "easing",
        "../evil",
        "a\"b",
        "__proto__",
        "",
    ];
    const STRINGS: &[&str] = &[
        "",
        "tkl",
        "../../etc/passwd",
        "a/b\\c",
        "#zzzzzz",
        "#12345678",
        "#123",
        "x\"; }</style>",
        "\u{0}\u{7}\u{1b}",
        "é🎹日本語",
        "stable",
        "latest",
        "hook",
        "rawinput",
        "0123456789abcdef0123456789abcdef",
        "1.2.0",
        "con",
        "KeyA",
        "Segoe UI",
    ];

    fn gen(rng: &mut Rng, depth: u32) -> Value {
        match rng.below(if depth >= 4 { 6 } else { 9 }) {
            0 => Value::Null,
            1 => json!(rng.below(2) == 0),
            2 => json!(rng.next() as i64),
            3 => json!([0.0, -1.5, 1e308, -1e308, 0.5, 7.0, 99999.0, 1e-300][rng.below(8) as usize]),
            4 => json!(*rng.pick(STRINGS)),
            5 => json!("x".repeat(rng.below(5000) as usize)),
            6 | 7 => Value::Array((0..rng.below(6)).map(|_| gen(rng, depth + 1)).collect()),
            _ => Value::Object(
                (0..rng.below(8))
                    .map(|_| (rng.pick(KEYS).to_string(), gen(rng, depth + 1)))
                    .collect(),
            ),
        }
    }

    /// Every rule a cleaned settings document must satisfy, however hostile the input was.
    fn assert_valid(settings: &Value, seed: u64) {
        let def = defaults();
        let general = &settings["general"];
        assert_eq!(settings["version"], json!(CURRENT_VERSION), "seed {seed}");
        let port = general["port"].as_f64().unwrap();
        assert!(
            (1024.0..=65535.0).contains(&port) && port.fract() == 0.0,
            "seed {seed}: port {port}"
        );
        for (path, lo, hi) in RANGES {
            let number = path
                .split('.')
                .fold(settings, |v, k| &v[k])
                .as_f64()
                .unwrap_or_else(|| panic!("seed {seed}: {path} is not a number"));
            assert!(
                number.is_finite() && number >= *lo && number <= *hi,
                "seed {seed}: {path} = {number}"
            );
        }
        for color_field in [
            "keyFill",
            "keyFillPressed",
            "borderColor",
            "borderColorPressed",
            "textColor",
            "textColorPressed",
            "glowColor",
        ] {
            assert!(
                is_hex_color(settings["style"][color_field].as_str().unwrap_or("")),
                "seed {seed}: colour {color_field}"
            );
        }
        let font = settings["style"]["fontFamily"].as_str().unwrap();
        assert!(
            !font.is_empty() && font.len() <= 80 && !font.contains(['"', '\\', '{', '}', ';', '<', '>']),
            "seed {seed}: font {font:?}"
        );
        assert!(
            is_id(settings["layout"]["id"].as_str().unwrap()),
            "seed {seed}: layout id"
        );
        for (id, profile) in settings["layout"]["profiles"].as_object().unwrap() {
            assert!(is_id(id), "seed {seed}: profile id {id:?}");
            for (code, pos) in profile
                .get("positions")
                .and_then(|x| x.as_object())
                .into_iter()
                .flatten()
            {
                let (x, y) = (pos["x"].as_f64().unwrap(), pos["y"].as_f64().unwrap());
                assert!(
                    code.len() <= 40 && (0.0..=100.0).contains(&x) && (0.0..=100.0).contains(&y),
                    "seed {seed}: position of {code:?}"
                );
            }
        }
        let key = general["linkKey"].as_str().unwrap();
        assert!(
            key.is_empty() || (key.len() >= 32 && key.chars().all(|c| c.is_ascii_hexdigit())),
            "seed {seed}: link key"
        );
        assert!(
            matches!(general["inputMethod"].as_str(), Some("hook" | "rawinput"))
                && matches!(general["updateChannel"].as_str(), Some("stable" | "latest")),
            "seed {seed}"
        );
        assert!(
            is_version(general["lastSeenVersion"].as_str().unwrap()),
            "seed {seed}: lastSeenVersion"
        );
        for field in ["type", "easing"] {
            assert!(
                is_ident(settings["animation"][field].as_str().unwrap()),
                "seed {seed}: animation {field}"
            );
        }
        // Same shape as the defaults (nothing extra, nothing missing) and stable after being written out and read back.
        assert_eq!(
            settings.as_object().unwrap().keys().collect::<Vec<_>>(),
            def.as_object().unwrap().keys().collect::<Vec<_>>(),
            "seed {seed}: top-level keys"
        );
        assert_eq!(
            &migrate(serde_json::from_str(&settings.to_string()).unwrap()),
            settings,
            "seed {seed}: not stable after a round trip"
        );
    }

    /// Paths of every setting in the defaults, e.g. ["style", "fontFamily"].
    fn leaf_paths(value: &Value, here: &mut Vec<String>, out: &mut Vec<Vec<String>>) {
        match value {
            Value::Object(entries) if !entries.is_empty() => {
                for (key, child) in entries {
                    here.push(key.clone());
                    leaf_paths(child, here, out);
                    here.pop();
                }
            }
            _ => out.push(here.clone()),
        }
    }

    #[test]
    fn random_garbage_never_panics_and_always_comes_out_valid() {
        for seed in 1..=4000u64 {
            let mut rng = Rng(seed.wrapping_mul(0x9E3779B97F4A7C15) | 1);
            assert_valid(&migrate(gen(&mut rng, 0)), seed);
        }
    }

    #[test]
    fn corrupting_single_settings_of_a_valid_file_is_always_repaired() {
        let mut paths = Vec::new();
        leaf_paths(&defaults(), &mut Vec::new(), &mut paths);
        for seed in 1..=6000u64 {
            let mut rng = Rng(seed.wrapping_mul(0xA24BAED4963EE407) | 1);
            let mut doc = defaults();
            for _ in 0..=rng.below(4) {
                let path = rng.pick(&paths).clone();
                let bad = if rng.below(3) == 0 {
                    json!(*rng.pick(STRINGS))
                } else {
                    gen(&mut rng, 3)
                };
                let mut cur = &mut doc;
                for k in &path[..path.len() - 1] {
                    cur = &mut cur[k.as_str()];
                }
                cur[path[path.len() - 1].as_str()] = bad;
            }
            if rng.below(4) == 0 {
                doc["layout"]["profiles"] = gen(&mut rng, 1);
            }
            assert_valid(&migrate(doc), seed);
        }
    }

    #[test]
    fn the_secure_link_key_check_rejects_everything_but_the_exact_key() {
        let key = "0123456789abcdef0123456789abcdef";
        let on = json!({ "general": { "secureLink": true, "linkKey": key } });
        let ok = |q: Option<&str>| crate::server::key_ok(&on, q);
        assert!(ok(Some(&format!("key={key}"))));
        assert!(ok(Some(&format!("a=1&key={key}&b=2"))));
        for bad in [
            "",
            "key=",
            "key=0123456789abcdef0123456789abcdeF",
            "key=0123456789abcdef0123456789abcde",
            &format!("key={key}0"),
            &format!("KEY={key}"),
            &format!("xkey={key}"),
            "key=%30123456789abcdef0123456789abcdef",
        ] {
            assert!(!ok(Some(bad)), "accepted {bad:?}");
        }
        assert!(!ok(None));
        // Switched on but with no key stored: refuse everything instead of opening up.
        assert!(!crate::server::key_ok(
            &json!({ "general": { "secureLink": true, "linkKey": "" } }),
            Some("key=")
        ));
        // Switched off: always open. Missing or odd settings never count as "on".
        assert!(crate::server::key_ok(
            &json!({ "general": { "secureLink": false, "linkKey": key } }),
            None
        ));
        assert!(crate::server::key_ok(&json!({}), None));
    }

    #[test]
    fn profiles_from_hostile_files_are_cleaned() {
        for seed in 1..=1500u64 {
            let mut rng = Rng(seed.wrapping_mul(0xD1B54A32D192ED03) | 1);
            let out = clean_profiles(&gen(&mut rng, 0));
            let map = out.as_object().unwrap();
            assert!(map.len() <= 50);
            for (id, profile) in map {
                assert!(is_id(id));
                assert!(
                    profile["disabledKeys"].as_array().unwrap().len() <= 300
                        && profile["disabledKeys"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .all(|k| k.as_str().is_some_and(|s| s.len() <= 40))
                );
                assert!(profile["labels"]
                    .as_object()
                    .unwrap()
                    .iter()
                    .all(|(k, v)| k.len() <= 40 && v.as_str().is_some_and(|s| s.chars().count() <= 16)));
            }
        }
    }
}

/// Devbuilds (tools/devbuild.mjs) have their own app identity ("com.keyoverlay.devbuild") so they can run beside an
/// installed
/// copy. On their very first start they take port 7881 (the installed copy uses 7878) and leave the automatic update
/// check off.
pub fn apply_devbuild_defaults(identifier: &str, cfg: &mut Value) {
    if identifier.ends_with(".devbuild") {
        cfg["general"]["port"] = json!(7881);
        cfg["general"]["autoCheckUpdates"] = json!(false);
    }
}

#[cfg(test)]
mod devbuild_tests {
    use super::*;
    #[test]
    fn only_devbuilds_get_their_own_port_and_no_update_check() {
        let mut dev = defaults();
        apply_devbuild_defaults("com.keyoverlay.devbuild", &mut dev);
        assert_eq!(
            (
                dev["general"]["port"].clone(),
                dev["general"]["autoCheckUpdates"].clone()
            ),
            (json!(7881), json!(false))
        );
        let mut real = defaults();
        apply_devbuild_defaults("com.keyoverlay.app", &mut real);
        assert_eq!(real, defaults());
    }
}

#[cfg(test)]
mod position_tests {
    use super::*;
    #[test]
    fn moved_keys_are_kept_clamped_and_junk_is_dropped() {
        let raw = json!({ "wasd": { "positions": {
            "KeyW": { "x": 1.256, "y": 0 }, "KeyA": { "x": -5, "y": 1e9 }, "KeyS": { "x": "1", "y": 2 }, "KeyD": { "x": 3 }, "": { "x": 1, "y": 1 } } } });
        let out = clean_profiles(&raw);
        let pos = &out["wasd"]["positions"];
        assert_eq!(pos["KeyW"], json!({ "x": 1.26, "y": 0.0 }));
        assert_eq!(pos["KeyA"], json!({ "x": 0.0, "y": 100.0 }));
        assert!(pos.get("KeyS").is_none() && pos.get("KeyD").is_none() && pos.get("").is_none());
        // A profile without moved keys has no "positions" entry at all (old settings files stay byte-identical).
        assert!(clean_profiles(&json!({ "x": { "positions": {} } }))["x"]
            .get("positions")
            .is_none());
        assert!(clean_profiles(&json!({ "x": { "positions": "nope" } }))["x"]
            .get("positions")
            .is_none());
    }
}
