//! Key naming and repeat filtering for macOS capture (docs/MAC-PORT.md).
//!
//! macOS numbers keys with "virtual key codes" (`kVK_*` in HIToolbox/Events.h). Despite the name they are physical
//! positions on the keyboard, like Windows scancodes, so the key left of `S` is `KeyA` on every keyboard language and
//! these names match keymap.rs exactly. Plain logic, so the tests run on any system; the event tap itself is macos.rs.

use super::KeyEvent;

/// Map a macOS virtual key code to a DOM `KeyboardEvent.code`-style name (the same names as keymap.rs).
pub fn code_name(mac_keycode: u16) -> Option<&'static str> {
    Some(match mac_keycode {
        0 => "KeyA",
        1 => "KeyS",
        2 => "KeyD",
        3 => "KeyF",
        4 => "KeyH",
        5 => "KeyG",
        6 => "KeyZ",
        7 => "KeyX",
        8 => "KeyC",
        9 => "KeyV",
        10 => "IntlBackslash", // kVK_ISO_Section: the extra key next to left Shift on ISO keyboards
        11 => "KeyB",
        12 => "KeyQ",
        13 => "KeyW",
        14 => "KeyE",
        15 => "KeyR",
        16 => "KeyY",
        17 => "KeyT",
        18 => "Digit1",
        19 => "Digit2",
        20 => "Digit3",
        21 => "Digit4",
        22 => "Digit6",
        23 => "Digit5",
        24 => "Equal",
        25 => "Digit9",
        26 => "Digit7",
        27 => "Minus",
        28 => "Digit8",
        29 => "Digit0",
        30 => "BracketRight",
        31 => "KeyO",
        32 => "KeyU",
        33 => "BracketLeft",
        34 => "KeyI",
        35 => "KeyP",
        36 => "Enter",
        37 => "KeyL",
        38 => "KeyJ",
        39 => "Quote",
        40 => "KeyK",
        41 => "Semicolon",
        42 => "Backslash",
        43 => "Comma",
        44 => "Slash",
        45 => "KeyN",
        46 => "KeyM",
        47 => "Period",
        48 => "Tab",
        49 => "Space",
        50 => "Backquote",
        51 => "Backspace", // the key Apple calls "delete"
        53 => "Escape",
        54 => "MetaRight",
        55 => "MetaLeft",
        56 => "ShiftLeft",
        57 => "CapsLock",
        58 => "AltLeft",
        59 => "ControlLeft",
        60 => "ShiftRight",
        61 => "AltRight",
        62 => "ControlRight",
        65 => "NumpadDecimal",
        67 => "NumpadMultiply",
        69 => "NumpadAdd",
        71 => "NumLock", // the numpad "clear" key
        75 => "NumpadDivide",
        76 => "NumpadEnter",
        78 => "NumpadSubtract",
        82 => "Numpad0",
        83 => "Numpad1",
        84 => "Numpad2",
        85 => "Numpad3",
        86 => "Numpad4",
        87 => "Numpad5",
        88 => "Numpad6",
        89 => "Numpad7",
        91 => "Numpad8",
        92 => "Numpad9",
        96 => "F5",
        97 => "F6",
        98 => "F7",
        99 => "F3",
        100 => "F8",
        101 => "F9",
        103 => "F11",
        109 => "F10",
        110 => "ContextMenu",
        111 => "F12",
        114 => "Insert", // the "help" key on old Apple keyboards
        115 => "Home",
        116 => "PageUp",
        117 => "Delete", // forward delete
        118 => "F4",
        119 => "End",
        120 => "F2",
        121 => "PageDown",
        122 => "F1",
        123 => "ArrowLeft",
        124 => "ArrowRight",
        125 => "ArrowDown",
        126 => "ArrowUp",
        _ => return None,
    })
}

/// Modifier keys don't send key-down and key-up events on macOS, only "flags changed" events. The flags carry one bit
/// per physical modifier key (the "device-dependent" bits, `NX_DEVICE*KEYMASK` in IOKit/hidsystem/IOLLEvent.h), so the
/// bit for this key tells whether it went down or up. Returns that bit, or None for a key that is not a modifier.
pub fn modifier_flag_bit(mac_keycode: u16) -> Option<u64> {
    Some(match mac_keycode {
        59 => 0x0000_0001, // left control
        56 => 0x0000_0002, // left shift
        60 => 0x0000_0004, // right shift
        55 => 0x0000_0008, // left command
        54 => 0x0000_0010, // right command
        58 => 0x0000_0020, // left option
        61 => 0x0000_0040, // right option
        62 => 0x0000_2000, // right control
        57 => 0x0001_0000, // caps lock (the "alpha shift" bit: on while caps lock is on)
        _ => return None,
    })
}

/// Is this modifier key down, judging by the event's flags?
pub fn modifier_is_down(mac_keycode: u16, flags: u64) -> bool {
    match modifier_flag_bit(mac_keycode) {
        Some(bit) => flags & bit != 0,
        None => false,
    }
}

