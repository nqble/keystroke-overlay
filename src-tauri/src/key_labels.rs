//! Key labels that follow the user's keyboard language (setting `style.keyLabels`, Style → Text → Key labels). On a
//! French AZERTY keyboard the key in the Q spot types "A", so its label should say "A". The layout files are written
//! for the US English keyboard; when the user's keyboard is another one, the layouts are shown with its letters and
//! punctuation instead (the digit row keeps its digits, see keyboard/keymap.rs TYPING_KEYS). A user's own label for a
//! key always wins, because it is applied on top of these by the overlay and the key editor.
//!
//! What each key types is asked from the system at start-up (platform::keyboard_labels; one file per system in
//! keyboard/: windows_labels.rs, macos_labels.rs, x11_labels.rs), and again each time the layout may have changed, so
//! the preview and OBS follow the keyboard live. No timer: the system tells us (platform::watch_keyboard_layout), and
//! on Windows, which doesn't announce a switch inside one window, a released modifier key is the hint
//! (`follow_switch_keys`). Nothing about what the user types is read.
//!
//! The same setting also makes the keys that are named differently on each system follow the system the app runs on:
//! Command and Option on a Mac, Super on Linux, Win and Alt on Windows (the layout files' own words). So nobody has to
//! pick a Mac layout: they open the app and see their own keyboard. The names are in `SYSTEM_NAMES` below.

use crate::server;
use crate::settings::Paths;
use crate::state::AppState;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// What the keys that differ between systems are called, per system (`platform::name()`). Windows is the layout files'
/// own words, so it has no entry. A symbol is used where the key is small (one key wide). A new system, or a key whose
/// name differs, is one line here.
const SYSTEM_NAMES: [(&str, &[(&str, &str)]); 2] = [
    (
        "macos",
        &[
            ("MetaLeft", "⌘"),
            ("MetaRight", "⌘"),
            ("AltLeft", "⌥"),
            ("AltRight", "⌥"),
            ("ControlLeft", "⌃"),
            ("ControlRight", "⌃"),
            ("Backspace", "delete"),
            ("Enter", "return"),
        ],
    ),
    ("linux", &[("MetaLeft", "Super"), ("MetaRight", "Super")]),
];

/// What the user's keyboard prints, as last asked. Only `init` and the layout watcher ask the system (on the main
/// thread, which macOS requires); the server just reads this.
static KEYBOARD: Mutex<Option<HashMap<&'static str, String>>> = Mutex::new(None);

/// Ask the operating system what the user's keyboard prints, then keep asking each time the layout is switched (on the
/// main thread, at start-up).
pub fn init(app: &AppHandle) {
    replace_labels(&KEYBOARD, crate::platform::keyboard_labels());
    let app = app.clone();
    crate::platform::watch_keyboard_layout(move || reload(&app));
}

/// How long after a switch key is let go to ask again: Windows switches the layout only after it has handled the key,
/// which comes just after the app sees it.
const SWITCH_SETTLE: std::time::Duration = std::time::Duration::from_millis(150);

/// Was this the release of a key that can end a layout switch (`platform::layout_switch_keys`)?
fn ends_a_switch(event: &crate::keyboard::KeyEvent, switch_keys: &[&str]) -> bool {
    !event.down && switch_keys.contains(&event.code)
}

/// Where the system doesn't announce a layout switch inside one window (Windows), ask again shortly after a switch key
/// is let go. Call once the app state exists. The thread waits for key events, so it costs nothing while nobody types;
/// it only looks at which modifier was released, never at what was typed. Nowhere else does anything.
pub fn follow_switch_keys(app: &AppHandle) {
    let switch_keys = crate::platform::layout_switch_keys();
    if switch_keys.is_empty() {
        return;
    }
    let mut events = app.state::<AppState>().shared.bus.tx.subscribe();
    let app = app.clone();
    let _ = std::thread::Builder::new()
        .name("key-layout-keys".into())
        .spawn(move || loop {
            match events.blocking_recv() {
                Ok(event) if ends_a_switch(&event, switch_keys) => {
                    std::thread::sleep(SWITCH_SETTLE);
                    reload(&app);
                }
                Ok(_) | Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {}
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        });
}

/// The person switched keyboard layout: ask again, and when the labels changed tell the overlays (OBS and the
/// preview re-read their layouts) and the settings window.
fn reload(app: &AppHandle) {
    if !replace_labels(&KEYBOARD, crate::platform::keyboard_labels()) {
        return;
    }
    let st = app.state::<AppState>();
    let _ = st.shared.cfg_tx.send("assets");
    let _ = app.emit("settings-changed", ());
}

/// Store new labels; true when they differ from the ones held.
fn replace_labels(slot: &Mutex<Option<HashMap<&'static str, String>>>, new: HashMap<&'static str, String>) -> bool {
    let mut held = slot.lock().unwrap();
    let changed = held.as_ref() != Some(&new);
    *held = Some(new);
    changed
}

/// The labels as last asked (none before `init`).
fn current_labels() -> HashMap<&'static str, String> {
    KEYBOARD.lock().unwrap().clone().unwrap_or_default()
}

/// The label for one character a key types: upper case, as on a keycap. None for anything that isn't a visible
/// character (a control code or a space), so that key keeps its layout's label.
#[cfg_attr(not(any(windows, target_os = "macos", target_os = "linux")), allow(dead_code))] // used by platform::keyboard_labels, and by the tests
pub fn label_for(utf16: u16) -> Option<String> {
    let typed = char::from_u32(u32::from(utf16))?;
    if typed.is_control() || typed.is_whitespace() {
        return None;
    }
    Some(typed.to_uppercase().collect())
}

