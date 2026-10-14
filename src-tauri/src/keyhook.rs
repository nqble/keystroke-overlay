//! Global low-level keyboard hook (WH_KEYBOARD_LL).
//!
//! Threads:
//!   * hook thread  – installs the hook and pumps messages. The callback does
//!     the bare minimum (filter repeats, push a tiny event on a channel) and
//!     ALWAYS calls the next hook, so input is never delayed or swallowed.
//!   * dispatcher   – blocks on the channel (0% CPU when idle), tracks which
//!     keys are held, and broadcasts events to WebSocket clients.
//!
//! Privacy: events live only in memory and are forwarded to localhost
//! WebSocket clients. Nothing is written to disk.

use std::cell::RefCell;
use std::collections::HashSet;
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::broadcast;
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
use windows::Win32::UI::WindowsAndMessaging::*;

#[derive(Clone, Copy)]
pub struct KeyEvent {
    pub down: bool,
    pub code: &'static str,
}

/// Shared with the server: live broadcast + the set of currently held keys.
pub struct Bus {
    pub tx: broadcast::Sender<KeyEvent>,
    pub held: Mutex<HashSet<&'static str>>,
}

static HOOK_TX: OnceLock<Sender<KeyEvent>> = OnceLock::new();

thread_local! {
    // Per-key "is down" table (virtual-key + name), only touched from the hook thread.
    static DOWN: RefCell<[Option<(u32, &'static str)>; 512]> = const { RefCell::new([None; 512]) };
}

pub fn start() -> Arc<Bus> {
    let (btx, _) = broadcast::channel(256);
    let bus = Arc::new(Bus { tx: btx, held: Mutex::new(HashSet::new()) });
    let (tx, rx) = channel::<KeyEvent>();
    let _ = HOOK_TX.set(tx);

    let b = bus.clone();
    std::thread::Builder::new().name("key-dispatch".into()).spawn(move || {
        while let Ok(ev) = rx.recv() {
            {
                let mut h = b.held.lock().unwrap();
                if ev.down { h.insert(ev.code); } else { h.remove(ev.code); }
            }
            let _ = b.tx.send(ev); // Err = no listeners; fine.
        }
    }).unwrap();

    std::thread::Builder::new().name("key-hook".into()).spawn(|| unsafe {
        let hmod = GetModuleHandleW(None).ok();
        let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(proc), hmod.map(|m| m.into()), 0);
        if hook.is_err() { return; }
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }).unwrap();
    bus
}

unsafe extern "system" fn proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let k = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        let down = matches!(wparam.0 as u32, WM_KEYDOWN | WM_SYSKEYDOWN);
        let up = matches!(wparam.0 as u32, WM_KEYUP | WM_SYSKEYUP);
        let ext = k.flags.0 & 0x01 != 0;
        // Fake shift scancodes Windows injects around extended keys: ignore.
        let fake = ext && (k.scanCode == 0x2A || k.scanCode == 0x36);
        if (down || up) && !fake {
            if let Some(name) = code_name(k.vkCode, k.scanCode, ext) {
                let idx = (k.scanCode as usize & 0xFF) | if ext { 0x100 } else { 0 };
                if let Some(tx) = HOOK_TX.get() {
                    DOWN.with(|d| {
                        let mut d = d.borrow_mut();
                        // Self-heal: a key released while the PC was locked (Win+L, Ctrl+Alt+Del)
                        // never sends a key-up to us. If Windows says a key we think is held is
                        // up, release it now so the overlay can't get stuck.
                        for (i, slot) in d.iter_mut().enumerate() {
                            if let Some((vk, n)) = *slot {
                                if i != idx && (GetAsyncKeyState(vk as i32) as u16) & 0x8000 == 0 {
                                    *slot = None;
                                    let _ = tx.send(KeyEvent { down: false, code: n });
                                }
                            }
                        }
                        if down && d[idx].is_some() { return; }          // OS key-repeat: ignore
                        if up && d[idx].is_none() {
                            // Windows only reports the release of PrintScreen: show it as a tap.
                            if name == "PrintScreen" {
                                let _ = tx.send(KeyEvent { down: true, code: name });
                                let _ = tx.send(KeyEvent { down: false, code: name });
                            }
                            return;                                      // other spurious releases
                        }
                        d[idx] = if down { Some((k.vkCode, name)) } else { None };
                        let _ = tx.send(KeyEvent { down, code: name });
                    });
                }
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

/// Map a hook event to a DOM `KeyboardEvent.code`-style name (used by layouts).
fn code_name(vk: u32, sc: u32, ext: bool) -> Option<&'static str> {
    if vk == 0x13 { return Some("Pause"); }
    if vk == 0x90 { return Some("NumLock"); }
    let sc = sc as u8;
    Some(match (sc, ext) {
        (0x01, _) => "Escape",
        (0x02, _) => "Digit1", (0x03, _) => "Digit2", (0x04, _) => "Digit3", (0x05, _) => "Digit4",
        (0x06, _) => "Digit5", (0x07, _) => "Digit6", (0x08, _) => "Digit7", (0x09, _) => "Digit8",
        (0x0A, _) => "Digit9", (0x0B, _) => "Digit0", (0x0C, _) => "Minus", (0x0D, _) => "Equal",
        (0x0E, _) => "Backspace", (0x0F, _) => "Tab",
        (0x10, _) => "KeyQ", (0x11, _) => "KeyW", (0x12, _) => "KeyE", (0x13, _) => "KeyR",
        (0x14, _) => "KeyT", (0x15, _) => "KeyY", (0x16, _) => "KeyU", (0x17, _) => "KeyI",
        (0x18, _) => "KeyO", (0x19, _) => "KeyP", (0x1A, _) => "BracketLeft", (0x1B, _) => "BracketRight",
        (0x1C, false) => "Enter", (0x1C, true) => "NumpadEnter",
        (0x1D, false) => "ControlLeft", (0x1D, true) => "ControlRight",
        (0x1E, _) => "KeyA", (0x1F, _) => "KeyS", (0x20, _) => "KeyD", (0x21, _) => "KeyF",
        (0x22, _) => "KeyG", (0x23, _) => "KeyH", (0x24, _) => "KeyJ", (0x25, _) => "KeyK",
        (0x26, _) => "KeyL", (0x27, _) => "Semicolon", (0x28, _) => "Quote", (0x29, _) => "Backquote",
        (0x2A, _) => "ShiftLeft", (0x2B, _) => "Backslash",
        (0x2C, _) => "KeyZ", (0x2D, _) => "KeyX", (0x2E, _) => "KeyC", (0x2F, _) => "KeyV",
        (0x30, _) => "KeyB", (0x31, _) => "KeyN", (0x32, _) => "KeyM", (0x33, _) => "Comma",
        (0x34, _) => "Period", (0x35, false) => "Slash", (0x35, true) => "NumpadDivide",
        (0x36, _) => "ShiftRight",
        (0x37, false) => "NumpadMultiply", (0x37, true) => "PrintScreen",
        (0x38, false) => "AltLeft", (0x38, true) => "AltRight",
        (0x39, _) => "Space", (0x3A, _) => "CapsLock",
        (0x3B, _) => "F1", (0x3C, _) => "F2", (0x3D, _) => "F3", (0x3E, _) => "F4", (0x3F, _) => "F5",
        (0x40, _) => "F6", (0x41, _) => "F7", (0x42, _) => "F8", (0x43, _) => "F9", (0x44, _) => "F10",
        (0x46, _) => "ScrollLock",
        (0x47, false) => "Numpad7", (0x47, true) => "Home",
        (0x48, false) => "Numpad8", (0x48, true) => "ArrowUp",
        (0x49, false) => "Numpad9", (0x49, true) => "PageUp",
        (0x4A, _) => "NumpadSubtract",
        (0x4B, false) => "Numpad4", (0x4B, true) => "ArrowLeft",
        (0x4C, _) => "Numpad5",
        (0x4D, false) => "Numpad6", (0x4D, true) => "ArrowRight",
        (0x4E, _) => "NumpadAdd",
        (0x4F, false) => "Numpad1", (0x4F, true) => "End",
        (0x50, false) => "Numpad2", (0x50, true) => "ArrowDown",
        (0x51, false) => "Numpad3", (0x51, true) => "PageDown",
        (0x52, false) => "Numpad0", (0x52, true) => "Insert",
        (0x53, false) => "NumpadDecimal", (0x53, true) => "Delete",
        (0x57, _) => "F11", (0x58, _) => "F12",
        (0x5B, _) => "MetaLeft", (0x5C, _) => "MetaRight", (0x5D, _) => "ContextMenu",
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
    fn unknown_keys_are_ignored() {
        assert_eq!(code_name(0xFF, 0x7F, false), None);
    }
}
