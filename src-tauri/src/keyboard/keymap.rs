//! Key naming: maps (virtual key, scancode, extended flag) to DOM `KeyboardEvent.code` names (used by layouts).
//! Shared by every capture method, so they all name keys identically.

/// Map a key event (virtual key, scancode, extended flag) to a DOM `KeyboardEvent.code`-style name (used by layouts).
pub fn code_name(vk: u32, sc: u32, ext: bool) -> Option<&'static str> {
    if vk == 0x13 {
        return Some("Pause");
    }
    if vk == 0x90 {
        return Some("NumLock");
    }
    let sc = sc as u8;
    Some(match (sc, ext) {
        (0x01, _) => "Escape",
        (0x02, _) => "Digit1",
        (0x03, _) => "Digit2",
        (0x04, _) => "Digit3",
        (0x05, _) => "Digit4",
        (0x06, _) => "Digit5",
        (0x07, _) => "Digit6",
        (0x08, _) => "Digit7",
        (0x09, _) => "Digit8",
        (0x0A, _) => "Digit9",
        (0x0B, _) => "Digit0",
        (0x0C, _) => "Minus",
        (0x0D, _) => "Equal",
        (0x0E, _) => "Backspace",
        (0x0F, _) => "Tab",
        (0x10, _) => "KeyQ",
        (0x11, _) => "KeyW",
        (0x12, _) => "KeyE",
        (0x13, _) => "KeyR",
        (0x14, _) => "KeyT",
        (0x15, _) => "KeyY",
        (0x16, _) => "KeyU",
        (0x17, _) => "KeyI",
        (0x18, _) => "KeyO",
        (0x19, _) => "KeyP",
        (0x1A, _) => "BracketLeft",
        (0x1B, _) => "BracketRight",
        (0x1C, false) => "Enter",
        (0x1C, true) => "NumpadEnter",
        (0x1D, false) => "ControlLeft",
        (0x1D, true) => "ControlRight",
        (0x1E, _) => "KeyA",
        (0x1F, _) => "KeyS",
        (0x20, _) => "KeyD",
        (0x21, _) => "KeyF",
        (0x22, _) => "KeyG",
        (0x23, _) => "KeyH",
        (0x24, _) => "KeyJ",
        (0x25, _) => "KeyK",
        (0x26, _) => "KeyL",
        (0x27, _) => "Semicolon",
        (0x28, _) => "Quote",
        (0x29, _) => "Backquote",
        (0x2A, _) => "ShiftLeft",
        (0x2B, _) => "Backslash",
        (0x2C, _) => "KeyZ",
        (0x2D, _) => "KeyX",
        (0x2E, _) => "KeyC",
        (0x2F, _) => "KeyV",
        (0x30, _) => "KeyB",
        (0x31, _) => "KeyN",
        (0x32, _) => "KeyM",
        (0x33, _) => "Comma",
        (0x34, _) => "Period",
        (0x35, false) => "Slash",
        (0x35, true) => "NumpadDivide",
        (0x36, _) => "ShiftRight",
        (0x37, false) => "NumpadMultiply",
        (0x37, true) => "PrintScreen",
        (0x38, false) => "AltLeft",
        (0x38, true) => "AltRight",
        (0x39, _) => "Space",
        (0x3A, _) => "CapsLock",
        (0x3B, _) => "F1",
        (0x3C, _) => "F2",
        (0x3D, _) => "F3",
        (0x3E, _) => "F4",
        (0x3F, _) => "F5",
        (0x40, _) => "F6",
        (0x41, _) => "F7",
        (0x42, _) => "F8",
        (0x43, _) => "F9",
        (0x44, _) => "F10",
        (0x46, _) => "ScrollLock",
        (0x47, false) => "Numpad7",
        (0x47, true) => "Home",
        (0x48, false) => "Numpad8",
        (0x48, true) => "ArrowUp",
        (0x49, false) => "Numpad9",
        (0x49, true) => "PageUp",
        (0x4A, _) => "NumpadSubtract",
        (0x4B, false) => "Numpad4",
        (0x4B, true) => "ArrowLeft",
        (0x4C, _) => "Numpad5",
        (0x4D, false) => "Numpad6",
        (0x4D, true) => "ArrowRight",
        (0x4E, _) => "NumpadAdd",
        (0x4F, false) => "Numpad1",
        (0x4F, true) => "End",
        (0x50, false) => "Numpad2",
        (0x50, true) => "ArrowDown",
        (0x51, false) => "Numpad3",
        (0x51, true) => "PageDown",
        (0x52, false) => "Numpad0",
        (0x52, true) => "Insert",
        (0x53, false) => "NumpadDecimal",
        (0x53, true) => "Delete",
        (0x56, _) => "IntlBackslash", // the extra key next to left Shift on ISO keyboards (UK, German, ...)
        (0x57, _) => "F11",
        (0x58, _) => "F12",
        (0x5B, _) => "MetaLeft",
        (0x5C, _) => "MetaRight",
        (0x5D, _) => "ContextMenu",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::code_name;
    #[test]
    fn maps_plain_and_extended_keys() {
        assert_eq!(code_name(0x57, 0x11, false), Some("KeyW"));
        assert_eq!(code_name(0x0D, 0x1C, false), Some("Enter"));
        assert_eq!(code_name(0x0D, 0x1C, true), Some("NumpadEnter"));
        assert_eq!(code_name(0x27, 0x4D, true), Some("ArrowRight"));
        assert_eq!(code_name(0x66, 0x4D, false), Some("Numpad6"));
        assert_eq!(code_name(0xA3, 0x1D, true), Some("ControlRight"));
        assert_eq!(code_name(0x13, 0x45, false), Some("Pause"));
        assert_eq!(code_name(0x90, 0x45, true), Some("NumLock"));
    }
    #[test]
    fn the_iso_key_beside_left_shift_has_its_own_name() {
        assert_eq!(code_name(0xE2, 0x56, false), Some("IntlBackslash"));
        assert_eq!(code_name(0xDC, 0x2B, false), Some("Backslash")); // the other \ key stays itself
    }
    #[test]
    fn unknown_keys_are_ignored() {
        assert_eq!(code_name(0xFF, 0x7F, false), None);
    }
}
