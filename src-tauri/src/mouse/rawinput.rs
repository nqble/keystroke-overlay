//! Windows: mouse buttons and wheel through Raw Input (docs/proposals/mouse-input.md, step 1: a spike behind the cargo
//! feature `mouse`).
//!
//! The same way as `keyboard/rawinput.rs`: one thread with an invisible message-only window that asks Windows for a
//! copy of mouse input (`RIDEV_INPUTSINK`, so clicks count while a game has focus). Nothing sits in the input path, and
//! the thread sleeps in `GetMessageW` while the mouse is not used. For each record only the button flags and the wheel
//! turn are read: a plain move is dropped after one flag test, and the movement fields are never named here.

use super::names;
use super::{EVENTS, RECORDS};
use crate::keyboard::KeyEvent;
use std::cell::RefCell;
use std::collections::HashSet;
use std::mem::size_of;
use std::sync::atomic::Ordering;
use std::sync::mpsc::{sync_channel, Sender};
use std::thread::JoinHandle;
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Input::{
    GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE, RAWINPUTHEADER, RIDEV_INPUTSINK,
    RIDEV_REMOVE, RID_INPUT, RIM_TYPEMOUSE,
};
use windows::Win32::UI::WindowsAndMessaging::*;

thread_local! {
    // Only touched from the raw-input thread: where the names go, and which buttons are down right now.
    static STATE: RefCell<Option<(Sender<KeyEvent>, HashSet<&'static str>)>> = const { RefCell::new(None) };
}

pub struct Handle {
    thread_id: u32,
    join: JoinHandle<()>,
}
impl Handle {
    pub fn stop(self) {
        unsafe {
            let _ = PostThreadMessageW(self.thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
        }
        let _ = self.join.join();
    }
}

/// Starts the capture: a thread with a message-only window registered for mouse input (usage page 1, usage 2). The
/// thread says through `ready_rx` whether it came up, so a failure reaches the caller as an error.
pub fn start(tx: Sender<KeyEvent>) -> Result<Handle, String> {
    let (ready_tx, ready_rx) = sync_channel::<Result<u32, String>>(1);
    let join = std::thread::Builder::new()
        .name("mouse-rawinput".into())
        .spawn(move || unsafe {
            STATE.with(|state| *state.borrow_mut() = Some((tx, HashSet::new())));
            let hinst = GetModuleHandleW(None).ok().map(|module| module.into());
            let class = w!("KeystrokeOverlayMouseInput");
            let class_info = WNDCLASSW {
                lpfnWndProc: Some(wnd_proc),
                hInstance: hinst.unwrap_or_default(),
                lpszClassName: class,
                ..Default::default()
            };
            RegisterClassW(&class_info); // fine if it already exists from an earlier start
            let hwnd = match CreateWindowExW(
                WINDOW_EX_STYLE(0),
                class,
                w!("Keystroke Overlay mouse input"),
                WINDOW_STYLE(0),
                0,
                0,
                0,
                0,
                Some(HWND_MESSAGE),
                None,
                hinst,
                None,
            ) {
                Ok(window) => window,
                Err(error) => {
                    let _ = ready_tx.send(Err(format!("could not create the mouse input window ({error})")));
                    return;
                }
            };
            let device = RAWINPUTDEVICE {
                usUsagePage: 1,
                usUsage: 2,
                dwFlags: RIDEV_INPUTSINK,
                hwndTarget: hwnd,
            };
            if let Err(error) = RegisterRawInputDevices(&[device], size_of::<RAWINPUTDEVICE>() as u32) {
                let _ = DestroyWindow(hwnd);
                let _ = ready_tx.send(Err(format!("Windows refused the mouse registration ({error})")));
                return;
            }
            let mut msg = MSG::default();
            let _ = PeekMessageW(&mut msg, None, WM_USER, WM_USER, PM_NOREMOVE); // make sure there is a message queue
            let _ = ready_tx.send(Ok(GetCurrentThreadId()));
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            // Stopped: let go of any button still shown as down, then remove the registration and the window, so a later
            // start (or the keyboard's own Raw Input) begins from a clean slate.
            STATE.with(|state| {
                if let Some((tx, held)) = state.borrow_mut().take() {
                    for code in held {
                        let _ = tx.send(KeyEvent { down: false, code });
                    }
                }
            });
            let remove = RAWINPUTDEVICE {
                usUsagePage: 1,
                usUsage: 2,
                dwFlags: RIDEV_REMOVE,
                hwndTarget: HWND::default(),
            };
            let _ = RegisterRawInputDevices(&[remove], size_of::<RAWINPUTDEVICE>() as u32);
            let _ = DestroyWindow(hwnd);
        })
        .map_err(|error| error.to_string())?;
    match ready_rx.recv() {
        Ok(Ok(thread_id)) => Ok(Handle { thread_id, join }),
        Ok(Err(error)) => {
            let _ = join.join();
            Err(error)
        }
        Err(_) => Err("the mouse thread stopped unexpectedly".into()),
    }
}

unsafe extern "system" fn wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if msg == WM_INPUT {
        // A mouse RAWINPUT record is about 48 bytes; a small aligned stack buffer needs no allocation per record.
        let mut buf = [0u64; 16];
        let mut size = (buf.len() * 8) as u32;
        let got = GetRawInputData(
            HRAWINPUT(lparam.0 as _),
            RID_INPUT,
            Some(buf.as_mut_ptr() as *mut _),
            &mut size,
            size_of::<RAWINPUTHEADER>() as u32,
        );
        if got != u32::MAX {
            let raw_input = &*(buf.as_ptr() as *const RAWINPUT);
            if raw_input.header.dwType == RIM_TYPEMOUSE.0 {
                RECORDS.fetch_add(1, Ordering::Relaxed);
                // only the button flags and the wheel turn; nothing else of the record is read
                let buttons = raw_input.data.mouse.Anonymous.Anonymous;
                handle_buttons(buttons.usButtonFlags, buttons.usButtonData);
            }
        }
        // Raw input requires the default handler to run for cleanup.
    }
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

/// Passes on the buttons and the wheel turn of one record. A record with neither (a plain move) ends here.
fn handle_buttons(flags: u16, data: u16) {
    if !names::has_buttons_or_wheel(flags) {
        return;
    }
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        let Some((tx, held)) = state.as_mut() else { return };
        for (code, down) in names::button_events(flags) {
            if down {
                held.insert(code);
            } else {
                held.remove(code);
            }
            EVENTS.fetch_add(1, Ordering::Relaxed);
            let _ = tx.send(KeyEvent { down, code });
        }
        if let Some(code) = names::wheel_name(flags, data) {
            // one notch is one short press: the overlay shows it for a moment, and nothing stays held
            EVENTS.fetch_add(1, Ordering::Relaxed);
            let _ = tx.send(KeyEvent { down: true, code });
            let _ = tx.send(KeyEvent { down: false, code });
        }
    });
}