/// The names of the keys that differ on this system (see `SYSTEM_NAMES`); empty where the layout files' words are right.
pub fn system_labels(system: &str) -> HashMap<&'static str, String> {
    let names = SYSTEM_NAMES
        .iter()
        .find(|(name, _)| *name == system)
        .map(|(_, names)| *names);
    let names = names.unwrap_or(&[]);
    names.iter().map(|&(code, label)| (code, label.to_string())).collect()
}

/// Put the keyboard's own labels on every layout key that has one.
pub fn apply(layouts: &mut [Value], labels: &HashMap<&'static str, String>) {
    for key in layouts
        .iter_mut()
        .filter_map(|layout| layout["keys"].as_array_mut())
        .flatten()
    {
        if let Some(label) = key["code"].as_str().and_then(|code| labels.get(code)) {
            key["label"] = Value::String(label.clone());
        }
    }
}

/// The layouts as the overlay and the settings window show them: with the keyboard's own labels, unless the user chose
/// the layout files' labels (`style.keyLabels` = "layout").
pub fn layouts_to_show(paths: &Paths, settings: &Value) -> Vec<Value> {
    let mut layouts = server::layouts(paths);
    if settings["style"]["keyLabels"].as_str() != Some("layout") {
        apply(&mut layouts, &system_labels(crate::platform::name()));
        // Only read here: asking the system happens in `init` and the layout watcher, on the main thread (macOS
        // requires it), and this runs on the server's threads. Before `init` there are simply no keyboard labels yet.
        apply(&mut layouts, &current_labels());
    }
    layouts
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_releasing_a_switch_key_ends_a_switch() {
        use crate::keyboard::KeyEvent;
        let switch_keys = ["ShiftLeft", "AltLeft"];
        let released = |code| KeyEvent { down: false, code };
        assert!(ends_a_switch(&released("ShiftLeft"), &switch_keys));
        assert!(
            !ends_a_switch(
                &KeyEvent {
                    down: true,
                    code: "ShiftLeft"
                },
                &switch_keys
            ),
            "pressing it"
        );
        assert!(!ends_a_switch(&released("KeyQ"), &switch_keys), "a typing key");
        assert!(
            !ends_a_switch(&released("ShiftLeft"), &[]),
            "a system that announces switches itself"
        );
    }

    #[test]
    fn a_label_is_the_visible_character_in_upper_case() {
        assert_eq!(label_for('a' as u16), Some("A".into()));
        assert_eq!(label_for('ü' as u16), Some("Ü".into()));
        assert_eq!(label_for(';' as u16), Some(";".into()));
        assert_eq!(label_for(' ' as u16), None);
        assert_eq!(label_for(0x1B), None, "a control code keeps the layout's label");
    }

    #[test]
    fn switching_layout_replaces_the_labels_and_says_whether_they_changed() {
        let slot = Mutex::new(None);
        let azerty = HashMap::from([("KeyQ", "A".to_string())]);
        assert!(replace_labels(&slot, azerty.clone()), "the first answer is a change");
        assert!(!replace_labels(&slot, azerty), "the same layout again is not");
        assert!(
            replace_labels(&slot, HashMap::new()),
            "back to US (no labels) is a change"
        );
        assert_eq!(slot.lock().unwrap().as_ref().map(HashMap::len), Some(0));
    }

    #[test]
    fn a_mac_names_its_modifier_keys_the_mac_way() {
        let mac = system_labels("macos");
        assert_eq!(mac.get("MetaLeft").map(String::as_str), Some("⌘"));
        assert_eq!(mac.get("AltRight").map(String::as_str), Some("⌥"));
        assert_eq!(mac.get("Backspace").map(String::as_str), Some("delete"));
    }

    #[test]
    fn windows_keeps_the_layout_files_words_and_unknown_systems_change_nothing() {
        assert!(system_labels("windows").is_empty());
        assert!(system_labels("something-else").is_empty());
    }

    #[test]
    fn linux_calls_the_windows_key_super() {
        assert_eq!(
            system_labels("linux").get("MetaLeft").map(String::as_str),
            Some("Super")
        );
    }

    #[test]
    fn every_system_name_is_a_key_the_layouts_know() {
        let known = include_str!("keyboard/keymap.rs");
        for (_, names) in SYSTEM_NAMES {
            for (code, _) in names {
                assert!(known.contains(&format!("\"{code}\"")), "{code} is not in keymap.rs");
            }
        }
    }

    #[test]
    fn the_systems_names_fit_a_key_label() {
        const LONGEST_LABEL: usize = 16; // docs/FILE-FORMATS.md: labels of at most 16 characters
        for (_, names) in SYSTEM_NAMES {
            assert!(names.iter().all(|(_, label)| label.chars().count() <= LONGEST_LABEL));
        }
    }

    #[test]
    fn the_keyboards_labels_replace_only_the_keys_it_names() {
        let mut layouts = vec![json!({ "id": "full", "keys": [
            { "code": "KeyQ", "label": "Q" },
            { "code": "Semicolon", "label": ";" },
            { "code": "ShiftLeft", "label": "Shift" },
        ] })];
        let azerty = HashMap::from([("KeyQ", "A".to_string()), ("Semicolon", "M".to_string())]);
        apply(&mut layouts, &azerty);
        let labels: Vec<_> = layouts[0]["keys"]
            .as_array()
            .unwrap()
            .iter()
            .map(|key| key["label"].clone())
            .collect();
        assert_eq!(labels, vec![json!("A"), json!("M"), json!("Shift")]);
    }
}
