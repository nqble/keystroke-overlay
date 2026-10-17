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
    let Some(picked_file) = app
        .dialog()
        .file()
        .add_filter("Fonts", &["ttf", "otf", "woff", "woff2"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let src = picked_file.into_path().map_err(|e| e.to_string())?;
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
    if !crate::server::is_plain_file_name(&name) {
        return Err("bad name".into());
    }
    std::fs::remove_file(st.shared.paths.fonts().join(name)).map_err(|e| e.to_string())?;
    let _ = st.shared.cfg_tx.send("assets");
    Ok(())
}

#[tauri::command]
pub fn open_folder(st: State<AppState>, kind: String) {
    let folder = match kind.as_str() {
        "fonts" | "presets" | "layouts" | "animations" | "themes" => st.shared.paths.user(&kind),
        _ => st.shared.paths.root.clone(),
    };
    let _ = std::fs::create_dir_all(&folder);
    platform::open_folder(&folder);
}

// ---------------------------------------------------------------- style presets (style + animation), stored as
// presets/<name>.json
fn clean_name(raw_name: &str) -> Result<String, String> {
    let cleaned: String = raw_name
        .trim()
        .chars()
        .filter(|c| !r#"\/:*?"<>|"#.contains(*c))
        .collect();
    if cleaned.is_empty() {
        Err("Enter a preset name".into())
    } else {
        Ok(cleaned)
    }
}

#[tauri::command]
pub fn list_presets(st: State<AppState>) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(st.shared.paths.presets())
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| e.path().file_stem()?.to_str().map(String::from))
        .collect();
    names.sort();
    names
}

