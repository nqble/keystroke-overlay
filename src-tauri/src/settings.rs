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
            // Background update check (about once an hour while the app runs, and when the settings window opens). Updates are
            // never installed without the user clicking the update button.
            "autoCheckUpdates": true,
            // How keys are read: "hook" (standard, default) or "rawinput" (compatibility, for games that block hooks).
            "inputMethod": "hook",
            // Optional "secure link": when on, the overlay link carries a private key (?key=...) and the local server refuses
            // requests without it. Off by default (plain link, no extra step). The key is never sent to the overlay itself.
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
        "animation": { "type": "pressdown", "speed": 120, "easing": "default", "intensity": 1.0 }
    })
}

type Migration = fn(&mut Value);

/// MIGRATIONS[i] upgrades a config from version (i+1) to (i+2).
const MIGRATIONS: &[Migration] = &[v1_to_v2];

/// v1 stored one global `layout.disabledKeys` / `layout.labels`.
/// v2 stores them per layout in `layout.profiles[layoutId]`.
fn v1_to_v2(v: &mut Value) {
    let Some(layout) = v.get_mut("layout").and_then(|l| l.as_object_mut()) else { return };
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

pub fn migrate(mut v: Value) -> Value {
    if !v.is_object() {
        return defaults();
    }
    let mut ver = v.get("version").and_then(|x| x.as_u64()).unwrap_or(1).max(1);
    while ver < CURRENT_VERSION {
        if let Some(m) = MIGRATIONS.get((ver - 1) as usize) {
            m(&mut v);
        }
        ver += 1;
    }
    v["version"] = json!(CURRENT_VERSION);
    let mut out = defaults();
    merge(&mut out, &v);
    sanitize(&mut out, &defaults());
    out
}

/// (path, min, max) for numeric settings. Anything out of range is clamped.
const RANGES: &[(&str, f64, f64)] = &[
    ("general.port", 1024.0, 65535.0), ("style.borderWidth", 0.0, 20.0), ("style.radius", 0.0, 100.0),
    ("style.fontSize", 0.0, 120.0), ("style.fontWeight", 100.0, 900.0), ("style.glowSize", 0.0, 100.0),
    ("style.keySize", 16.0, 200.0), ("style.gap", 0.0, 60.0), ("style.scale", 0.2, 4.0),
    ("style.opacity", 0.0, 1.0), ("animation.speed", 0.0, 2000.0), ("animation.intensity", 0.0, 4.0),
];

fn is_hex_color(s: &str) -> bool {
    s.starts_with('#') && (s.len() == 7 || s.len() == 9) && s[1..].chars().all(|c| c.is_ascii_hexdigit())
}
fn is_ident(s: &str) -> bool {
    !s.is_empty() && s.len() <= 40 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}
/// Layout ids may also contain dots and spaces (they come from user-made files).
fn is_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 40 && s.chars().all(|c| c.is_ascii_alphanumeric() || "-_. ".contains(c))
}
fn is_version(s: &str) -> bool {
    s.len() <= 24 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
}

fn clean_strings(v: Option<&Value>) -> Value {
    Value::Array(v.and_then(|a| a.as_array()).map(|a| a.iter().filter(|x| x.as_str().is_some_and(|s| s.len() <= 40)).take(300).cloned().collect()).unwrap_or_default())
}
fn clean_labels(v: Option<&Value>) -> Value {
    Value::Object(v.and_then(|o| o.as_object()).map(|o| o.iter()
        .filter(|(k, x)| k.len() <= 40 && x.as_str().is_some_and(|s| s.chars().count() <= 16))
        .take(300).map(|(k, x)| (k.clone(), x.clone())).collect()).unwrap_or_default())
}
pub fn clean_profiles(v: &Value) -> Value {
    let mut out = Map::new();
    if let Some(o) = v.as_object() {
        for (id, p) in o.iter().filter(|(id, _)| is_id(id)).take(50) {
            let mut e = Map::new();
            e.insert("disabledKeys".into(), clean_strings(p.get("disabledKeys")));
            e.insert("labels".into(), clean_labels(p.get("labels")));
            out.insert(id.clone(), Value::Object(e));
        }
    }
    Value::Object(out)
}

