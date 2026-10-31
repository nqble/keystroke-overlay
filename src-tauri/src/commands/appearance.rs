//! Settings window themes (docs/proposals/app-themes.md): which theme files the app has. Each theme is one file in
//! ui/settings/themes/, built into the app here, so adding a theme means adding one file (decision 0006). The settings
//! window reads the files itself (ui/settings/app-themes.js); the chosen theme is `appearance.theme` in settings.rs.

use include_dir::{include_dir, Dir};

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_built_in_theme_is_listed_and_the_default_is_there() {
        let names = theme_files();
        assert!(names.contains(&"default.json".to_string()));
        assert!(names.iter().all(|name| name.ends_with(".json")));
    }
}
