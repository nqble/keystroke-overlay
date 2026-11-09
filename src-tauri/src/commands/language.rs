//! The settings window's language (docs/proposals/interface-languages.md, step 2): which language files ship with the
//! app, and the saved choice. `ui/settings/start.js` asks for both before the window's code loads, picks the file, and
//! only then starts the window. Adding a language is one file in `ui/settings/locales/`; this list follows it.
use include_dir::{include_dir, Dir};
use serde_json::{json, Value};
use tauri::State;

use crate::state::AppState;

static LOCALES: Dir = include_dir!("$CARGO_MANIFEST_DIR/../ui/settings/locales");

/// The longest language code accepted (`zh-Hant-TW` is 10): only a bound on the saved text.
const MAX_CODE_LENGTH: usize = 16;

/// The saved choice and the languages there are files for (`en`, `de`, `pt-BR`…), in code order.
#[tauri::command]
pub fn get_language(st: State<AppState>) -> Value {
    let chosen = st.shared.settings.read().unwrap()["general"]["language"].clone();
    json!({ "chosen": chosen, "available": language_codes() })
}

/// The codes of the language files the app ships: each `ui/settings/locales/<code>.js`.
pub fn language_codes() -> Vec<String> {
    let mut codes: Vec<String> = LOCALES
        .files()
        .filter_map(|file| {
            file.path()
                .file_name()?
                .to_str()?
                .strip_suffix(".js")
                .map(str::to_owned)
        })
        .collect();
    codes.sort();
    codes
}

/// The setting `general.language`: `""` for "Same as this computer", or a language code in its usual form (letters,
/// digits and dashes, starting with a letter). A code with no file left is allowed: the window falls back to English.
pub fn is_language_choice(text: &str) -> bool {
    text.is_empty()
        || (text.len() <= MAX_CODE_LENGTH
            && text.starts_with(|c: char| c.is_ascii_lowercase())
            && text.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn english_ships_and_every_file_is_a_valid_code() {
        let codes = language_codes();
        assert!(codes.contains(&"en".to_string()), "{codes:?}");
        assert!(codes.iter().all(|code| is_language_choice(code)), "{codes:?}");
    }

    #[test]
    fn a_language_choice_is_empty_or_a_code() {
        for good in ["", "en", "de", "pt-BR", "zh-Hans"] {
            assert!(is_language_choice(good), "{good}");
        }
        for bad in ["EN", "-de", "de_DE", "../en", "en.js", "a-very-long-language-code"] {
            assert!(!is_language_choice(bad), "{bad}");
        }
    }
}
