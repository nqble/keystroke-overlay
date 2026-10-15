//! Method 1 (default): Windows low-level keyboard hook (WH_KEYBOARD_LL).
//!
//! The hook thread installs the hook and pumps messages. The callback does the bare minimum (hand the event to the
//! tracker, which pushes tiny events on a channel) and ALWAYS calls the next hook, so input is never delayed or
//! swallowed.

use super::tracker::KeyTracker;
use super::KeyEvent;
use std::cell::RefCell;
use std::sync::mpsc::{sync_channel, Sender};
use std::thread::JoinHandle;
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::*;

thread_local! {
    // Only touched from the hook thread.
    static STATE: RefCell<Option<(KeyTracker, Sender<KeyEvent>)>> = const { RefCell::new(None) };
}

pub struct Handle {
    thread_id: u32,
    join: JoinHandle<()>,
}
impl Handle {
    pub fn stop(self) {
        unsafe { let _ = PostThreadMessageW(self.thread_id, WM_QUIT, WPARAM(0), LPARAM(0)); }
        let _ = self.join.join();
    }
}

pub fn start(tx: Sender<KeyEvent>) -> Result<Handle, String> {
    let (ready_tx, ready_rx) = sync_channel::<Result<u32, String>>(1);
    let join = std::thread::Builder::new().name("key-hook".into()).spawn(move || unsafe {
        STATE.with(|s| *s.borrow_mut() = Some((KeyTracker::new(true), tx)));
        let hmod = GetModuleHandleW(None).ok();
        let hook = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(proc), hmod.map(|m| m.into()), 0) {
            Ok(h) => h,
            Err(e) => { let _ = ready_tx.send(Err(e.to_string())); return; }
        };
        let mut msg = MSG::default();
        // make sure this thread has a message queue
        let _ = PeekMessageW(&mut msg, None, WM_USER, WM_USER, PM_NOREMOVE);
        let _ = ready_tx.send(Ok(GetCurrentThreadId()));
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        let _ = UnhookWindowsHookEx(hook);
    }).map_err(|e| e.to_string())?;
    match ready_rx.recv() {
        Ok(Ok(thread_id)) => Ok(Handle { thread_id, join }),
        Ok(Err(e)) => { let _ = join.join(); Err(e) }
        Err(_) => Err("the keyboard hook thread stopped unexpectedly".into()),
    }
}

unsafe extern "system" fn proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let k = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        let down = matches!(wparam.0 as u32, WM_KEYDOWN | WM_SYSKEYDOWN);
        let up = matches!(wparam.0 as u32, WM_KEYUP | WM_SYSKEYUP);
        if down || up {
            let ext = k.flags.0 & 0x01 != 0;
            STATE.with(|s| {
                if let Some((tracker, tx)) = s.borrow_mut().as_mut() {
                    tracker.handle(k.vkCode, k.scanCode, ext, down, tx);
                }
            });
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}
