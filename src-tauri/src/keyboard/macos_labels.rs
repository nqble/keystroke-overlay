//! macOS: what each typing key prints on the user's own keyboard, for key labels that follow the keyboard language
//! (docs/MAC-PORT.md, src-tauri/src/key_labels.rs). Same rules as the Windows version in platform.rs: the US keyboard
//! gives nothing (the layout files are written for it), only the typing keys are asked, and a key that does not print one
//! visible character keeps its layout label.
//!
//! macOS answers through the Text Input Sources and Unicode keyboard layout calls (Carbon, no crate). The current
//! keyboard layout is asked once at start-up, on the main thread, which these calls require. Nothing about what the
//! user types is read: a key is looked up on the layout table, as a map, never from a real key press.

use super::keymap::TYPING_KEYS;
use super::macos_keys::keycode_for;
use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::OnceLock;

/// The layouts that print what the US layout files already say: the "U.S." layout and Apple's "ABC" layout.
const US_LAYOUT_IDS: [&str; 2] = ["com.apple.keylayout.US", "com.apple.keylayout.ABC"];

/// `kUCKeyActionDisplay`: what the key would show on a keycap, with no modifier held and no dead key started.
const KEY_ACTION_DISPLAY: u16 = 3;
/// `kUCKeyTranslateNoDeadKeysBit` as an option mask: a key that starts an accent gives its own character.
const NO_DEAD_KEYS: u32 = 1;
/// `kCFStringEncodingUTF8`.
const UTF8: u32 = 0x0800_0100;
/// How many characters one key may print before it is not a single label (the answer must be exactly one).
const MAX_TYPED: usize = 4;
/// The longest layout id we read (they are short, like "com.apple.keylayout.French").
const ID_BUFFER: usize = 128;

/// `CFNotificationSuspensionBehaviorDeliverImmediately`: tell us at once, not when the app next comes forward.
const DELIVER_IMMEDIATELY: isize = 4;

#[link(name = "Carbon", kind = "framework")]
extern "C" {
    static kTISNotifySelectedKeyboardInputSourceChanged: *const c_void;
    static kTISPropertyUnicodeKeyLayoutData: *const c_void;
    static kTISPropertyInputSourceID: *const c_void;
    fn TISCopyCurrentKeyboardLayoutInputSource() -> *const c_void;
    fn TISGetInputSourceProperty(source: *const c_void, key: *const c_void) -> *const c_void;
    fn LMGetKbdType() -> u8;
    #[allow(clippy::too_many_arguments)] // the shape of Apple's function
    fn UCKeyTranslate(
        key_layout: *const u8,
        virtual_key_code: u16,
        key_action: u16,
        modifier_key_state: u32,
        keyboard_type: u32,
        key_translate_options: u32,
        dead_key_state: *mut u32,
        max_string_length: usize,
        actual_string_length: *mut usize,
        unicode_string: *mut u16,
    ) -> i32;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFDataGetBytePtr(data: *const c_void) -> *const u8;
    fn CFStringGetCString(string: *const c_void, buffer: *mut u8, buffer_size: isize, encoding: u32) -> u8;
    fn CFRelease(object: *const c_void);
    fn CFNotificationCenterGetDistributedCenter() -> *const c_void;
    #[allow(clippy::too_many_arguments)] // the shape of Apple's function
    fn CFNotificationCenterAddObserver(
        center: *const c_void,
        observer: *const c_void,
        callback: extern "C" fn(*const c_void, *mut c_void, *const c_void, *const c_void, *const c_void),
        name: *const c_void,
        object: *const c_void,
        suspension_behavior: isize,
    );
}

/// What to do when the person switches keyboard layout (set once by `watch`).
static ON_LAYOUT_CHANGE: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();

extern "C" fn layout_changed(
    _center: *const c_void,
    _observer: *mut c_void,
    _name: *const c_void,
    _object: *const c_void,
    _info: *const c_void,
) {
    if let Some(on_change) = ON_LAYOUT_CHANGE.get() {
        on_change();
    }
}