/// Make arbitrary JSON (hand-edited file, imported preset) safe to use:
/// wrong types fall back to defaults, numbers are clamped, colours/ids validated.
pub fn sanitize(v: &mut Value, def: &Value) {
    fn walk(v: &mut Value, def: &Value, path: &str) {
        match def {
            Value::Object(dm) => {
                if path == "layout.profiles" { *v = clean_profiles(v); return; }   // free-form map
                if !v.is_object() { *v = def.clone(); return; }
                let vm = v.as_object_mut().unwrap();
                vm.retain(|k, _| dm.contains_key(k));
                for (k, dv) in dm {
                    let p = if path.is_empty() { k.clone() } else { format!("{path}.{k}") };
                    match vm.get_mut(k) {
                        Some(x) => walk(x, dv, &p),
                        None => { vm.insert(k.clone(), dv.clone()); }
                    }
                }
            }
            Value::Number(_) => {
                let n = v.as_f64().filter(|n| n.is_finite());
                let (lo, hi) = RANGES.iter().find(|r| r.0 == path).map(|r| (r.1, r.2)).unwrap_or((f64::MIN, f64::MAX));
                match n {
                    // Valid and in range: leave the value exactly as it was.
                    Some(n) if n >= lo && n <= hi && (path != "general.port" || n.fract() == 0.0) => {}
                    Some(_) if path == "general.port" => *v = def.clone(), // invalid port: back to the default
                    Some(n) => *v = json!(n.clamp(lo, hi)),
                    None => *v = def.clone(),
                }
            }
            Value::Bool(_) => if !v.is_boolean() { *v = def.clone() },
            Value::String(d) => {
                let ok = match v.as_str() {
                    Some(s) if d.starts_with('#') => is_hex_color(s),
                    Some(s) if path == "style.fontFamily" => !s.is_empty() && s.len() <= 80 && !s.contains(['"', '\\', '{', '}', ';', '<', '>']),
                    Some(s) if path == "general.lastSeenVersion" => is_version(s),
                    Some(s) if path == "layout.id" => is_id(s),
                    Some(s) if path == "general.updateChannel" => s == "stable" || s == "latest",
                    Some(s) if path == "general.inputMethod" => s == "hook" || s == "rawinput",
                    Some(s) if path == "general.linkKey" => s.is_empty() || (s.len() >= 32 && s.len() <= 64 && s.chars().all(|c| c.is_ascii_hexdigit())),
                    Some(s) => is_ident(s),
                    None => false,
                };
                if !ok { *v = def.clone(); }
            }
            Value::Array(_) => *v = clean_strings(Some(v)),
            Value::Null => {}
        }
    }
    walk(v, def, "");
}

/// A fresh private link key: 128 bits from the operating system's secure random generator, as 32 hex characters.
pub fn new_key() -> Result<String, String> {
    let mut b = [0u8; 16];
    getrandom::fill(&mut b).map_err(|e| format!("couldn't create a secure key: {e}"))?;
    Ok(b.iter().map(|x| format!("{x:02x}")).collect())
}

/// Settings as the overlay is allowed to see them: everything except the private link key.
pub fn public_settings(v: &Value) -> Value {
    let mut s = v.clone();
    if let Some(g) = s.get_mut("general").and_then(|g| g.as_object_mut()) { g.remove("linkKey"); }
    s
}

/// Deep-merge `src` into `dst` (objects recurse, everything else replaces).
pub fn merge(dst: &mut Value, src: &Value) {
    match (dst, src) {
        (Value::Object(d), Value::Object(s)) => {
            for (k, sv) in s {
                match d.get_mut(k) {
                    Some(dv) if dv.is_object() && sv.is_object() => merge(dv, sv),
                    _ => {
                        d.insert(k.clone(), sv.clone());
                    }
                }
            }
        }
        (d, s) => *d = s.clone(),
    }
}

