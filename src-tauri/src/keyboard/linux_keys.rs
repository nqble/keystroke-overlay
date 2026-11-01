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
        86 => "IntlBackslash", // KEY_102ND: the extra key next to left Shift on ISO keyboards
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

/// Which keyboard an event came from: its place in the list of keyboards opened at start (linux_devices.rs).
pub type DeviceId = usize;

/// Turns raw presses and releases into clean state changes, like `KeyTracker` does on Windows: a press of a key that is
/// already down (key repeat) and a release of a key that is not down (a release from before capture started) are dropped.
/// Keys are tracked per keyboard, so a laptop's keyboard and an external one holding the same key make one press, and
/// the key goes up only when the last of them lets go (outside code review, 2026-11-01).
#[derive(Default)]
pub struct KeyFilter {
    /// The keys currently down, each with the keyboard holding it. A Vec, not a set: it rarely holds more than a few.
    held: Vec<(&'static str, DeviceId)>,
}

impl KeyFilter {
    /// The event to send for a raw press (`down`) or release of the key with this evdev code on keyboard `device`, if any.
    pub fn handle(&mut self, device: DeviceId, evdev_code: u32, down: bool) -> Option<KeyEvent> {
        let code = code_name(evdev_code)?;
        let position = self.held.iter().position(|&held| held == (code, device));
        match (down, position) {
            (true, Some(_)) | (false, None) => None,
            (true, None) => {
                let first = !self.is_held(code);
                self.held.push((code, device));
                first.then_some(KeyEvent { down, code })
            }
            (false, Some(index)) => {
                self.held.swap_remove(index);
                (!self.is_held(code)).then_some(KeyEvent { down, code })
            }
        }
    }

    /// Lets go of every key keyboard `device` holds (it was unplugged, or the system dropped some of its events and its
    /// releases may be lost), returning a release for each key no other keyboard still holds.
    pub fn forget_device(&mut self, device: DeviceId) -> Vec<KeyEvent> {
        let (gone, kept): (Vec<_>, Vec<_>) = self.held.iter().partition(|&&(_, holder)| holder == device);
        self.held = kept;
        let released = gone.into_iter().filter(|&(code, _)| !self.is_held(code));
        released.map(|(code, _)| KeyEvent { down: false, code }).collect()
    }

    fn is_held(&self, code: &str) -> bool {
        self.held.iter().any(|&(held, _)| held == code)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(events: &[(u32, bool)]) -> Vec<(bool, &'static str)> {
        let mut filter = KeyFilter::default();
        events
            .iter()
            .filter_map(|&(code, down)| filter.handle(0, code, down))
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
    fn the_iso_key_beside_left_shift_has_its_own_name() {
        assert_eq!(
            run(&[(86, true), (86, false)]),
            vec![(true, "IntlBackslash"), (false, "IntlBackslash")]
        );
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

    #[test]
    fn two_keyboards_holding_the_same_key_make_one_press_until_both_let_go() {
        let mut filter = KeyFilter::default();
        let laptop = 0;
        let external = 1;
        assert_eq!(filter.handle(laptop, 17, true).map(|e| e.down), Some(true));
        assert!(filter.handle(external, 17, true).is_none(), "already shown as down");
        assert!(
            filter.handle(laptop, 17, false).is_none(),
            "the external keyboard still holds W"
        );
        assert_eq!(filter.handle(external, 17, false).map(|e| e.down), Some(false));
    }

    #[test]
    fn an_unplugged_keyboard_lets_go_of_its_keys_but_not_the_others() {
        let mut filter = KeyFilter::default();
        filter.handle(0, 17, true); // W on keyboard 0
        filter.handle(0, 30, true); // A on keyboard 0
        filter.handle(1, 30, true); // A on keyboard 1 too
        let released: Vec<_> = filter.forget_device(0).into_iter().map(|e| (e.down, e.code)).collect();
        assert_eq!(released, vec![(false, "KeyW")], "A is still held on keyboard 1");
        assert_eq!(filter.handle(1, 30, false).map(|e| e.code), Some("KeyA"));
        assert!(filter.forget_device(5).is_empty());
    }
}