/// Ask macOS to tell us whenever the person switches keyboard layout (the menu-bar input menu or a shortcut). It sends a
/// system-wide notification, so nothing runs while the layout stays the same. Call it once, on the main thread, which
/// is the thread whose run loop then delivers the notification.
pub fn watch(on_change: Box<dyn Fn() + Send + Sync>) {
    if ON_LAYOUT_CHANGE.set(on_change).is_err() {
        return;
    }
    // SAFETY: the distributed center is the system's own and lives for the whole run; the callback is a plain function
    // that never unwinds; the notification name is the system's own constant string.
    unsafe {
        CFNotificationCenterAddObserver(
            CFNotificationCenterGetDistributedCenter(),
            std::ptr::null(),
            layout_changed,
            kTISNotifySelectedKeyboardInputSourceChanged,
            std::ptr::null(),
            DELIVER_IMMEDIATELY,
        );
    }
}

/// Is this layout id one that prints the same as the US layout files?
fn is_us_layout(layout_id: &str) -> bool {
    US_LAYOUT_IDS.contains(&layout_id)
}

/// The current keyboard layout's id, like "com.apple.keylayout.French".
///
/// # Safety
/// `source` must be a live TISInputSourceRef.
unsafe fn layout_id(source: *const c_void) -> Option<String> {
    let id = TISGetInputSourceProperty(source, kTISPropertyInputSourceID);
    if id.is_null() {
        return None;
    }
    let mut buffer = [0u8; ID_BUFFER];
    if CFStringGetCString(id, buffer.as_mut_ptr(), ID_BUFFER as isize, UTF8) == 0 {
        return None;
    }
    let length = buffer.iter().position(|&byte| byte == 0)?;
    String::from_utf8(buffer[..length].to_vec()).ok()
}

/// What the key with this Mac key code prints on this layout: the one character, or None.
///
/// # Safety
/// `layout` must point to a live UCKeyboardLayout table.
unsafe fn typed_by(layout: *const u8, keycode: u16) -> Option<u16> {
    let mut dead_key_state = 0u32;
    let mut typed = [0u16; MAX_TYPED];
    let mut length = 0usize;
    let status = UCKeyTranslate(
        layout,
        keycode,
        KEY_ACTION_DISPLAY,
        0,
        LMGetKbdType() as u32,
        NO_DEAD_KEYS,
        &mut dead_key_state,
        MAX_TYPED,
        &mut length,
        typed.as_mut_ptr(),
    );
    (status == 0 && length == 1).then_some(typed[0])
}

/// The labels of the typing keys on the user's keyboard: {"KeyQ": "A", ...} on a French AZERTY keyboard. Empty on a US
/// keyboard, or when macOS does not give a layout table (some input methods have none). Call it on the main thread.
pub fn keyboard_labels() -> HashMap<&'static str, String> {
    let mut labels = HashMap::new();
    // SAFETY: the calls follow Apple's documented use. The input source is checked for null, released once at the end,
    // and the layout table it owns is only read while the source is alive.
    unsafe {
        let source = TISCopyCurrentKeyboardLayoutInputSource();
        if source.is_null() {
            return labels;
        }
        let is_us = layout_id(source).is_some_and(|id| is_us_layout(&id));
        let layout_data = TISGetInputSourceProperty(source, kTISPropertyUnicodeKeyLayoutData);
        if !is_us && !layout_data.is_null() {
            let layout = CFDataGetBytePtr(layout_data);
            for &(code, _) in TYPING_KEYS {
                let Some(keycode) = keycode_for(code) else { continue };
                let label = typed_by(layout, keycode).and_then(crate::key_labels::label_for);
                if let Some(label) = label {
                    labels.insert(code, label);
                }
            }
        }
        CFRelease(source);
    }
    labels
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_us_and_abc_layouts_need_no_labels() {
        assert!(is_us_layout("com.apple.keylayout.US"));
        assert!(is_us_layout("com.apple.keylayout.ABC"));
        assert!(!is_us_layout("com.apple.keylayout.French"));
        assert!(!is_us_layout("com.apple.keylayout.Dvorak"));
    }

    /// Every key whose label can follow the keyboard has a Mac key code, or the Mac would silently keep QWERTY for it.
    #[test]
    fn every_typing_key_has_a_mac_key_code() {
        for &(code, _) in TYPING_KEYS {
            assert!(keycode_for(code).is_some(), "{code} has no macOS key code");
        }
    }
}