fn read_json(p: &Path) -> Option<Value> {
    std::fs::read_to_string(p).ok().and_then(|s| serde_json::from_str::<Value>(&s).ok()).filter(|v| v.is_object())
}

/// Loads settings. If settings.json is missing or corrupt, the last good copy (settings.json.bak) is used.
pub fn load(path: &Path) -> Value {
    read_json(path)
        .or_else(|| read_json(&path.with_extension("json.bak")))
        .map(migrate)
        .unwrap_or_else(defaults)
}

pub fn save(path: &Path, v: &Value) -> std::io::Result<()> {
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p)?;
    }
    // Keep the previous good file as a backup (only if it is itself valid).
    if read_json(path).is_some() { let _ = std::fs::copy(path, path.with_extension("json.bak")); }
    // Write-then-rename so a crash can never leave a half-written config.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(v).unwrap())?;
    std::fs::rename(tmp, path)
}

/// Per-user data folders (settings, fonts, presets, user layouts/animations/themes).
pub struct Paths {
    pub root: PathBuf,
}
impl Paths {
    pub fn settings(&self) -> PathBuf { self.root.join("settings.json") }
    pub fn fonts(&self) -> PathBuf { self.root.join("fonts") }
    pub fn presets(&self) -> PathBuf { self.root.join("presets") }
    pub fn user(&self, kind: &str) -> PathBuf { self.root.join(kind) } // layouts | animations | themes
    pub fn ensure(&self) {
        for d in ["fonts", "presets", "layouts", "animations", "themes"] {
            let _ = std::fs::create_dir_all(self.root.join(d));
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
        let m = migrate(json!({ "version": 2, "style": { "radius": 20 } }));
        assert_eq!(m["style"]["radius"].as_f64(), Some(20.0));
        assert_eq!(m["general"]["port"], json!(7878));
        assert_eq!(m["version"], json!(CURRENT_VERSION));
    }
    #[test]
    fn bad_values_are_repaired() {
        let m = migrate(json!({ "version": 2, "general": { "port": 80 }, "style": { "keySize": "big", "opacity": 9, "keyFill": "red", "fontFamily": "x\"; }" },
                                "animation": { "type": "../../evil", "speed": -5 },
                                "layout": { "profiles": { "tkl": { "disabledKeys": [1, "KeyA"], "labels": { "KeyA": "ok", "KeyB": 5 } }, "../evil": {} } } }));
        assert_eq!(m["general"]["port"], json!(7878));
        assert_eq!(m["style"]["keySize"], defaults()["style"]["keySize"]);
        assert_eq!(m["style"]["opacity"].as_f64(), Some(1.0));
        assert_eq!(m["style"]["keyFill"], defaults()["style"]["keyFill"]);
        assert_eq!(m["style"]["fontFamily"], defaults()["style"]["fontFamily"]);
        assert_eq!(m["animation"]["type"], defaults()["animation"]["type"]);
        assert_eq!(m["animation"]["speed"].as_f64(), Some(0.0));
        assert_eq!(m["layout"]["profiles"]["tkl"]["disabledKeys"], json!(["KeyA"]));
        assert_eq!(m["layout"]["profiles"]["tkl"]["labels"], json!({ "KeyA": "ok" }));
        assert!(m["layout"]["profiles"].get("../evil").is_none());
    }
    #[test]
    fn defaults_are_stable_under_sanitize() {
        assert_eq!(migrate(defaults()), defaults());
    }
    #[test]
    fn v1_settings_migrate_into_a_profile_without_losing_anything() {
        let old = json!({ "version": 1, "general": { "port": 9000, "autoCheckUpdates": true },
                          "layout": { "id": "tsb", "disabledKeys": ["KeyQ"], "labels": { "Space": "Jump" } } });
        let m = migrate(old);
        assert_eq!(m["version"], json!(2));
        assert_eq!(m["general"]["port"], json!(9000));
        assert_eq!(m["general"]["autoCheckUpdates"], json!(true));
        assert_eq!(m["layout"]["id"], json!("tsb"));
        assert_eq!(m["layout"]["profiles"]["tsb"]["disabledKeys"], json!(["KeyQ"]));
        assert_eq!(m["layout"]["profiles"]["tsb"]["labels"]["Space"], json!("Jump"));
        assert!(m["layout"].get("disabledKeys").is_none() && m["layout"].get("labels").is_none());
    }
    #[test]
    fn update_channel_is_limited_to_stable_or_latest() {
        assert_eq!(migrate(json!({ "version": 2 }))["general"]["updateChannel"], json!("stable"));
        assert_eq!(migrate(json!({ "version": 2, "general": { "updateChannel": "latest" } }))["general"]["updateChannel"], json!("latest"));
        assert_eq!(migrate(json!({ "version": 2, "general": { "updateChannel": "nightly" } }))["general"]["updateChannel"], json!("stable"));
        assert_eq!(migrate(json!({ "version": 2, "general": { "updateChannel": 5 } }))["general"]["updateChannel"], json!("stable"));
    }
    #[test]
    fn input_method_is_limited_to_hook_or_rawinput() {
        assert_eq!(migrate(json!({ "version": 2 }))["general"]["inputMethod"], json!("hook"));
        assert_eq!(migrate(json!({ "version": 2, "general": { "inputMethod": "rawinput" } }))["general"]["inputMethod"], json!("rawinput"));
        assert_eq!(migrate(json!({ "version": 2, "general": { "inputMethod": "driver" } }))["general"]["inputMethod"], json!("hook"));
        assert_eq!(migrate(json!({ "version": 2, "general": { "inputMethod": 3 } }))["general"]["inputMethod"], json!("hook"));
    }
    #[test]
    fn secure_link_defaults_off_and_key_is_validated() {
        let m = migrate(json!({ "version": 2 }));
        assert_eq!(m["general"]["secureLink"], json!(false));
        assert_eq!(m["general"]["linkKey"], json!(""));
        let good = "0123456789abcdef0123456789abcdef";
        assert_eq!(migrate(json!({ "version": 2, "general": { "secureLink": true, "linkKey": good } }))["general"]["linkKey"], json!(good));
        for bad in ["short", "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", "../../etc", &"a".repeat(65)] {
            assert_eq!(migrate(json!({ "version": 2, "general": { "linkKey": bad } }))["general"]["linkKey"], json!(""), "{bad}");
        }
        assert_eq!(migrate(json!({ "version": 2, "general": { "secureLink": "yes" } }))["general"]["secureLink"], json!(false));
    }
    #[test]
    fn new_keys_are_random_hex_and_never_shown_to_the_overlay() {
        let (a, b) = (new_key().unwrap(), new_key().unwrap());
        assert_eq!(a.len(), 32);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
        let mut s = defaults(); s["general"]["linkKey"] = json!(a);
        let p = public_settings(&s);
        assert!(p["general"].get("linkKey").is_none());
        assert_eq!(p["general"]["port"], s["general"]["port"]);   // everything else is kept
    }
    #[test]
    fn corrupt_settings_fall_back_to_the_backup() {
        let dir = std::env::temp_dir().join(format!("ko-settings-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let f = dir.join("settings.json");
        let mut s = defaults(); s["general"]["autoCheckUpdates"] = json!(true);
        save(&f, &s).unwrap();                 // first save: no backup yet
        save(&f, &s).unwrap();                 // second save: previous file becomes the backup
        std::fs::write(&f, "{ this is not json").unwrap();   // simulate corruption
        assert_eq!(load(&f)["general"]["autoCheckUpdates"], json!(true));
        std::fs::remove_dir_all(&dir).ok();
    }
    #[test]
    fn profiles_and_version_survive_a_round_trip() {
        let mut s = defaults();
        s["general"]["lastSeenVersion"] = json!("1.1.2");
        s["general"]["autoCheckUpdates"] = json!(true);
        s["layout"]["profiles"] = json!({ "wasd": { "disabledKeys": ["KeyE"], "labels": { "Space": "⎵" } }, "my layout.v2": { "disabledKeys": [], "labels": {} } });
        assert_eq!(migrate(s.clone()), s);
    }
}
