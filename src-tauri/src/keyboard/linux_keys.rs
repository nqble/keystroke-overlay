//! Key naming and repeat filtering for Linux capture methods (docs/LINUX-PORT.md).
//!
//! Linux numbers keys the same way everywhere: the kernel's evdev key codes (linux/input-event-codes.h). X11 reports the
//! same numbers plus 8 (`X11_KEYCODE_OFFSET`). Codes are physical positions, like Windows scancodes, so a key is named the
//! same on every keyboard language and these names match keymap.rs exactly. Plain logic, so the tests run on any system.

use super::KeyEvent;

/// X11 key codes are evdev key codes plus this.
pub const X11_KEYCODE_OFFSET: u32 = 8;

/// Map an evdev key code to a DOM `KeyboardEvent.code`-style name (the same names as keymap.rs).
pub fn code_name(evdev_code: u32) -> Option<&'static str> {
    Some(match evdev_code {
        1 => "Escape",
        2 => "Digit1",
        3 => "Digit2",
        4 => "Digit3",
        5 => "Digit4",
        6 => "Digit5",
        7 => "Digit6",
        8 => "Digit7",
        9 => "Digit8",
        10 => "Digit9",
        11 => "Digit0",
        12 => "Minus",
        13 => "Equal",
        14 => "Backspace",
        15 => "Tab",
        16 => "KeyQ",
        17 => "KeyW",
        18 => "KeyE",
        19 => "KeyR",
        20 => "KeyT",
        21 => "KeyY",
        22 => "KeyU",
        23 => "KeyI",
        24 => "KeyO",
        25 => "KeyP",
        26 => "BracketLeft",
        27 => "BracketRight",
        28 => "Enter",
        29 => "ControlLeft",
        30 => "KeyA",
        31 => "KeyS",
        32 => "KeyD",
        33 => "KeyF",
        34 => "KeyG",
        35 => "KeyH",
        36 => "KeyJ",
        37 => "KeyK",
        38 => "KeyL",
        39 => "Semicolon",
        40 => "Quote",
        41 => "Backquote",
        42 => "ShiftLeft",
        43 => "Backslash",
        44 => "KeyZ",
        45 => "KeyX",
        46 => "KeyC",
        47 => "KeyV",
        48 => "KeyB",
        49 => "KeyN",
        50 => "KeyM",
        51 => "Comma",
        52 => "Period",
        53 => "Slash",
        54 => "ShiftRight",
        55 => "NumpadMultiply",
        56 => "AltLeft",
        57 => "Space",
        58 => "CapsLock",
        59 => "F1",
        60 => "F2",
        61 => "F3",
        62 => "F4",
        63 => "F5",
        64 => "F6",
        65 => "F7",
        66 => "F8",
        67 => "F9",
        68 => "F10",
        69 => "NumLock",
        70 => "ScrollLock",
        71 => "Numpad7",
        72 => "Numpad8",
        73 => "Numpad9",
        74 => "NumpadSubtract",
        75 => "Numpad4",
        76 => "Numpad5",
        77 => "Numpad6",
        78 => "NumpadAdd",
        79 => "Numpad1",
        80 => "Numpad2",
        81 => "Numpad3",
        82 => "Numpad0",
        83 => "NumpadDecimal",
        87 => "F11",
        88 => "F12",
        96 => "NumpadEnter",
        97 => "ControlRight",
        98 => "NumpadDivide",
        99 => "PrintScreen",
        100 => "AltRight",
        102 => "Home",
        103 => "ArrowUp",
        104 => "PageUp",
        105 => "ArrowLeft",
        106 => "ArrowRight",
        107 => "End",
        108 => "ArrowDown",
        109 => "PageDown",
        110 => "Insert",
        111 => "Delete",
        119 => "Pause",
        125 => "MetaLeft",
        126 => "MetaRight",
        127 => "ContextMenu",
        _ => return None,
    })
}

/// Turns raw presses and releases into clean state changes, like `KeyTracker` does on Windows: a press of a key that is
/// already down (key repeat) and a release of a key that is not down (a release from before capture started) are dropped.
#[derive(Default)]
pub struct KeyFilter {
    /// The keys currently down. A Vec, not a set: it rarely holds more than a few keys.
    held: Vec<&'static str>,
}

impl KeyFilter {
    /// The event to send for a raw press (`down`) or release of the key with this evdev code, if any.
    pub fn handle(&mut self, evdev_code: u32, down: bool) -> Option<KeyEvent> {
        let code = code_name(evdev_code)?;
        let position = self.held.iter().position(|&held| held == code);
        match (down, position) {
            (true, Some(_)) | (false, None) => None,
            (true, None) => {
                self.held.push(code);
                Some(KeyEvent { down, code })
            }
            (false, Some(index)) => {
                self.held.swap_remove(index);
                Some(KeyEvent { down, code })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(events: &[(u32, bool)]) -> Vec<(bool, &'static str)> {
        let mut filter = KeyFilter::default();
        events
            .iter()
            .filter_map(|&(code, down)| filter.handle(code, down))
            .map(|event| (event.down, event.code))
            .collect()
    }

    #[test]
    fn press_and_release() {
        assert_eq!(run(&[(17, true), (17, false)]), vec![(true, "KeyW"), (false, "KeyW")]);
    }

    #[test]
    fn key_repeat_is_ignored() {
        assert_eq!(
            run(&[(30, true), (30, true), (30, true), (30, false)]),
            vec![(true, "KeyA"), (false, "KeyA")]
        );
    }

    #[test]
    fn release_without_press_is_ignored() {
        assert_eq!(run(&[(57, false)]), vec![]);
    }

    #[test]
    fn unknown_codes_are_ignored() {
        assert_eq!(run(&[(240, true), (240, false)]), vec![]);
    }

    #[test]
    fn left_and_right_modifiers_are_separate() {
        assert_eq!(
            run(&[(42, true), (54, true), (42, false), (54, false)]),
            vec![
                (true, "ShiftLeft"),
                (true, "ShiftRight"),
                (false, "ShiftLeft"),
                (false, "ShiftRight")
            ]
        );
    }

    /// Every name Linux produces must be one the Windows table (keymap.rs) also produces, so layouts work the same.
    #[test]
    fn names_match_the_windows_table() {
        let windows_names = include_str!("keymap.rs");
        for evdev_code in 0..256 {
            if let Some(name) = code_name(evdev_code) {
                assert!(
                    windows_names.contains(&format!("\"{name}\"")),
                    "{name} is not in keymap.rs"
                );
            }
        }
    }
}
