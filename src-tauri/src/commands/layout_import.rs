//! Making a layout from a keyboard file the user picks (for now a KLE file from keyboard-layout-editor.com): the file
//! picker, which hands the file's text to the settings window, and `add_layout`, which saves the keys the window worked
//! out as a new layout of the user's own. The reading and the key matching are plain JavaScript in the window
//! (ui/settings/kle.js, kle-layout.js; the popup is kle-import-popup.js); this side never trusts what comes back and
//! cleans every key (`clean_layout_keys` in sanitize.rs). The other layout commands are in assets.rs.
//! The layout file format: docs/FILE-FORMATS.md.

use super::assets::{layout_name, slug, unused_id, MAX_LAYOUT_FILE_BYTES, MAX_USER_LAYOUTS, TOO_BIG_FOR_A_LAYOUT};
use crate::sanitize::clean_layout_keys;
use crate::server;
use crate::state::AppState;
use serde_json::{json, Value};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt as _;

/// The file picker for a keyboard file. Returns None if the user canceled, otherwise { fileName, text }: the file's
/// name (the window names the layout after it when the file has no name of its own) and its text, as it is.
#[tauri::command]
pub async fn pick_layout_source(app: AppHandle) -> Result<Option<Value>, String> {
    let Some(picked_file) = app
        .dialog()
        .file()
        .add_filter("Keyboard layouts", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = picked_file.into_path().map_err(|e| e.to_string())?;
    if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > MAX_LAYOUT_FILE_BYTES {
        return Err(TOO_BIG_FOR_A_LAYOUT.into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    // A file that isn't UTF-8 text can't be JSON either: the window then says it couldn't read the file.
    let text = String::from_utf8_lossy(&bytes).into_owned();
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default();
    Ok(Some(json!({ "fileName": file_name, "text": text })))
}

/// The typing keys by the virtual key this PC's keyboard gives them, as {"65": "KeyQ", ...}: a NohBoard keyboard file
/// stores keys that way, and on a non-US keyboard the same virtual key is another key (ui/settings/nohboard-layout.js).
/// Windows only (platform.rs).
#[tauri::command]
pub fn typing_virtual_keys() -> Result<Value, String> {
    let by_virtual_key = crate::platform::typing_keys_by_virtual_key()?;
    let entries = by_virtual_key
        .into_iter()
        .map(|(virtual_key, code)| (virtual_key.to_string(), json!(code)));
    Ok(Value::Object(entries.collect()))
}

/// Saves `keys` (from the window, so cleaned first) as a new layout named `name` in `dir`, next to the `existing`
/// layouts. The same rules as a layout made with New layout: a name, at most MAX_USER_LAYOUTS of your own, a fresh id.
/// Returns the new layout's id.
pub fn write_new_layout(name: &str, keys: &Value, existing: &[Value], dir: &std::path::Path) -> Result<String, String> {
    let name = layout_name(name);
    if name.is_empty() {
        return Err("Enter a layout name".into());
    }
    if existing.iter().filter(|l| l["user"] == true).count() >= MAX_USER_LAYOUTS {
        return Err(format!("Max layouts reached ({MAX_USER_LAYOUTS})"));
    }
    let keys = clean_layout_keys(keys);
    if keys.is_empty() {
        return Err("This layout has no keys".into());
    }
    let id = unused_id(&slug(&name), |candidate| existing.iter().any(|l| l["id"] == candidate));
    let doc = json!({ "id": id, "name": name, "keys": keys });
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    std::fs::write(
        dir.join(format!("{id}.json")),
        serde_json::to_string_pretty(&doc).unwrap(),
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

/// Makes a new layout of the user's own from keys the window worked out (Import from KLE), selects it, and returns
/// its id. The steps after writing the file are create_layout's.
#[tauri::command]
pub fn add_layout(app: AppHandle, st: State<AppState>, name: String, keys: Value) -> Result<String, String> {
    let existing = server::layouts(&st.shared.paths);
    let id = write_new_layout(&name, &keys, &existing, &st.shared.paths.user("layouts"))?;
    crate::tray::refresh_tray_layouts(&app);
    crate::debug::log(format!("layout added from a file: {id}"));
    // the overlay (OBS and the preview) must re-read its list of layouts before it is told to switch
    let _ = st.shared.cfg_tx.send("assets");
    crate::tray::set_layout_inner(&app, &id)?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_folder(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("ko-add-layout-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }
    fn layout(id: &str, user: bool) -> Value {
        json!({ "id": id, "name": id, "user": user, "keys": [{ "code": "KeyA", "x": 0, "y": 0 }] })
    }
    fn saved(dir: &std::path::Path, id: &str) -> Value {
        serde_json::from_str(&std::fs::read_to_string(dir.join(format!("{id}.json"))).unwrap()).unwrap()
    }

    #[test]
    fn a_layout_is_saved_with_cleaned_keys_and_a_fresh_id() {
        let dir = scratch_folder("clean");
        let keys = json!([
            { "code": "KeyQ", "x": 0, "y": 0, "label": "Q" },
            { "code": "Unlinked1", "x": 1e9, "y": 0, "w": 0.01, "label": "Fn" },
            { "code": "KeyQ", "x": 2, "y": 0 },
            { "code": "", "x": 3, "y": 0 }
        ]);
        let existing = [layout("my-board", true), layout("tkl", false)];
        let id = write_new_layout("  My Board\n", &keys, &existing, &dir).unwrap();
        assert_eq!(id, "my-board-2", "never replaces a layout that is there");
        let doc = saved(&dir, &id);
        assert_eq!(doc["name"], "My Board");
        assert_eq!(
            doc["keys"],
            json!([
                { "code": "KeyQ", "x": 0.0, "y": 0.0, "label": "Q" },
                { "code": "Unlinked1", "x": 100.0, "y": 0.0, "w": 0.25, "label": "Fn" }
            ])
        );
        assert!(crate::server::valid_layout(&doc));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn the_twenty_layout_limit_a_name_and_keys_are_needed() {
        let dir = scratch_folder("limits");
        let keys = json!([{ "code": "KeyA", "x": 0, "y": 0 }]);
        let full: Vec<Value> = (0..MAX_USER_LAYOUTS).map(|i| layout(&format!("u{i}"), true)).collect();
        assert!(write_new_layout("One more", &keys, &full, &dir)
            .unwrap_err()
            .contains("Max layouts"));
        assert!(write_new_layout(" \t", &keys, &[], &dir).is_err());
        assert!(write_new_layout("No keys", &json!([]), &[], &dir).is_err());
        assert!(write_new_layout("Not a list", &json!({ "keys": [] }), &[], &dir).is_err());
        assert!(
            std::fs::read_dir(&dir).map_or(true, |files| files.count() == 0),
            "nothing written"
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn typing_virtual_keys_name_the_typing_keys_or_say_not_available() {
        let result = typing_virtual_keys();
        if cfg!(windows) {
            let table = result.unwrap();
            assert!(!table.as_object().unwrap().is_empty(), "Windows names the typing keys");
            for code in table.as_object().unwrap().values() {
                let code = code.as_str().unwrap();
                assert!(
                    crate::keyboard::keymap::TYPING_KEYS
                        .iter()
                        .any(|&(typing, _)| typing == code),
                    "{code}"
                );
            }
        } else {
            assert_eq!(result.unwrap_err(), "not available on this system yet");
        }
    }

    /// Hostile input: whatever the window sends, only a clean layout file inside the folder comes out.
    #[test]
    fn hostile_names_and_keys_only_produce_clean_layouts_inside_the_folder() {
        let dir = scratch_folder("hostile");
        let names = [
            "../../escape",
            "a/b\\c:d*e?",
            "CON",
            "x\u{0}y",
            "é🎹日本語",
            &"n".repeat(500),
        ];
        let junk_keys = [
            json!(null),
            json!("text"),
            json!([1, null, "x", [], {}]),
            json!([{ "code": "../evil", "x": "0", "y": 0 }, { "code": "KeyA", "x": -1e300, "y": 1e300, "label": 5 }]),
            json!((0..400)
                .map(|n| json!({ "code": format!("K{n}"), "x": n, "y": 0 }))
                .collect::<Vec<_>>()),
        ];
        for name in names {
            for keys in &junk_keys {
                let Ok(id) = write_new_layout(name, keys, &[], &dir) else {
                    continue;
                };
                assert!(
                    id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') && id.len() <= 40,
                    "{id}"
                );
                let doc = saved(&dir, &id);
                assert!(crate::server::valid_layout(&doc));
                assert!(doc["keys"].as_array().unwrap().len() <= crate::sanitize::MAX_LAYOUT_KEYS);
                assert!(doc["name"].as_str().unwrap().chars().count() <= 30);
            }
        }
        for file in std::fs::read_dir(&dir).unwrap().flatten() {
            assert_eq!(file.path().parent(), Some(dir.as_path()), "inside the folder");
        }
        let _ = std::fs::remove_dir_all(dir);
    }
}
