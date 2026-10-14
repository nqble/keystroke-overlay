//! Settings storage: versioned JSON + migration chain + defaults merging.
//!
//! The file on disk is `{ "version": N, ... }`. On load it is migrated one
//! step at a time up to `CURRENT_VERSION`, then deep-merged on top of
//! `defaults()` so newly added settings always have a value.
//!
//! HOW TO ADD A SETTING: add it to `defaults()` (and to the control list in
//! ui/settings/settings.js). No migration is needed for purely additive changes.
//! HOW TO RENAME/RESTRUCTURE: bump CURRENT_VERSION and add a step to `MIGRATIONS`.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub const CURRENT_VERSION: u64 = 1;

pub fn defaults() -> Value {
    json!({
        "version": CURRENT_VERSION,
        "general": { "port": 7878, "autostart": false, "minimizeToTray": true, "openOnLaunch": true, "autoCheckUpdates": false },
        "layout": { "id": "tkl", "disabledKeys": [], "labels": {} },
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
/// Example for a future v2:  `|v| { /* rename style.keyFill -> style.fill */ }`
const MIGRATIONS: &[Migration] = &[];

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
    ("style.fontSize", 6.0, 120.0), ("style.fontWeight", 100.0, 900.0), ("style.glowSize", 0.0, 100.0),
    ("style.keySize", 16.0, 200.0), ("style.gap", 0.0, 60.0), ("style.scale", 0.2, 4.0),
    ("style.opacity", 0.0, 1.0), ("animation.speed", 0.0, 2000.0), ("animation.intensity", 0.0, 4.0),
];

fn is_hex_color(s: &str) -> bool {
    s.starts_with('#') && (s.len() == 7 || s.len() == 9) && s[1..].chars().all(|c| c.is_ascii_hexdigit())
}
fn is_ident(s: &str) -> bool {
    !s.is_empty() && s.len() <= 40 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Make arbitrary JSON (hand-edited file, imported preset) safe to use:
/// wrong types fall back to defaults, numbers are clamped, colours/ids validated.
pub fn sanitize(v: &mut Value, def: &Value) {
    fn walk(v: &mut Value, def: &Value, path: &str) {
        match def {
            Value::Object(dm) => {
                if !v.is_object() { *v = def.clone(); return; }
                let vm = v.as_object_mut().unwrap();
                vm.retain(|k, _| dm.contains_key(k) || path == "layout.labels");
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
                    Some(s) => is_ident(s),
                    None => false,
                };
                if !ok { *v = def.clone(); }
            }
            Value::Array(_) => {
                let cleaned: Vec<Value> = v.as_array().map(|a| a.iter().filter(|x| x.as_str().is_some_and(|s| s.len() <= 40)).take(300).cloned().collect()).unwrap_or_default();
                *v = Value::Array(cleaned);
            }
            Value::Null => {}
        }
    }
    walk(v, def, "");
    // layout.labels: free-form code -> short text map.
    let labels = v["layout"]["labels"].as_object().cloned().unwrap_or_default();
    v["layout"]["labels"] = Value::Object(labels.into_iter().filter(|(k, x)| k.len() <= 40 && x.as_str().is_some_and(|s| s.chars().count() <= 16)).take(300).collect());
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

pub fn load(path: &Path) -> Value {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .map(migrate)
        .unwrap_or_else(defaults)
}

pub fn save(path: &Path, v: &Value) -> std::io::Result<()> {
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p)?;
    }
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
        let m = migrate(json!({ "version": 1, "style": { "radius": 20 } }));
        assert_eq!(m["style"]["radius"].as_f64(), Some(20.0));
        assert_eq!(m["general"]["port"], json!(7878));
        assert_eq!(m["version"], json!(CURRENT_VERSION));
    }
    #[test]
    fn bad_values_are_repaired() {
        let m = migrate(json!({ "general": { "port": 80 }, "style": { "keySize": "big", "opacity": 9, "keyFill": "red", "fontFamily": "x\"; }" },
                                "animation": { "type": "../../evil", "speed": -5 }, "layout": { "disabledKeys": [1, "KeyA"], "labels": { "KeyA": "ok", "KeyB": 5 } } }));
        assert_eq!(m["general"]["port"], json!(7878));
        assert_eq!(m["style"]["keySize"], defaults()["style"]["keySize"]);
        assert_eq!(m["style"]["opacity"].as_f64(), Some(1.0));
        assert_eq!(m["style"]["keyFill"], defaults()["style"]["keyFill"]);
        assert_eq!(m["style"]["fontFamily"], defaults()["style"]["fontFamily"]);
        assert_eq!(m["animation"]["type"], defaults()["animation"]["type"]);
        assert_eq!(m["animation"]["speed"].as_f64(), Some(0.0));
        assert_eq!(m["layout"]["disabledKeys"], json!(["KeyA"]));
        assert_eq!(m["layout"]["labels"], json!({ "KeyA": "ok" }));
    }
    #[test]
    fn defaults_are_stable_under_sanitize() {
        assert_eq!(migrate(defaults()), defaults());
    }
}