#[tauri::command]
pub fn save_preset(st: State<AppState>, name: String, data: Value) -> Result<(), String> {
    let preset_path = st.shared.paths.presets().join(format!("{}.json", clean_name(&name)?));
    std::fs::write(preset_path, serde_json::to_string_pretty(&data).unwrap()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_preset(st: State<AppState>, name: String) -> Result<Value, String> {
    let preset_path = st.shared.paths.presets().join(format!("{}.json", clean_name(&name)?));
    serde_json::from_str(&std::fs::read_to_string(preset_path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_preset(st: State<AppState>, name: String) -> Result<(), String> {
    std::fs::remove_file(st.shared.paths.presets().join(format!("{}.json", clean_name(&name)?)))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_preset(app: AppHandle, data: Value) -> Result<bool, String> {
    let Some(picked_file) = app
        .dialog()
        .file()
        .add_filter("Style preset", &["json"])
        .set_file_name("my-style.json")
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let path = picked_file.into_path().map_err(|e| e.to_string())?;
    std::fs::write(path, serde_json::to_string_pretty(&data).unwrap()).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn import_preset(app: AppHandle) -> Result<Option<Value>, String> {
    let Some(picked_file) = app
        .dialog()
        .file()
        .add_filter("Style preset", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = picked_file.into_path().map_err(|e| e.to_string())?;
    let preset: Value = serde_json::from_str(&std::fs::read_to_string(path).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Not a valid preset: {e}"))?;
    Ok(Some(preset))
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
    let mut suffix = 2;
    while all.iter().any(|l| l["id"] == id.as_str()) {
        id = format!("{base}-{suffix}");
        suffix += 1;
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
        .find(|layout_path| {
            std::fs::read_to_string(layout_path)
                .ok()
                .and_then(|text| serde_json::from_str::<Value>(&text).ok())
                .is_some_and(|v| v["id"] == id.as_str())
        })
        .ok_or("Built-in layouts can't be deleted")?;
    std::fs::remove_file(file).map_err(|e| e.to_string())?;
    {
        let mut current_settings = st.shared.settings.write().unwrap();
        if let Some(profiles) = current_settings["layout"]["profiles"].as_object_mut() {
            profiles.remove(&id);
        }
        let cur = current_settings["layout"]["id"] == id.as_str();
        if cur {
            current_settings["layout"]["id"] = serde_json::json!("tkl");
        }
        crate::settings::save(&st.shared.paths.settings(), &current_settings).map_err(|e| e.to_string())?;
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
    let cleaned: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(30)
        .collect();
    if cleaned.is_empty() {
        "layout".into()
    } else {
        cleaned
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
    for layout in &mine {
        if let Some(profile) = layout["id"]
            .as_str()
            .and_then(|id| settings["layout"]["profiles"].get(id))
        {
            profiles.insert(layout["id"].as_str().unwrap().to_string(), profile.clone());
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
    for item in items.iter().take(MAX_USER_LAYOUTS) {
        let name: String = item["name"]
            .as_str()
            .unwrap_or("Imported layout")
            .trim()
            .chars()
            .filter(|c| !c.is_control())
            .take(30)
            .collect();
        let keys: Vec<Value> = item["keys"]
            .as_array()
            .map(|raw_keys| {
                raw_keys
                    .iter()
                    .take(300)
                    .filter(|key| {
                        key["code"].as_str().is_some_and(|c| !c.is_empty() && c.len() <= 40)
                            && key["x"].is_number()
                            && key["y"].is_number()
                    })
                    .map(|key| {
                        let mut cleaned_key = serde_json::json!({ "code": key["code"], "x": key["x"], "y": key["y"] });
                        for field in ["w", "h"] {
                            if key[field].is_number() {
                                cleaned_key[field] = key[field].clone();
                            }
                        }
                        if let Some(label) = key["label"].as_str() {
                            cleaned_key["label"] = Value::String(label.chars().take(16).collect());
                        }
                        cleaned_key
                    })
                    .collect()
            })
            .unwrap_or_default();
        if keys.is_empty() || name.is_empty() || count >= MAX_USER_LAYOUTS {
            skipped += 1;
            continue;
        }
        let base = slug(item["id"].as_str().unwrap_or(&name));
        let (mut id, mut suffix) = (base.clone(), 2);
        while have.contains(&id) {
            id = format!("{base}-{suffix}");
            suffix += 1;
        }
        let doc = serde_json::json!({ "id": id, "name": name, "keys": keys });
        std::fs::write(
            dir.join(format!("{id}.json")),
            serde_json::to_string_pretty(&doc).unwrap(),
        )
        .map_err(|e| e.to_string())?;
        let old_id = item["id"].as_str().unwrap_or("");
        let prof = crate::sanitize::clean_profiles(
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
    let Some(picked_file) = app
        .dialog()
        .file()
        .add_filter("Keystroke Overlay layouts", &["json"])
        .set_file_name("my-layouts.json")
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = picked_file.into_path().map_err(|e| e.to_string())?;
    std::fs::write(path, serde_json::to_string_pretty(&doc).unwrap()).map_err(|e| e.to_string())?;
    Ok(Some(doc["layouts"].as_array().map_or(0, |a| a.len())))
}

/// Returns None if the user cancelled, otherwise (layouts added, layouts skipped).
#[tauri::command]
pub async fn import_layouts(app: AppHandle, st: State<'_, AppState>) -> Result<Option<(usize, usize)>, String> {
    let Some(picked_file) = app
        .dialog()
        .file()
        .add_filter("Keystroke Overlay layouts", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = picked_file.into_path().map_err(|e| e.to_string())?;
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
        let mut current_settings = st.shared.settings.write().unwrap();
        for (id, prof) in &added {
            let empty = prof["disabledKeys"].as_array().is_none_or(|a| a.is_empty())
                && prof["labels"].as_object().is_none_or(|o| o.is_empty());
            if !empty {
                current_settings["layout"]["profiles"][id] = prof.clone();
            }
        }
        crate::settings::save(&st.shared.paths.settings(), &current_settings).map_err(|e| e.to_string())?;
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
        let dir = std::env::temp_dir().join(format!("ko-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }
    fn layout(id: &str, user: bool) -> Value {
        json!({ "id": id, "name": id, "user": user, "keys": [{ "code": "KeyA", "x": 0, "y": 0, "label": "A" }] })
    }

    #[test]
    fn export_needs_a_user_layout_and_keeps_key_edits() {
        assert!(export_doc(&[layout("tkl", false)], &json!({})).is_err());
        let settings = json!({ "layout": { "profiles": { "mine": { "disabledKeys": ["KeyB"], "labels": {} }, "tkl": { "disabledKeys": ["KeyC"], "labels": {} } } } });
        let doc = export_doc(&[layout("tkl", false), layout("mine", true)], &settings).unwrap();
        assert_eq!(doc["layouts"].as_array().unwrap().len(), 1);
        assert!(doc["layouts"][0].get("user").is_none());
        assert_eq!(doc["profiles"]["mine"]["disabledKeys"], json!(["KeyB"]));
        assert!(doc["profiles"].get("tkl").is_none());
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
        fn below(&mut self, limit: u64) -> u64 {
            self.next() % limit
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
    fn rand_val(rng: &mut Rng) -> Value {
        match rng.below(6) {
            0 => Value::Null,
            1 => json!(rng.below(1000) as f64 - 500.5),
            2 => json!(NAMES[rng.below(NAMES.len() as u64) as usize]),
            3 => json!("k".repeat(rng.below(200) as usize)),
            4 => json!(rng.below(2) == 0),
            _ => json!([1, "a", null]),
        }
    }
    fn rand_key(rng: &mut Rng) -> Value {
        let mut key = serde_json::Map::new();
        for field in ["code", "x", "y", "w", "h", "label"] {
            if rng.below(5) != 0 {
                key.insert(field.into(), rand_val(rng));
            }
        }
        Value::Object(key)
    }
    fn rand_layout(rng: &mut Rng) -> Value {
        let key_count = [0, 1, 5, 400][rng.below(4) as usize];
        json!({ "id": rand_val(rng), "name": rand_val(rng), "keys": (0..key_count).map(|_| rand_key(rng)).collect::<Vec<_>>() })
    }

    #[test]
    fn hostile_layout_files_only_produce_clean_layouts_inside_the_folder() {
        let base = std::env::temp_dir().join(format!("ko-fuzz-{}", std::process::id()));
        for seed in 1..=300u64 {
            let mut rng = Rng(seed.wrapping_mul(0x9E3779B97F4A7C15) | 1);
            let dir = base.join(seed.to_string());
            let top = match rng.below(3) {
                0 => rand_layout(&mut rng),
                1 => {
                    json!({ "layouts": (0..rng.below(30)).map(|_| rand_layout(&mut rng)).collect::<Vec<_>>(), "profiles": rand_val(&mut rng) })
                }
                _ => json!({ "layouts": rand_val(&mut rng), "profiles": rand_val(&mut rng) }),
            };
            let existing: Vec<Value> = (0..rng.below(21))
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
            for file in files {
                let name = file.file_name().into_string().unwrap();
                assert!(
                    name.ends_with(".json")
                        && name[..name.len() - 5]
                            .chars()
                            .all(|c| c.is_ascii_alphanumeric() || c == '-')
                        && name.len() <= 40,
                    "seed {seed}: bad file name {name:?}"
                );
                let doc: Value = serde_json::from_str(&std::fs::read_to_string(file.path()).unwrap()).unwrap();
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
