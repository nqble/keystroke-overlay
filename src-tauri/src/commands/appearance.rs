//! Settings window themes (docs/design/ui-design-v2.md, section 14). The built-in ones: each is one file in ui/settings/themes/,
//! built into the app here, so adding a theme means adding one file (decision 0006); the settings window reads the files
//! itself (ui/settings/app-themes.js). The person's own themes live in the settings (`appearance.custom`), cleaned by
//! `clean_custom_themes`, and travel as small files through Export… and Import…. The chosen theme is `appearance.theme`.

use crate::sanitize::{is_hex_color, is_ident};
use include_dir::{include_dir, Dir};
use serde_json::{json, Map, Value};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt as _;

/// How many themes of their own a person may keep. Keep in step with MAX_CUSTOM_THEMES in ui/settings/app-themes.js.
pub(crate) const MAX_CUSTOM_THEMES: usize = 20;
/// The longest theme name, in characters. Keep in step with MAX_THEME_NAME in ui/settings/app-themes.js.
const MAX_THEME_NAME: usize = 40;
/// The six colors every theme sets.
const BASE_COLORS: [&str; 6] = ["background", "panel", "text", "dim", "accent", "error"];
/// The biggest file Import… reads; a theme file is a few hundred bytes.
const MAX_THEME_FILE_BYTES: u64 = 20_000;

static APP_THEMES: Dir = include_dir!("$CARGO_MANIFEST_DIR/../ui/settings/themes");

/// The file names of the built-in settings themes (`olivia.json`, …), in name order.
#[tauri::command]
pub fn list_app_themes() -> Vec<String> {
    theme_files()
}

fn theme_files() -> Vec<String> {
    let mut names: Vec<String> = APP_THEMES
        .files()
        .filter_map(|file| file.path().file_name()?.to_str().map(str::to_owned))
        .filter(|name| name.ends_with(".json"))
        .collect();
    names.sort();
    names
}

/// The person's own themes, cleaned: at most MAX_CUSTOM_THEMES, each with a plain unique id, a short name and the six
/// colors as `#rrggbb`. A theme missing any of that is dropped rather than half kept.
pub fn clean_custom_themes(raw: &Value) -> Value {
    let mut themes: Vec<Value> = Vec::new();
    let mut ids: Vec<String> = Vec::new();
    for theme in raw.as_array().into_iter().flatten().filter_map(Value::as_object) {
        let Some(clean) = clean_theme(theme) else {
            continue;
        };
        let id = clean["id"].as_str().unwrap_or_default().to_string();
        if ids.contains(&id) || themes.len() >= MAX_CUSTOM_THEMES {
            continue;
        }
        ids.push(id);
        themes.push(clean);
    }
    Value::Array(themes)
}

/// One theme with only the fields the app uses; `None` when its id, name or a color isn't valid.
fn clean_theme(theme: &Map<String, Value>) -> Option<Value> {
    let id = theme.get("id")?.as_str().filter(|id| is_ident(id))?;
    let name = theme.get("name")?.as_str()?.trim();
    if name.is_empty() || name.chars().count() > MAX_THEME_NAME || name.chars().any(char::is_control) {
        return None;
    }
    let raw_colors = theme.get("colors")?.as_object()?;
    let mut colors = Map::new();
    for color_name in BASE_COLORS {
        let color = raw_colors
            .get(color_name)?
            .as_str()
            .filter(|color| is_six_digit_color(color))?;
        colors.insert(color_name.into(), json!(color.to_lowercase()));
    }
    Some(json!({ "id": id, "name": name, "colors": colors }))
}

fn is_six_digit_color(color: &str) -> bool {
    color.len() == 7 && is_hex_color(color)
}

/// Saves one theme as a file the person picks (Export… in the edit bar or a theme's ⋯ menu).
#[tauri::command]
pub async fn export_app_theme(app: AppHandle, theme: Value) -> Result<bool, String> {
    let Some(clean) = theme.as_object().and_then(clean_theme) else {
        return Err("That theme isn't complete".into());
    };
    let Some(picked_file) = app
        .dialog()
        .file()
        .add_filter("Settings theme", &["json"])
        .set_file_name("my-theme.json")
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let path = picked_file.into_path().map_err(|e| e.to_string())?;
    std::fs::write(path, serde_json::to_string_pretty(&clean).unwrap()).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Reads a theme file the person picks (Import… in the gallery). The id is the settings window's to choose.
#[tauri::command]
pub async fn import_app_theme(app: AppHandle) -> Result<Option<Value>, String> {
    let Some(picked_file) = app
        .dialog()
        .file()
        .add_filter("Settings theme", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = picked_file.into_path().map_err(|e| e.to_string())?;
    if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > MAX_THEME_FILE_BYTES {
        return Err("That file is too big to be a theme".into());
    }
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut theme: Value = serde_json::from_str(&text).map_err(|_| "That file isn't a theme".to_string())?;
    if let Some(fields) = theme.as_object_mut() {
        fields.insert("id".into(), json!("imported"));
    }
    theme
        .as_object()
        .and_then(clean_theme)
        .map(Some)
        .ok_or_else(|| "That file isn't a complete theme".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_built_in_theme_is_listed_and_the_default_is_there() {
        let names = theme_files();
        assert!(names.contains(&"default.json".to_string()));
        assert!(names.iter().all(|name| name.ends_with(".json")));
    }

    fn theme(id: &str, accent: &str) -> Value {
        json!({ "id": id, "name": " Mine ", "colors": {
            "background": "#111111", "panel": "#222222", "text": "#EEEEEE",
            "dim": "#999999", "accent": accent, "error": "#ff0000" }, "extra": true })
    }

    #[test]
    fn custom_themes_keep_only_complete_ones_trimmed_and_lowercased() {
        let cleaned = clean_custom_themes(&json!([theme("custom-1", "#4F8CFF"), theme("custom-2", "red"), "junk"]));
        assert_eq!(
            cleaned,
            json!([{ "id": "custom-1", "name": "Mine", "colors": {
                "background": "#111111", "panel": "#222222", "text": "#eeeeee",
                "dim": "#999999", "accent": "#4f8cff", "error": "#ff0000" } }])
        );
    }

    #[test]
    fn custom_themes_drop_repeated_ids_and_stop_at_the_limit() {
        let many: Vec<Value> = (0..30)
            .map(|n| theme(&format!("custom-{}", n % 25), "#4f8cff"))
            .collect();
        let cleaned = clean_custom_themes(&Value::Array(many));
        assert_eq!(cleaned.as_array().unwrap().len(), MAX_CUSTOM_THEMES);
    }
}
