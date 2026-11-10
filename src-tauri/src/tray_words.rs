//! The tray menu's words in the settings window's language (docs/proposals/interface-languages.md, step 2). The words
//! live in the window's language files (`ui/settings/locales/*.js`, group `appMenu`), which only the window reads, so the
//! window sends them here after it starts (`set_tray_words`). They are saved with the settings
//! (`general.trayWords`), so the tray is in that language from the next launch on, even when the window never opens;
//! until a first copy is saved, it uses the English below. The menu itself is built in tray.rs.
use serde_json::{Map, Value};
use tauri::menu::{CheckMenuItem, MenuItem, Submenu};
use tauri::State;

use crate::settings;
use crate::state::AppState;

/// Every word the tray shows, by id, in English: the same as the `appMenu` group of `ui/settings/locales/en.js` (a test
/// below checks the two agree).
pub const ENGLISH: [(&str, &str); 11] = [
    ("open", "Open settings"),
    ("copy", "Copy OBS URL"),
    ("pause", "Pause overlay"),
    ("show", "Show"),
    ("keyboard", "Keyboard"),
    ("mouse", "Mouse"),
    ("controller", "Controller"),
    ("layout", "Layout"),
    ("restart", "Restart server"),
    ("quit", "Quit"),
    ("update", "Update available"),
];

/// The longest saved word, in characters: a menu entry, never a paragraph.
const MAX_WORD_CHARS: usize = 60;

/// A tray entry whose words can change while the app runs.
pub enum Worded {
    Item(MenuItem<tauri::Wry>),
    Check(CheckMenuItem<tauri::Wry>),
    Menu(Submenu<tauri::Wry>),
}

impl Worded {
    fn set_text(&self, text: &str) -> tauri::Result<()> {
        match self {
            Worded::Item(item) => item.set_text(text),
            Worded::Check(item) => item.set_text(text),
            Worded::Menu(menu) => menu.set_text(text),
        }
    }
}

/// The word for `id`: the saved one in the window's language, else English.
pub fn word(settings: &Value, id: &str) -> String {
    let saved = settings["general"]["trayWords"][id].as_str();
    let english = ENGLISH.iter().find(|(name, _)| *name == id).map(|(_, text)| *text);
    saved.or(english).unwrap_or(id).to_string()
}

/// `general.trayWords`, cleaned: only the ids above, each a short single-line text. Anything else is dropped.
pub fn clean_tray_words(raw: &Value) -> Value {
    let mut clean = Map::new();
    for (id, _) in ENGLISH {
        let Some(text) = raw.get(id).and_then(Value::as_str) else {
            continue;
        };
        let fits = !text.trim().is_empty() && text.chars().count() <= MAX_WORD_CHARS;
        if fits && !text.chars().any(char::is_control) {
            clean.insert(id.to_string(), Value::String(text.to_string()));
        }
    }
    Value::Object(clean)
}

/// The settings window's tray words (its `appMenu` group, in its language): saved when they changed, and shown at once.
#[tauri::command]
pub fn set_tray_words(st: State<AppState>, words: Value) -> Result<(), String> {
    let words = clean_tray_words(&words);
    let mut new = st.shared.settings.read().unwrap().clone();
    if new["general"]["trayWords"] == words {
        return Ok(()); // the usual case: nothing to write
    }
    new["general"]["trayWords"] = words;
    settings::save(&st.shared.paths.settings(), &new).map_err(|e| e.to_string())?;
    *st.shared.settings.write().unwrap() = new.clone();
    if let Some(items) = st.tray.lock().unwrap().as_ref() {
        apply(&items.worded, &new);
    }
    Ok(())
}

/// Set every worded tray entry to its word from `settings`.
pub fn apply(worded: &[(&'static str, Worded)], settings: &Value) {
    for (id, entry) in worded {
        if let Err(problem) = entry.set_text(&word(settings, id)) {
            crate::debug::log(format!("tray word {id} could not be set: {problem}"));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// The `appMenu` group of en.js, as `id: 'text'` pairs.
    fn english_file_words() -> Vec<(String, String)> {
        let source = include_str!("../../ui/settings/locales/en.js");
        let start = source.find("\n  appMenu: {\n").expect("an appMenu group in en.js");
        let group = &source[start..];
        let group = &group[..group.find("\n  },").expect("the end of the tray group")];
        group
            .lines()
            .filter_map(|line| {
                let (id, rest) = line.trim().split_once(": '")?;
                let (text, _note) = rest.split_once("',")?; // a `// means:` note may follow
                Some((id.to_string(), text.to_string()))
            })
            .collect()
    }

    #[test]
    fn the_english_words_match_the_language_file() {
        let expected: Vec<(String, String)> = ENGLISH
            .iter()
            .map(|(id, text)| (id.to_string(), text.to_string()))
            .collect();
        assert_eq!(english_file_words(), expected);
    }

    #[test]
    fn a_saved_word_wins_and_english_fills_the_rest() {
        let settings = json!({ "general": { "trayWords": { "quit": "Beenden" } } });
        assert_eq!(word(&settings, "quit"), "Beenden");
        assert_eq!(word(&settings, "open"), "Open settings");
        assert_eq!(word(&json!({}), "pause"), "Pause overlay");
    }

    #[test]
    fn only_known_short_single_line_words_are_kept() {
        let raw = json!({
            "quit": "Beenden",
            "open": "",
            "copy": "x".repeat(MAX_WORD_CHARS + 1),
            "pause": "two\nlines",
            "show": 5,
            "unknown": "kept?"
        });
        assert_eq!(clean_tray_words(&raw), json!({ "quit": "Beenden" }));
        assert_eq!(clean_tray_words(&json!("not an object")), json!({}));
    }
}
