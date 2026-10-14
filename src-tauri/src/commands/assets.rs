//! User-managed files: custom fonts and style presets (all stored in the app's data folder).

use crate::platform;
use crate::server;
use crate::state::AppState;
use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt as _;

// ---------------------------------------------------------------- fonts
#[tauri::command]
pub fn list_fonts(st: State<AppState>) -> Vec<String> { server::font_files(&st.shared.paths) }

#[tauri::command]
pub async fn add_font(app: AppHandle, st: State<'_, AppState>) -> Result<Option<String>, String> {
    let Some(p) = app.dialog().file().add_filter("Fonts", &["ttf", "otf", "woff", "woff2"]).blocking_pick_file() else { return Ok(None) };
    let src = p.into_path().map_err(|e| e.to_string())?;
    let name = src.file_name().and_then(|n| n.to_str()).ok_or("bad file name")?.to_string();
    std::fs::copy(&src, st.shared.paths.fonts().join(&name)).map_err(|e| e.to_string())?;
    let _ = st.shared.cfg_tx.send("assets");
    Ok(Some(name))
}

#[tauri::command]
pub fn remove_font(st: State<AppState>, name: String) -> Result<(), String> {
    if name.contains(['/', '\\']) { return Err("bad name".into()); }
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

// ---------------------------------------------------------------- style presets (style + animation), stored as presets/<name>.json
fn clean_name(n: &str) -> Result<String, String> {
    let n: String = n.trim().chars().filter(|c| !r#"\/:*?"<>|"#.contains(*c)).collect();
    if n.is_empty() { Err("Enter a preset name".into()) } else { Ok(n) }
}

#[tauri::command]
pub fn list_presets(st: State<AppState>) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(st.shared.paths.presets()).into_iter().flatten().flatten()
        .filter_map(|e| e.path().file_stem()?.to_str().map(String::from)).collect();
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
    std::fs::remove_file(st.shared.paths.presets().join(format!("{}.json", clean_name(&name)?))).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_preset(app: AppHandle, data: Value) -> Result<bool, String> {
    let Some(p) = app.dialog().file().add_filter("Style preset", &["json"]).set_file_name("my-style.json").blocking_save_file() else { return Ok(false) };
    let path = p.into_path().map_err(|e| e.to_string())?;
    std::fs::write(path, serde_json::to_string_pretty(&data).unwrap()).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn import_preset(app: AppHandle) -> Result<Option<Value>, String> {
    let Some(p) = app.dialog().file().add_filter("Style preset", &["json"]).blocking_pick_file() else { return Ok(None) };
    let path = p.into_path().map_err(|e| e.to_string())?;
    let v: Value = serde_json::from_str(&std::fs::read_to_string(path).map_err(|e| e.to_string())?).map_err(|e| format!("Not a valid preset: {e}"))?;
    Ok(Some(v))
}

// ---------------------------------------------------------------- layouts the user made (stored in layouts/<id>.json)
/// Makes a new layout that starts as a copy of the full-size keyboard, selects it, and returns its id.
#[tauri::command]
pub fn create_layout(app: AppHandle, st: State<AppState>, name: String) -> Result<String, String> {
    let name: String = name.trim().chars().filter(|c| !c.is_control()).take(30).collect();
    if name.is_empty() { return Err("Enter a layout name".into()); }
    let all = server::layouts(&st.shared.paths);
    if all.iter().filter(|l| l["user"] == true).count() >= 20 { return Err("Max layouts reached (20)".into()); }
    let base: String = name.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect::<String>().trim_matches('-').to_string();
    let base = if base.is_empty() { "layout".to_string() } else { base.chars().take(30).collect() };
    let mut id = base.clone();
    let mut n = 2;
    while all.iter().any(|l| l["id"] == id.as_str()) { id = format!("{base}-{n}"); n += 1; }
    let full = all.iter().find(|l| l["id"] == "full").ok_or("The full-size layout is missing")?;
    let doc = serde_json::json!({ "id": id, "name": name, "keys": full["keys"] });
    let dir = st.shared.paths.user("layouts");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(format!("{id}.json")), serde_json::to_string_pretty(&doc).unwrap()).map_err(|e| e.to_string())?;
    crate::tray::refresh_tray_layouts(&app);
    crate::tray::set_layout_inner(&app, &id)?;
    Ok(id)
}

/// Deletes a layout the user made. Built-in layouts cannot be deleted.
#[tauri::command]
pub fn delete_layout(app: AppHandle, st: State<AppState>, id: String) -> Result<(), String> {
    let dir = st.shared.paths.user("layouts");
    let file = std::fs::read_dir(&dir).into_iter().flatten().flatten().map(|e| e.path()).find(|p| {
        std::fs::read_to_string(p).ok().and_then(|s| serde_json::from_str::<Value>(&s).ok()).is_some_and(|v| v["id"] == id.as_str())
    }).ok_or("Built-in layouts can't be deleted")?;
    std::fs::remove_file(file).map_err(|e| e.to_string())?;
    let was_current = {
        let mut s = st.shared.settings.write().unwrap();
        if let Some(p) = s["layout"]["profiles"].as_object_mut() { p.remove(&id); }
        let cur = s["layout"]["id"] == id.as_str();
        if cur { s["layout"]["id"] = serde_json::json!("tkl"); }
        crate::settings::save(&st.shared.paths.settings(), &s).map_err(|e| e.to_string())?;
        cur
    };
    crate::tray::refresh_tray_layouts(&app);
    let _ = was_current;
    crate::state::announce(&app);
    crate::state::sync_tray(&app);
    Ok(())
}