/// Turns raw presses and releases into clean state changes, like `KeyTracker` does on Windows: key repeat and releases
/// of keys that are not down are dropped, and a key that macOS says is up although we never saw it released (for
/// example because Secure Input swallowed the release) is released now, so the overlay can never get stuck.
#[derive(Default)]
pub struct MacKeyFilter {
    /// The keys currently down, as (virtual key code, name). A Vec, not a set: it rarely holds more than a few keys.
    held: Vec<(u16, &'static str)>,
}

impl MacKeyFilter {
    /// The events to send for a raw press (`down`) or release of this key. `still_down` asks macOS whether a key is
    /// really held right now; it is only used to find stuck keys.
    pub fn handle(&mut self, mac_keycode: u16, down: bool, still_down: &dyn Fn(u16) -> bool) -> Vec<KeyEvent> {
        let Some(code) = code_name(mac_keycode) else {
            return Vec::new();
        };
        let mut events = self.release_stuck_keys(mac_keycode, still_down);
        let position = self
            .held
            .iter()
            .position(|&(held_keycode, _)| held_keycode == mac_keycode);
        match (down, position) {
            (true, Some(_)) | (false, None) => {}
            (true, None) => {
                self.held.push((mac_keycode, code));
                events.push(KeyEvent { down, code });
            }
            (false, Some(index)) => {
                self.held.swap_remove(index);
                events.push(KeyEvent { down, code });
            }
        }
        events
    }

    /// Release every held key, for when the tap was switched off and releases may have been missed.
    pub fn release_all(&mut self) -> Vec<KeyEvent> {
        let released = self.held.drain(..);
        released.map(|(_, code)| KeyEvent { down: false, code }).collect()
    }

    /// Release the held keys (other than the one in this event) that macOS says are up.
    fn release_stuck_keys(&mut self, current_keycode: u16, still_down: &dyn Fn(u16) -> bool) -> Vec<KeyEvent> {
        let mut events = Vec::new();
        self.held.retain(|&(held_keycode, code)| {
            if held_keycode == current_keycode || still_down(held_keycode) {
                return true;
            }
            events.push(KeyEvent { down: false, code });
            false
        });
        events
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn always_down(_keycode: u16) -> bool {
        true
    }

    fn run(events: &[(u16, bool)]) -> Vec<(bool, &'static str)> {
        let mut filter = MacKeyFilter::default();
        events
            .iter()
            .flat_map(|&(keycode, down)| filter.handle(keycode, down, &always_down))
            .map(|event| (event.down, event.code))
            .collect()
    }

    #[test]
    fn press_and_release() {
        assert_eq!(run(&[(13, true), (13, false)]), vec![(true, "KeyW"), (false, "KeyW")]);
    }

    #[test]
    fn key_repeat_is_ignored() {
        assert_eq!(
            run(&[(0, true), (0, true), (0, true), (0, false)]),
            vec![(true, "KeyA"), (false, "KeyA")]
        );
    }

    #[test]
    fn release_without_press_is_ignored() {
        assert_eq!(run(&[(49, false)]), vec![]);
    }

    #[test]
    fn unknown_codes_are_ignored() {
        assert_eq!(run(&[(200, true), (200, false)]), vec![]);
    }

    #[test]
    fn left_and_right_modifiers_are_separate() {
        assert_eq!(
            run(&[(56, true), (60, true), (56, false), (60, false)]),
            vec![
                (true, "ShiftLeft"),
                (true, "ShiftRight"),
                (false, "ShiftLeft"),
                (false, "ShiftRight")
            ]
        );
    }

    #[test]
    fn the_modifier_bit_tells_down_from_up() {
        let left_shift_down = 0x0002;
        assert!(modifier_is_down(56, left_shift_down));
        assert!(!modifier_is_down(60, left_shift_down), "right shift is a different bit");
        assert!(!modifier_is_down(56, 0));
        assert!(!modifier_is_down(13, u64::MAX), "KeyW is not a modifier");
    }

    #[test]
    fn a_key_macos_says_is_up_is_released_on_the_next_event() {
        let mut filter = MacKeyFilter::default();
        filter.handle(13, true, &always_down); // W goes down, its release is never seen
        let nothing_is_down = |_keycode: u16| false;
        let events = filter.handle(0, true, &nothing_is_down); // A goes down
        let seen: Vec<_> = events.iter().map(|event| (event.down, event.code)).collect();
        assert_eq!(seen, vec![(false, "KeyW"), (true, "KeyA")]);
    }

    #[test]
    fn the_key_in_the_event_is_never_judged_stuck() {
        let mut filter = MacKeyFilter::default();
        filter.handle(13, true, &always_down);
        let nothing_is_down = |_keycode: u16| false;
        let events = filter.handle(13, false, &nothing_is_down);
        let seen: Vec<_> = events.iter().map(|event| (event.down, event.code)).collect();
        assert_eq!(seen, vec![(false, "KeyW")], "released once, not twice");
    }

    #[test]
    fn release_all_lets_go_of_every_held_key() {
        let mut filter = MacKeyFilter::default();
        filter.handle(13, true, &always_down);
        filter.handle(56, true, &always_down);
        assert_eq!(filter.release_all().len(), 2);
        assert!(filter.release_all().is_empty());
    }

    /// Every name macOS produces must be one the Windows table (keymap.rs) also produces, so layouts work the same.
    #[test]
    fn names_match_the_windows_table() {
        let windows_names = include_str!("keymap.rs");
        for mac_keycode in 0..256 {
            if let Some(name) = code_name(mac_keycode) {
                assert!(
                    windows_names.contains(&format!("\"{name}\"")),
                    "{name} is not in keymap.rs"
                );
            }
        }
    }

    #[test]
    fn no_two_key_codes_share_a_name() {
        let mut names: Vec<&str> = (0..256).filter_map(code_name).collect();
        let total = names.len();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), total);
    }

    #[test]
    fn every_modifier_key_has_a_name() {
        for mac_keycode in 0..256 {
            if modifier_flag_bit(mac_keycode).is_some() {
                assert!(code_name(mac_keycode).is_some(), "modifier {mac_keycode} has no name");
            }
        }
    }
}
