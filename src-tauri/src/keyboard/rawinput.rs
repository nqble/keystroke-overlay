//! Method 2 (compatibility): Windows Raw Input.
//!
//! Instead of hooking into the system's key delivery, this registers to RECEIVE a copy of keyboard input
//! (RIDEV_INPUTSINK = even while another program has focus). Nothing sits in the input path, nothing can be
//! delayed or removed by Windows for being slow, and it cannot block or change keys. It runs on its own thread
//! with a hidden message-only window, and is event-driven: 0% CPU while no keys are pressed.

use super::tracker::KeyTracker;
use super::KeyEvent;
use std::cell::RefCell;
use std::mem::size_of;
use std::sync::mpsc::{sync_channel, Sender};
use std::thread::JoinHandle;
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Input::{
    GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE, RAWINPUTHEADER, RIDEV_INPUTSINK,
    RIDEV_REMOVE, RID_INPUT, RIM_TYPEKEYBOARD,
};
use windows::Win32::UI::WindowsAndMessaging::*;

const RI_KEY_BREAK: u16 = 1;
const RI_KEY_E0: u16 = 2;

thread_local! {
    // Only touched from the raw-input thread.
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

/// (virtual key, scancode, extended, is_down) from the pieces of a RAWKEYBOARD record, or None for records to skip.
pub fn decode(vkey: u16, make: u16, flags: u16) -> Option<(u32, u32, bool, bool)> {
    if make == 0 || make == 0xFF { return None;   /* fake or overrun markers, not real keys */ }
    Some((vkey as u32, make as u32, flags & RI_KEY_E0 != 0, flags & RI_KEY_BREAK == 0))
}

pub fn start(tx: Sender<KeyEvent>) -> Result<Handle, String> {
    let (ready_tx, ready_rx) = sync_channel::<Result<u32, String>>(1);
    let join = std::thread::Builder::new().name("key-rawinput".into()).spawn(move || unsafe {
        STATE.with(|s| *s.borrow_mut() = Some((KeyTracker::new(true), tx)));
        let hinst = GetModuleHandleW(None).ok().map(|m| m.into());
        let class = w!("KeystrokeOverlayRawInput");
        let wc = WNDCLASSW { lpfnWndProc: Some(wnd_proc), hInstance: hinst.unwrap_or_default(), lpszClassName: class, ..Default::default() };
        RegisterClassW(&wc);   // fine if it already exists from an earlier start
        let hwnd = match CreateWindowExW(WINDOW_EX_STYLE(0), class, w!("Keystroke Overlay input"), WINDOW_STYLE(0), 0, 0, 0, 0, Some(HWND_MESSAGE), None, hinst, None) {
            Ok(h) => h,
            Err(e) => { let _ = ready_tx.send(Err(format!("could not create the input window ({e})"))); return; }
        };
        // Keyboard = usage page 1 (generic desktop), usage 6.
        let dev = RAWINPUTDEVICE { usUsagePage: 1, usUsage: 6, dwFlags: RIDEV_INPUTSINK, hwndTarget: hwnd };
        if let Err(e) = RegisterRawInputDevices(&[dev], size_of::<RAWINPUTDEVICE>() as u32) {
            let _ = DestroyWindow(hwnd);
            let _ = ready_tx.send(Err(format!("Windows refused the Raw Input registration ({e})")));
            return;
        }
        let mut msg = MSG::default();
        // make sure this thread has a message queue
        let _ = PeekMessageW(&mut msg, None, WM_USER, WM_USER, PM_NOREMOVE);
        let _ = ready_tx.send(Ok(GetCurrentThreadId()));
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        // Clean up so a later switch back (or to the hook) starts from a clean slate.
        let remove = RAWINPUTDEVICE { usUsagePage: 1, usUsage: 6, dwFlags: RIDEV_REMOVE, hwndTarget: HWND::default() };
        let _ = RegisterRawInputDevices(&[remove], size_of::<RAWINPUTDEVICE>() as u32);
        let _ = DestroyWindow(hwnd);
    }).map_err(|e| e.to_string())?;
    match ready_rx.recv() {
        Ok(Ok(thread_id)) => Ok(Handle { thread_id, join }),
        Ok(Err(e)) => { let _ = join.join(); Err(e) }
        Err(_) => Err("the Raw Input thread stopped unexpectedly".into()),
    }
}

unsafe extern "system" fn wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if msg == WM_INPUT {
        // A keyboard RAWINPUT record is ~40 bytes; a small aligned stack buffer avoids any allocation per key.
        let mut buf = [0u64; 16];
        let mut size = (buf.len() * 8) as u32;
        let got = GetRawInputData(HRAWINPUT(lparam.0 as _), RID_INPUT, Some(buf.as_mut_ptr() as *mut _), &mut size, size_of::<RAWINPUTHEADER>() as u32);
        if got != u32::MAX {
            let ri = &*(buf.as_ptr() as *const RAWINPUT);
            if ri.header.dwType == RIM_TYPEKEYBOARD.0 {
                let kb = ri.data.keyboard;
                if let Some((vk, sc, ext, down)) = decode(kb.VKey, kb.MakeCode, kb.Flags) {
                    STATE.with(|s| {
                        if let Some((tracker, tx)) = s.borrow_mut().as_mut() { tracker.handle(vk, sc, ext, down, tx); }
                    });
                }
            }
        }
        // Raw input requires the default handler to run for cleanup.
    }
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decodes_down_and_up() {
        assert_eq!(decode(0x57, 0x11, 0), Some((0x57, 0x11, false, true)));
        assert_eq!(decode(0x57, 0x11, RI_KEY_BREAK), Some((0x57, 0x11, false, false)));
    }
    #[test]
    fn reads_the_extended_flag() {
        assert_eq!(decode(0x27, 0x4D, RI_KEY_E0), Some((0x27, 0x4D, true, true)));
        assert_eq!(decode(0x27, 0x4D, RI_KEY_E0 | RI_KEY_BREAK), Some((0x27, 0x4D, true, false)));
    }
    #[test]
    fn skips_fake_and_overrun_records() {
        assert_eq!(decode(0xFF, 0, 0), None);
        assert_eq!(decode(0xFF, 0xFF, 0), None);
    }
}
