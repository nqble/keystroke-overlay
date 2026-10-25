//! Windows: what each typing key prints on the user's own keyboard, for key labels that follow the keyboard language
//! (src-tauri/src/key_labels.rs), and a watcher that says when the layout may have changed. Same rules as the Mac and
//! Linux versions: the US English keyboard gives nothing (the layout files are written for it), only the typing keys
//! are asked (keyboard/keymap.rs TYPING_KEYS, so the digit row keeps its digits), and a key that doesn't print one
//! visible character keeps its layout label.
//!
//! Windows keeps a keyboard layout per window, so the layout that counts is the one of the window in front (the game),
//! not the PC's default. It changes two ways, and both are noticed without a timer:
//! - another window comes to the front: Windows announces it (a WinEvent hook on its own thread, which waits for
//!   messages and so uses no CPU in between);
//! - the person switches layout inside the same window (Win+Space, Alt+Shift): that ends with a modifier key being let
//!   go, so key_labels asks again shortly after one is released (`SWITCH_KEYS`).
//!
//! Nothing about what is typed is read: a key is looked up on the layout, never from a real key press.

use super::keymap::TYPING_KEYS;
use std::collections::HashMap;
use std::sync::OnceLock;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetKeyboardLayout, MapVirtualKeyExW, ToUnicodeEx, HKL, MAPVK_VSC_TO_VK_EX,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetForegroundWindow, GetMessageW, GetWindowThreadProcessId, SystemParametersInfoW,
    EVENT_SYSTEM_FOREGROUND, MSG, SPI_GETDEFAULTINPUTLANG, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS, WINEVENT_OUTOFCONTEXT,
    WINEVENT_SKIPOWNPROCESS,
};

/// The US English keyboard: language 0x0409 with layout 0x0409 (the low 32 bits of its HKL).
const US_ENGLISH: u32 = 0x0409_0409;
/// ToUnicodeEx flag: don't change the keyboard state while asking (Windows 10 1607 and later).
const KEEP_KEYBOARD_STATE: u32 = 0x4;

/// The keys whose release can end a layout switch inside one window (Win+Space, Alt+Shift, Ctrl+Shift), as the overlay
/// names them. key_labels asks again shortly after one of these is let go.
pub const SWITCH_KEYS: &[&str] = &[
    "ShiftLeft",
    "ShiftRight",
    "AltLeft",
    "AltRight",
    "ControlLeft",
    "ControlRight",
    "MetaLeft",
    "MetaRight",
];

/// What the watcher calls when another window comes to the front.
static ON_FOREGROUND_CHANGE: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();

/// Is this the US English keyboard, which prints what the layout files already show?
fn is_us_english(keyboard: HKL) -> bool {
    keyboard.0 as usize as u32 == US_ENGLISH
}

/// The keyboard layout of the window in front, or the PC's default when there is none (the desktop has focus) or
/// Windows can't tell.
fn layout_in_use() -> Option<HKL> {
    // SAFETY: plain queries; a null window or thread id gives a null layout, which is checked.
    let in_front = unsafe {
        let window = GetForegroundWindow();
        let thread = GetWindowThreadProcessId(window, None);
        GetKeyboardLayout(thread)
    };
    if !in_front.0.is_null() {
        return Some(in_front);
    }
    default_layout()
}

/// The default keyboard in Windows' language settings.
fn default_layout() -> Option<HKL> {
    let mut keyboard = HKL(std::ptr::null_mut());
    // SAFETY: SPI_GETDEFAULTINPUTLANG writes one HKL to the pointer, which points to `keyboard`.
    let found = unsafe {
        SystemParametersInfoW(
            SPI_GETDEFAULTINPUTLANG,
            0,
            Some(&mut keyboard as *mut HKL as *mut core::ffi::c_void),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
    };
    found.ok().map(|_| keyboard)
}

/// What one key prints on this layout, as a label, or None.
fn label_on(keyboard: HKL, scancode: u32) -> Option<String> {
    let no_keys_held = [0u8; 256];
    let mut typed = [0u16; 4];
    // SAFETY: the buffers are the sizes the calls are given; KEEP_KEYBOARD_STATE stops ToUnicodeEx from changing the
    // keyboard state (dead keys) of anyone.
    let count = unsafe {
        let virtual_key = MapVirtualKeyExW(scancode, MAPVK_VSC_TO_VK_EX, Some(keyboard));
        ToUnicodeEx(
            virtual_key,
            scancode,
            &no_keys_held,
            &mut typed,
            KEEP_KEYBOARD_STATE,
            Some(keyboard),
        )
    };
    (count == 1).then(|| crate::key_labels::label_for(typed[0])).flatten()
}

/// The labels of the typing keys for the layout of the window in front: {"KeyQ": "A", "Semicolon": "M", ...} on a
/// French AZERTY keyboard. Empty for US English and if Windows can't tell.
pub fn keyboard_labels() -> HashMap<&'static str, String> {
    let mut labels = HashMap::new();
    let Some(keyboard) = layout_in_use().filter(|&keyboard| !is_us_english(keyboard)) else {
        return labels;
    };
    for &(code, scancode) in TYPING_KEYS {
        if let Some(label) = label_on(keyboard, scancode) {
            labels.insert(code, label);
        }
    }
    labels
}

/// Called by Windows (on the watcher thread) each time another window comes to the front.
unsafe extern "system" fn foreground_changed(_: HWINEVENTHOOK, _: u32, _: HWND, _: i32, _: i32, _: u32, _: u32) {
    if let Some(on_change) = ON_FOREGROUND_CHANGE.get() {
        on_change();
    }
}

/// Call `on_change` each time another window comes to the front (its layout may differ). The hook lives on its own
/// thread, which waits for Windows' messages and so uses no CPU in between; it ends with the app.
pub fn watch(on_change: Box<dyn Fn() + Send + Sync>) {
    if ON_FOREGROUND_CHANGE.set(on_change).is_err() {
        return;
    }
    let _ = std::thread::Builder::new()
        .name("key-layout-watch".into())
        .spawn(wait_for_foreground_changes);
}

fn wait_for_foreground_changes() {
    // SAFETY: an out-of-context hook calls `foreground_changed` on this thread while it reads messages below; the hook
    // stays installed until the app ends, so it is never removed while in use.
    unsafe {
        let hook = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            None,
            Some(foreground_changed),
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
        );
        if hook.0.is_null() {
            return;
        }
        let mut message = MSG::default();
        while GetMessageW(&mut message, None, 0, 0).as_bool() {
            DispatchMessageW(&message);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_us_english_layout_counts_as_us_english() {
        assert!(is_us_english(HKL(0x0409_0409 as *mut _)));
        assert!(!is_us_english(HKL(0x040C_040C as *mut _)), "French");
        assert!(!is_us_english(HKL(0x0407_0407 as *mut _)), "German");
    }
}
