//! Method 1 (default): Windows low-level keyboard hook (WH_KEYBOARD_LL).
//!
//! The hook thread installs the hook and pumps messages. The callback does the bare minimum (hand the event to the
//! tracker, which pushes tiny events on a channel) and ALWAYS calls the next hook, so input is never delayed or
//! swallowed. While an overlay is connected the same thread also runs the hook watch (see mod.rs): a 30 s timer that
//! installs the hook again if Windows has silently removed it.

use super::tracker::{KeyTracker, RECONCILE_MS};
use super::{hook_looks_dropped, KeyEvent, WATCH_INTERVAL_MS};
use std::cell::{Cell, RefCell};
use std::sync::mpsc::{sync_channel, Sender};
use std::thread::JoinHandle;
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::SystemInformation::GetTickCount;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
use windows::Win32::UI::WindowsAndMessaging::*;

/// Messages to the hook thread: start or stop the hook watch.
const WATCH_ON: u32 = WM_APP + 1;
const WATCH_OFF: u32 = WM_APP + 2;

thread_local! {
    // Only touched from the hook thread.
    static STATE: RefCell<Option<(KeyTracker, Sender<KeyEvent>)>> = const { RefCell::new(None) };
    // When the hook last heard a key: the tick count Windows stamps on each key (free to read).
    static LAST_KEY: Cell<u32> = const { Cell::new(0) };
    // The reconcile timer's id while it runs (0 = not running): it runs only while a key is shown as down.
    static RECONCILE_TIMER: Cell<usize> = const { Cell::new(0) };
}

pub struct Handle {
    thread_id: u32,
    join: JoinHandle<()>,
}
impl Handle {
    /// Start or stop the hook watch (only while an overlay is connected).
    pub fn set_watch(&self, on: bool) {
        unsafe {
            let _ = PostThreadMessageW(
                self.thread_id,
                if on { WATCH_ON } else { WATCH_OFF },
                WPARAM(0),
                LPARAM(0),
            );
        }
    }
    pub fn stop(self) {
        unsafe {
            let _ = PostThreadMessageW(self.thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
        }
        let _ = self.join.join();
    }
}

pub fn start(tx: Sender<KeyEvent>) -> Result<Handle, String> {
    let (ready_tx, ready_rx) = sync_channel::<Result<u32, String>>(1);
    let join = std::thread::Builder::new()
        .name("key-hook".into())
        .spawn(move || unsafe {
            STATE.with(|s| *s.borrow_mut() = Some((KeyTracker::new(true), tx)));
            let mut hook = match install() {
                Ok(installed_hook) => installed_hook,
                Err(e) => {
                    let _ = ready_tx.send(Err(e.to_string()));
                    return;
                }
            };
            LAST_KEY.with(|last| last.set(GetTickCount()));
            let mut msg = MSG::default();
            // make sure this thread has a message queue
            let _ = PeekMessageW(&mut msg, None, WM_USER, WM_USER, PM_NOREMOVE);
            let _ = ready_tx.send(Ok(GetCurrentThreadId()));
            let mut timer = 0;
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                match msg.message {
                    WATCH_ON if timer == 0 => timer = SetTimer(None, 0, WATCH_INTERVAL_MS, None),
                    WATCH_OFF if timer != 0 => {
                        let _ = KillTimer(None, timer);
                        timer = 0;
                    }
                    WM_TIMER if msg.wParam.0 == timer => hook = check_hook(hook),
                    WM_TIMER if msg.wParam.0 == RECONCILE_TIMER.with(Cell::get) => reconcile_held_keys(),
                    _ => {
                        let _ = TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    }
                }
            }
            if timer != 0 {
                let _ = KillTimer(None, timer);
            }
            stop_reconcile_timer();
            let _ = UnhookWindowsHookEx(hook);
        })
        .map_err(|e| e.to_string())?;
    match ready_rx.recv() {
        Ok(Ok(thread_id)) => Ok(Handle { thread_id, join }),
        Ok(Err(e)) => {
            let _ = join.join();
            Err(e)
        }
        Err(_) => Err("the keyboard hook thread stopped unexpectedly".into()),
    }
}

unsafe fn install() -> windows::core::Result<HHOOK> {
    let hmod = GetModuleHandleW(None).ok();
    SetWindowsHookExW(WH_KEYBOARD_LL, Some(proc), hmod.map(|m| m.into()), 0)
}

/// The hook watch's check (on the hook thread, every 30 s while an overlay is connected): if the PC is in use but the
/// hook has heard nothing for over a minute, Windows has probably removed it, so install it again.
unsafe fn check_hook(hook: HHOOK) -> HHOOK {
    let mut info = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    if !GetLastInputInfo(&mut info).as_bool() {
        return hook;
    }
    if !hook_looks_dropped(GetTickCount(), info.dwTime, LAST_KEY.with(Cell::get)) {
        return hook;
    }
    let _ = UnhookWindowsHookEx(hook);
    match install() {
        Ok(new_hook) => {
            LAST_KEY.with(|last| last.set(GetTickCount()));
            crate::debug::log("keyboard hook installed again (Windows had probably removed it)");
            // releases were missed while the hook was gone: let go of what Windows says is up
            reconcile_held_keys();
            new_hook
        }
        Err(e) => {
            crate::debug::log(format!("keyboard hook could not be installed again: {e}"));
            hook
        }
    }
}

/// The reconcile timer's tick (on the hook thread, every RECONCILE_MS while a key is shown as down): release what Windows
/// says is up, so a missed release (the PC locked, the hook removed) doesn't leave a key lit until the next key press.
/// The timer stops itself once nothing is held.
unsafe fn reconcile_held_keys() {
    let any_held = STATE.with(|s| {
        s.borrow_mut().as_mut().map(|(tracker, tx)| {
            tracker.reconcile(tx);
            tracker.any_held()
        })
    });
    if any_held != Some(true) {
        stop_reconcile_timer();
    }
}

unsafe fn start_reconcile_timer() {
    if RECONCILE_TIMER.with(Cell::get) == 0 {
        RECONCILE_TIMER.with(|id| id.set(SetTimer(None, 0, RECONCILE_MS, None)));
    }
}

unsafe fn stop_reconcile_timer() {
    let id = RECONCILE_TIMER.with(|id| id.replace(0));
    if id != 0 {
        let _ = KillTimer(None, id);
    }
}

unsafe extern "system" fn proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let key_data = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        LAST_KEY.with(|last| last.set(key_data.time));
        let down = matches!(wparam.0 as u32, WM_KEYDOWN | WM_SYSKEYDOWN);
        let up = matches!(wparam.0 as u32, WM_KEYUP | WM_SYSKEYUP);
        if down || up {
            let ext = key_data.flags.0 & 0x01 != 0;
            // the hook can't tell keyboards apart: device 0 for everything
            let any_held = STATE.with(|s| {
                s.borrow_mut().as_mut().map(|(tracker, tx)| {
                    tracker.handle(0, key_data.vkCode, key_data.scanCode, ext, down, tx);
                    tracker.any_held()
                })
            });
            if any_held == Some(true) {
                start_reconcile_timer();
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}
