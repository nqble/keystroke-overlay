//! User-managed files: custom fonts and style presets (all stored in the app's data folder).

use crate::platform;
use crate::server;
use crate::state::AppState;
use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt as _;

// ---------------------------------------------------------------- fonts
#[tauri::command]
pub fn list_fonts(st: State<AppState>) -> Vec<String> {
    server::font_files(&st.shared.paths)
}

#[tauri::command]
pub async fn add_font(app: AppHandle, st: State<'_, AppState>) -> Result<Option<String>, String> {
    let Some(p) = app
        .dialog()
        .file()
        .add_filter("Fonts", &["ttf", "otf", "woff", "woff2"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let src = p.into_path().map_err(|e| e.to_string())?;
    let name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("bad file name")?
        .to_string();
    std::fs::copy(&src, st.shared.paths.fonts().join(&name)).map_err(|e| e.to_string())?;
    let _ = st.shared.cfg_tx.send("assets");
    Ok(Some(name))
}

#[tauri::command]
pub fn remove_font(st: State<AppState>, name: String) -> Result<(), String> {
    if name.contains(['/', '\\']) {
        return Err("bad name".into());
    }
    std::fs::remove_file(st.shared.paths.fonts().join(name)).map_err(|e| e.to_string())?;
    let _ = st.shared.cfg_tx.send("assets");
    Ok(())
}

#[tauri::command]
pub fn open_folder(st: State<AppState>, kind: String) {
    let p = match kind.as_str() {
        "fonts" | "presets" | "layouts" | "animations" | "themes" => st.shared.paths.user(&kind),
        _ => st.shared.paths.root.clone(),
    };
    let _ = std::fs::create_dir_all(&p);
    platform::open_folder(&p);
}

// ---------------------------------------------------------------- style presets (style + animation), stored as
// presets/<name>.json
fn clean_name(n: &str) -> Result<String, String> {
    let n: String = n.trim().chars().filter(|c| !r#"\/:*?"<>|"#.contains(*c)).collect();
    if n.is_empty() {
        Err("Enter a preset name".into())
    } else {
        Ok(n)
    }
}

#[tauri::command]
pub fn list_presets(st: State<AppState>) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(st.shared.paths.presets())
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| e.path().file_stem()?.to_str().map(String::from))
        .collect();
    v.sort();
    v
}

#[tauri::command]
pub fn save_preset(st: State<AppState>, name: String, data: Value) -> Result<(), String> {
    let p = st.shared.paths.presets().join(format!("{}.json", clean_name(&name)?));
    std::fs::write(p, serde_json::to_string_pretty(&data).unwrap()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_preset(st: State<AppState>, name: String) -> Result<Value, String> {
    let p = st.shared.paths.presets().join(format!("{}.json", clean_name(&name)?));
    serde_json::from_str(&std::fs::read_to_string(p).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_preset(st: State<AppState>, name: String) -> Result<(), String> {
    std::fs::remove_file(st.shared.paths.presets().join(format!("{}.json", clean_name(&name)?)))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_preset(app: AppHandle, data: Value) -> Result<bool, String> {
    let Some(p) = app
        .dialog()
        .file()
        .add_filter("Style preset", &["json"])
        .set_file_name("my-style.json")
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let path = p.into_path().map_err(|e| e.to_string())?;
    std::fs::write(path, serde_json::to_string_pretty(&data).unwrap()).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn import_preset(app: AppHandle) -> Result<Option<Value>, String> {
    let Some(p) = app
        .dialog()
        .file()
        .add_filter("Style preset", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = p.into_path().map_err(|e| e.to_string())?;
    let v: Value = serde_json::from_str(&std::fs::read_to_string(path).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Not a valid preset: {e}"))?;
    Ok(Some(v))
}

// ---------------------------------------------------------------- layouts the user made (stored in layouts/<id>.json)
/// Makes a new layout that starts as a copy of the full-size keyboard, selects it, and returns its id.
#[tauri::command]
pub fn create_layout(app: AppHandle, st: State<AppState>, name: String) -> Result<String, String> {
    let name: String = name.trim().chars().filter(|c| !c.is_control()).take(30).collect();
    if name.is_empty() {
        return Err("Enter a layout name".into());
    }
    let all = server::layouts(&st.shared.paths);
    if all.iter().filter(|l| l["user"] == true).count() >= 20 {
        return Err("Max layouts reached (20)".into());
    }
    let base: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let base = if base.is_empty() {
        "layout".to_string()
    } else {
        base.chars().take(30).collect()
    };
    let mut id = base.clone();
    let mut n = 2;
    while all.iter().any(|l| l["id"] == id.as_str()) {
        id = format!("{base}-{n}");
        n += 1;
    }
    let full = all
        .iter()
        .find(|l| l["id"] == "full")
        .ok_or("The full-size layout is missing")?;
    let doc = serde_json::json!({ "id": id, "name": name, "keys": full["keys"] });
    let dir = st.shared.paths.user("layouts");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(
        dir.join(format!("{id}.json")),
        serde_json::to_string_pretty(&doc).unwrap(),
    )
    .map_err(|e| e.to_string())?;
    crate::tray::refresh_tray_layouts(&app);
    crate::debug::log(format!("layout created: {id}"));
    // the overlay (OBS and the preview) must re-read its list of layouts before it is told to switch
    let _ = st.shared.cfg_tx.send("assets");
    crate::tray::set_layout_inner(&app, &id)?;
    Ok(id)
}

/// Deletes a layout the user made. Built-in layouts cannot be deleted.
#[tauri::command]
pub fn delete_layout(app: AppHandle, st: State<AppState>, id: String) -> Result<(), String> {
    let dir = st.shared.paths.user("layouts");
    let file = std::fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .find(|p| {
            std::fs::read_to_string(p)
                .ok()
                .and_then(|s| serde_json::from_str::<Value>(&s).ok())
                .is_some_and(|v| v["id"] == id.as_str())
        })
        .ok_or("Built-in layouts can't be deleted")?;
    std::fs::remove_file(file).map_err(|e| e.to_string())?;
    {
        let mut s = st.shared.settings.write().unwrap();
        if let Some(p) = s["layout"]["profiles"].as_object_mut() {
            p.remove(&id);
        }
        let cur = s["layout"]["id"] == id.as_str();
        if cur {
            s["layout"]["id"] = serde_json::json!("tkl");
        }
        crate::settings::save(&st.shared.paths.settings(), &s).map_err(|e| e.to_string())?;
        cur
    };
    crate::tray::refresh_tray_layouts(&app);
    let _ = st.shared.cfg_tx.send("assets"); // the overlay (OBS and the preview) must re-read its list of layouts
    crate::state::announce(&app);
    crate::state::sync_tray(&app);
    crate::debug::log(format!("layout deleted: {id}"));
    Ok(())
}

// ---------------------------------------------------------------- export / import of the layouts the user made
const FILE_TAG: &str = "keystroke-overlay-layouts";
const MAX_USER_LAYOUTS: usize = 20;

fn slug(name: &str) -> String {
    let s: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(30)
        .collect();
    if s.is_empty() {
        "layout".into()
    } else {
        s
    }
}

/// The document written by "Export layouts": every layout the user made plus their key edits (hidden keys, labels).
pub fn export_doc(all: &[Value], settings: &Value) -> Result<Value, String> {
    let mine: Vec<&Value> = all.iter().filter(|l| l["user"] == true).collect();
    if mine.is_empty() {
        return Err("You haven't made any layouts yet".into());
    }
    let layouts: Vec<Value> = mine
        .iter()
        .map(|l| serde_json::json!({ "id": l["id"], "name": l["name"], "keys": l["keys"] }))
        .collect();
    let mut profiles = serde_json::Map::new();
    for l in &mine {
        if let Some(p) = l["id"].as_str().and_then(|id| settings["layout"]["profiles"].get(id)) {
            profiles.insert(l["id"].as_str().unwrap().to_string(), p.clone());
        }
    }
    Ok(serde_json::json!({ "format": FILE_TAG, "version": 1, "layouts": layouts, "profiles": profiles }))
}

/// Reads an exported file (or a single hand-written layout), cleans it, and writes the new layouts into `dir`.
/// Returns (imported ids with their cleaned key edits, number skipped). Ids that already exist get a number added.
pub fn import_doc(
    top: &Value,
    existing: &[Value],
    dir: &std::path::Path,
) -> Result<(Vec<(String, Value)>, usize), String> {
    let items: Vec<Value> = match top["layouts"].as_array() {
        Some(a) => a.clone(),
        None if top["keys"].is_array() => vec![top.clone()],
        None => return Err("This file doesn't contain any layouts".into()),
    };
    let mut have: Vec<String> = existing
        .iter()
        .filter_map(|l| l["id"].as_str().map(String::from))
        .collect();
    let mut count = existing.iter().filter(|l| l["user"] == true).count();
    let (mut out, mut skipped) = (Vec::new(), 0);
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    for it in items.iter().take(MAX_USER_LAYOUTS) {
        let name: String = it["name"]
            .as_str()
            .unwrap_or("Imported layout")
            .trim()
            .chars()
            .filter(|c| !c.is_control())
            .take(30)
            .collect();
        let keys: Vec<Value> = it["keys"]
            .as_array()
            .map(|a| {
                a.iter()
                    .take(300)
                    .filter(|k| {
                        k["code"].as_str().is_some_and(|c| !c.is_empty() && c.len() <= 40)
                            && k["x"].is_number()
                            && k["y"].is_number()
                    })
                    .map(|k| {
                        let mut o = serde_json::json!({ "code": k["code"], "x": k["x"], "y": k["y"] });
                        for f in ["w", "h"] {
                            if k[f].is_number() {
                                o[f] = k[f].clone();
                            }
                        }
                        if let Some(l) = k["label"].as_str() {
                            o["label"] = Value::String(l.chars().take(16).collect());
                        }
                        o
                    })
                    .collect()
            })
            .unwrap_or_default();
        if keys.is_empty() || name.is_empty() || count >= MAX_USER_LAYOUTS {
            skipped += 1;
            continue;
        }
        let base = slug(it["id"].as_str().unwrap_or(&name));
        let (mut id, mut n) = (base.clone(), 2);
        while have.contains(&id) {
            id = format!("{base}-{n}");
            n += 1;
        }
        let doc = serde_json::json!({ "id": id, "name": name, "keys": keys });
        std::fs::write(
            dir.join(format!("{id}.json")),
            serde_json::to_string_pretty(&doc).unwrap(),
        )
        .map_err(|e| e.to_string())?;
        let old_id = it["id"].as_str().unwrap_or("");
        let prof = crate::settings::clean_profiles(
            &serde_json::json!({ "x": top["profiles"].get(old_id).cloned().unwrap_or(Value::Null) }),
        );
        out.push((id.clone(), prof["x"].clone()));
        have.push(id);
        count += 1;
    }
    Ok((out, skipped))
}

#[tauri::command]
pub async fn export_layouts(app: AppHandle, st: State<'_, AppState>) -> Result<Option<usize>, String> {
    let all = server::layouts(&st.shared.paths);
    let doc = export_doc(&all, &st.shared.settings.read().unwrap())?;
    let Some(p) = app
        .dialog()
        .file()
        .add_filter("Keystroke Overlay layouts", &["json"])
        .set_file_name("my-layouts.json")
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = p.into_path().map_err(|e| e.to_string())?;
    std::fs::write(path, serde_json::to_string_pretty(&doc).unwrap()).map_err(|e| e.to_string())?;
    Ok(Some(doc["layouts"].as_array().map_or(0, |a| a.len())))
}

/// Returns None if the user cancelled, otherwise (layouts added, layouts skipped).
#[tauri::command]
pub async fn import_layouts(app: AppHandle, st: State<'_, AppState>) -> Result<Option<(usize, usize)>, String> {
    let Some(p) = app
        .dialog()
        .file()
        .add_filter("Keystroke Overlay layouts", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = p.into_path().map_err(|e| e.to_string())?;
    if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > 2_000_000 {
        return Err("That file is too big to be a layout file".into());
    }
    let top: Value = serde_json::from_str(&std::fs::read_to_string(path).map_err(|e| e.to_string())?)
        .map_err(|_| "That isn't a valid layout file")?;
    let (added, skipped) = import_doc(
        &top,
        &server::layouts(&st.shared.paths),
        &st.shared.paths.user("layouts"),
    )?;
    {
        let mut s = st.shared.settings.write().unwrap();
        for (id, prof) in &added {
            let empty = prof["disabledKeys"].as_array().is_none_or(|a| a.is_empty())
                && prof["labels"].as_object().is_none_or(|o| o.is_empty());
            if !empty {
                s["layout"]["profiles"][id] = prof.clone();
            }
        }
        crate::settings::save(&st.shared.paths.settings(), &s).map_err(|e| e.to_string())?;
    }
    crate::tray::refresh_tray_layouts(&app);
    let _ = st.shared.cfg_tx.send("assets"); // the overlay (OBS and the preview) must re-read its list of layouts
    crate::state::announce(&app);
    crate::debug::log(format!("layouts imported: {} added, {skipped} skipped", added.len()));
    Ok(Some((added.len(), skipped)))
}

#[cfg(test)]
mod layout_file_tests {
    use super::*;
    use serde_json::json;
    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("ko-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }
    fn layout(id: &str, user: bool) -> Value {
        json!({ "id": id, "name": id, "user": user, "keys": [{ "code": "KeyA", "x": 0, "y": 0, "label": "A" }] })
    }

    #[test]
    fn export_needs_a_user_layout_and_keeps_key_edits() {
        assert!(export_doc(&[layout("tkl", false)], &json!({})).is_err());
        let s = json!({ "layout": { "profiles": { "mine": { "disabledKeys": ["KeyB"], "labels": {} }, "tkl": { "disabledKeys": ["KeyC"], "labels": {} } } } });
        let d = export_doc(&[layout("tkl", false), layout("mine", true)], &s).unwrap();
        assert_eq!(d["layouts"].as_array().unwrap().len(), 1);
        assert!(d["layouts"][0].get("user").is_none());
        assert_eq!(d["profiles"]["mine"]["disabledKeys"], json!(["KeyB"]));
        assert!(d["profiles"].get("tkl").is_none());
    }

    #[test]
    fn import_round_trip_renames_clashes_and_cleans_bad_data() {
        let dir = tmp("import");
        let doc = json!({ "layouts": [
            { "id": "tkl", "name": "Mine", "keys": [{ "code": "KeyA", "x": 0, "y": 0 }, { "code": 5, "x": 0, "y": 0 }, { "code": "KeyB" }] },
            { "id": "empty", "name": "No keys", "keys": [] } ],
            "profiles": { "tkl": { "disabledKeys": ["KeyA", 7], "labels": { "KeyA": "ok" } } } });
        let (added, skipped) = import_doc(&doc, &[layout("tkl", false)], &dir).unwrap();
        assert_eq!(skipped, 1);
        assert_eq!(added[0].0, "tkl-2");
        let saved: Value = serde_json::from_str(&std::fs::read_to_string(dir.join("tkl-2.json")).unwrap()).unwrap();
        assert_eq!(saved["keys"].as_array().unwrap().len(), 1);
        assert_eq!(added[0].1["disabledKeys"], json!(["KeyA"]));
        assert!(import_doc(&json!({ "nothing": 1 }), &[], &dir).is_err());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn import_stops_at_twenty_layouts() {
        let dir = tmp("cap");
        let existing: Vec<Value> = (0..19).map(|i| layout(&format!("u{i}"), true)).collect();
        let doc = json!({ "layouts": [ layout("a", true), layout("b", true), layout("c", true) ] });
        let (added, skipped) = import_doc(&doc, &existing, &dir).unwrap();
        assert_eq!((added.len(), skipped), (1, 2));
        let _ = std::fs::remove_dir_all(dir);
    }
}

/// Hostile-input test for "Import layouts": whatever a stranger's file contains, only clean layout files inside the
/// layouts folder come out, within the limits.
#[cfg(test)]
mod import_robustness_tests {
    use super::*;
    use serde_json::json;

    struct Rng(u64);
    impl Rng {
        fn next(&mut self) -> u64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            self.0
        }
        fn below(&mut self, n: u64) -> u64 {
            self.next() % n
        }
    }
    const NAMES: &[&str] = &[
        "",
        "Mine",
        "../../escape",
        "a/b\\c:d*e?",
        "CON",
        "x\u{0}y",
        "é🎹日本語",
        "   ",
        "tkl",
        "full",
        "wasd",
    ];
    fn rand_val(r: &mut Rng) -> Value {
        match r.below(6) {
            0 => Value::Null,
            1 => json!(r.below(1000) as f64 - 500.5),
            2 => json!(NAMES[r.below(NAMES.len() as u64) as usize]),
            3 => json!("k".repeat(r.below(200) as usize)),
            4 => json!(r.below(2) == 0),
            _ => json!([1, "a", null]),
        }
    }
    fn rand_key(r: &mut Rng) -> Value {
        let mut k = serde_json::Map::new();
        for f in ["code", "x", "y", "w", "h", "label"] {
            if r.below(5) != 0 {
                k.insert(f.into(), rand_val(r));
            }
        }
        Value::Object(k)
    }
    fn rand_layout(r: &mut Rng) -> Value {
        let n = [0, 1, 5, 400][r.below(4) as usize];
        json!({ "id": rand_val(r), "name": rand_val(r), "keys": (0..n).map(|_| rand_key(r)).collect::<Vec<_>>() })
    }

    #[test]
    fn hostile_layout_files_only_produce_clean_layouts_inside_the_folder() {
        let base = std::env::temp_dir().join(format!("ko-fuzz-{}", std::process::id()));
        for seed in 1..=300u64 {
            let mut r = Rng(seed.wrapping_mul(0x9E3779B97F4A7C15) | 1);
            let dir = base.join(seed.to_string());
            let top = match r.below(3) {
                0 => rand_layout(&mut r),
                1 => {
                    json!({ "layouts": (0..r.below(30)).map(|_| rand_layout(&mut r)).collect::<Vec<_>>(), "profiles": rand_val(&mut r) })
                }
                _ => json!({ "layouts": rand_val(&mut r), "profiles": rand_val(&mut r) }),
            };
            let existing: Vec<Value> = (0..r.below(21))
                .map(|i| json!({ "id": format!("u{i}"), "name": "x", "user": true, "keys": [] }))
                .collect();
            let before = existing.iter().filter(|l| l["user"] == true).count();
            let Ok((added, _skipped)) = import_doc(&top, &existing, &dir) else {
                continue;
            };
            assert!(
                before + added.len() <= MAX_USER_LAYOUTS,
                "seed {seed}: went over the limit"
            );
            let files: Vec<_> = std::fs::read_dir(&dir)
                .map(|rd| rd.flatten().collect())
                .unwrap_or_default();
            assert_eq!(
                files.len(),
                added.len(),
                "seed {seed}: files written != layouts reported"
            );
            for f in files {
                let name = f.file_name().into_string().unwrap();
                assert!(
                    name.ends_with(".json")
                        && name[..name.len() - 5]
                            .chars()
                            .all(|c| c.is_ascii_alphanumeric() || c == '-')
                        && name.len() <= 40,
                    "seed {seed}: bad file name {name:?}"
                );
                let doc: Value = serde_json::from_str(&std::fs::read_to_string(f.path()).unwrap()).unwrap();
                assert!(
                    crate::server::valid_layout(&doc),
                    "seed {seed}: saved layout is not valid"
                );
                assert!(
                    doc["keys"].as_array().unwrap().len() <= 300 && doc["name"].as_str().unwrap().chars().count() <= 30
                );
                assert!(
                    existing.iter().all(|l| l["id"] != doc["id"]),
                    "seed {seed}: reused an existing id"
                );
            }
            let _ = std::fs::remove_dir_all(&dir);
        }
        let _ = std::fs::remove_dir_all(&base);
    }
}
