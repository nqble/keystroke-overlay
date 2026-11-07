//! macOS: mouse buttons and the wheel with a second listen-only event tap (docs/proposals/mouse-input.md).
//!
//! It needs the same Input Monitoring permission as the keyboard, and no other, so the settings window's existing
//! keyboard notice covers it.
//!
//! The same kind of tap as the keyboard's (`keyboard/macos.rs`, whose way of making one, its own thread and run loop,
//! and switching back on after a timeout this follows), but its event mask names only button presses, button releases
//! and the scroll wheel. Mouse-moved and dragged events are left out of the mask, so macOS never wakes the app while the
//! pointer moves, and nothing here reads the pointer's location.
//!
//! Buttons: left and right have their own event types; every other button arrives as "other" with a button number
//! (`names::macos_button`). Wheel: trackpads and the Magic Mouse scroll continuously (their events say so), which is not
//! a wheel turning, so they are ignored. A real wheel reports lines, added up into notches by `wheel::Notches`.

use super::names;
use super::wheel::{Axis, Notches, Throttle, MACOS_NOTCH};
use crate::keyboard::KeyEvent;
use core_foundation::base::TCFType;
use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use core_foundation::string::{CFString, CFStringRef};
use core_graphics::event::{
    CGEvent, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType, CallbackResult,
    EventField,
};
use std::collections::HashSet;
use std::ffi::c_void;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{sync_channel, Sender, SyncSender};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Instant;

const TEXT_NO_PERMISSION: &str = "macOS isn't letting the app read the mouse yet. Turn on Keystroke Overlay in \
     System Settings > Privacy & Security > Input Monitoring, then restart the app";
const TEXT_THREAD_STOPPED: &str = "the mouse capture thread stopped unexpectedly";

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventTapEnable(tap: *mut c_void, enable: bool);
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFPreferencesGetAppBooleanValue(key: CFStringRef, application_id: CFStringRef, key_exists: *mut u8) -> u8;
    static kCFPreferencesAnyApplication: CFStringRef;
}

/// The system setting behind "Natural scrolling" (System Settings > Mouse). Set, macOS reports a wheel turned away from
/// you as a downward scroll, so the sign has to be flipped back for `WheelUp` to mean the same turn either way.
const NATURAL_SCROLLING_KEY: &str = "com.apple.swipescrolldirection";

/// Is natural scrolling on? Read for each wheel event so a change in System Settings counts at once; it is a cheap
/// lookup in macOS's cached preferences and only runs while a real wheel turns.
fn natural_scrolling_on() -> bool {
    let key = CFString::new(NATURAL_SCROLLING_KEY);
    let mut key_exists = 0u8;
    // SAFETY: plain query with a live string and a flag that lives through the call; kCFPreferencesAnyApplication is a
    // constant macOS provides. The value is false when the setting was never written (natural scrolling is on by
    // default, but then `key_exists` is 0 and we treat it as on below).
    let on = unsafe {
        CFPreferencesGetAppBooleanValue(key.as_concrete_TypeRef(), kCFPreferencesAnyApplication, &mut key_exists) != 0
    };
    on || key_exists == 0
}

/// The wheel's delta as "positive = away from you", whatever the natural scrolling setting.
fn physical_delta(reported: i64, natural_scrolling: bool) -> i64 {
    if natural_scrolling {
        -reported
    } else {
        reported
    }
}

/// Wraps the capture thread's run loop so `stop` can wake it from another thread (`CFRunLoopStop` is thread safe).
struct RunLoopHandle(CFRunLoop);
// SAFETY: CFRunLoopStop is documented as thread safe, and `stop` is the only thing done with this value.
unsafe impl Send for RunLoopHandle {}

pub struct Handle {
    run_loop: RunLoopHandle,
    join: JoinHandle<()>,
}

impl Handle {
    pub fn stop(self) {
        self.run_loop.0.stop();
        let _ = self.join.join();
    }
}

/// Start the capture thread. Returns an error when Input Monitoring is missing. macOS still creates a mouse tap without
/// it but never delivers an event to it (checked on a Mac), so the permission is asked first rather than the tap.
pub fn start(tx: Sender<KeyEvent>) -> Result<Handle, String> {
    if !crate::keyboard::access().allowed {
        return Err(TEXT_NO_PERMISSION.to_string());
    }
    let (ready_tx, ready_rx) = sync_channel::<Result<RunLoopHandle, String>>(1);
    let join = std::thread::Builder::new()
        .name("mouse-macos".into())
        .spawn(move || capture(tx, ready_tx))
        .map_err(|e| e.to_string())?;
    let run_loop = ready_rx.recv().map_err(|_| TEXT_THREAD_STOPPED.to_string())??;
    Ok(Handle { run_loop, join })
}

/// The capture thread: create the tap, report whether that worked, then run until `stop` is called.
fn capture(tx: Sender<KeyEvent>, ready_tx: SyncSender<Result<RunLoopHandle, String>>) {
    // The callback needs the tap to switch it back on, but the tap is created after the callback: pass the address in.
    let tap_address = Arc::new(AtomicUsize::new(0));
    let state = Arc::new(Mutex::new(MouseState::default()));
    let callback = make_callback(tx.clone(), tap_address.clone(), state.clone());
    let created = CGEventTap::new(
        CGEventTapLocation::HID,
        CGEventTapPlacement::HeadInsertEventTap,
        CGEventTapOptions::ListenOnly,
        // Buttons and the wheel only: no MouseMoved and no ...Dragged, so movement never wakes the app (privacy check).
        vec![
            CGEventType::LeftMouseDown,
            CGEventType::LeftMouseUp,
            CGEventType::RightMouseDown,
            CGEventType::RightMouseUp,
            CGEventType::OtherMouseDown,
            CGEventType::OtherMouseUp,
            CGEventType::ScrollWheel,
        ],
        callback,
    );
    let Ok(tap) = created else {
        let _ = ready_tx.send(Err(TEXT_NO_PERMISSION.to_string()));
        return;
    };
    let Ok(source) = tap.mach_port().create_runloop_source(0) else {
        let _ = ready_tx.send(Err(TEXT_THREAD_STOPPED.to_string()));
        return;
    };
    tap_address.store(tap.mach_port().as_concrete_TypeRef() as usize, Ordering::Relaxed);
    let run_loop = CFRunLoop::get_current();
    // SAFETY: kCFRunLoopCommonModes is a constant string macOS provides.
    run_loop.add_source(&source, unsafe { kCFRunLoopCommonModes });
    tap.enable();
    let _ = ready_tx.send(Ok(RunLoopHandle(run_loop)));
    CFRunLoop::run_current();
    // Stopped: dropping `tap` switches it off; let go of any button still shown as down.
    release_all(&tx, &state);
}

/// What the callback remembers between events.
struct MouseState {
    held: HashSet<&'static str>,
    notches: Notches,
    throttle: Throttle,
    started: Instant,
}

impl Default for MouseState {
    fn default() -> Self {
        Self {
            held: HashSet::new(),
            notches: Notches::default(),
            throttle: Throttle::default(),
            started: Instant::now(),
        }
    }
}

fn release_all(tx: &Sender<KeyEvent>, state: &Mutex<MouseState>) {
    let mut state = state.lock().unwrap();
    for code in state.held.drain() {
        let _ = tx.send(KeyEvent { down: false, code });
    }
}

/// The tap's callback: tiny, and never blocks (macOS switches off a tap whose callback is slow).
fn make_callback(
    tx: Sender<KeyEvent>,
    tap_address: Arc<AtomicUsize>,
    state: Arc<Mutex<MouseState>>,
) -> impl Fn(core_graphics::event::CGEventTapProxy, CGEventType, &CGEvent) -> CallbackResult + Send + 'static {
    move |_proxy, event_type, event| {
        match event_type {
            CGEventType::ScrollWheel => handle_wheel(&tx, &state, event),
            CGEventType::TapDisabledByTimeout | CGEventType::TapDisabledByUserInput => {
                // A release may have been missed while the tap was off: let go of everything, then switch it back on.
                release_all(&tx, &state);
                switch_tap_back_on(&tap_address);
            }
            _ => handle_button(&tx, &state, event_type, event),
        }
        CallbackResult::Keep
    }
}

fn handle_button(tx: &Sender<KeyEvent>, state: &Mutex<MouseState>, event_type: CGEventType, event: &CGEvent) {
    let Some((code, down)) = button_of(event_type, || {
        event.get_integer_value_field(EventField::MOUSE_EVENT_BUTTON_NUMBER)
    }) else {
        return;
    };
    let mut state = state.lock().unwrap();
    if down {
        state.held.insert(code);
    } else {
        state.held.remove(code);
    }
    let _ = tx.send(KeyEvent { down, code });
}

/// The name and direction of a button event. Only "other" buttons carry a number, so it is read only for them.
fn button_of(event_type: CGEventType, other_button_number: impl Fn() -> i64) -> Option<(&'static str, bool)> {
    match event_type {
        CGEventType::LeftMouseDown => Some(("MouseLeft", true)),
        CGEventType::LeftMouseUp => Some(("MouseLeft", false)),
        CGEventType::RightMouseDown => Some(("MouseRight", true)),
        CGEventType::RightMouseUp => Some(("MouseRight", false)),
        CGEventType::OtherMouseDown => names::macos_button(other_button_number()).map(|code| (code, true)),
        CGEventType::OtherMouseUp => names::macos_button(other_button_number()).map(|code| (code, false)),
        _ => None,
    }
}

fn handle_wheel(tx: &Sender<KeyEvent>, state: &Mutex<MouseState>, event: &CGEvent) {
    if event.get_integer_value_field(EventField::SCROLL_WHEEL_EVENT_IS_CONTINUOUS) != 0 {
        return; // a trackpad or Magic Mouse, not a wheel
    }
    let natural = natural_scrolling_on();
    let vertical = physical_delta(
        event.get_integer_value_field(EventField::SCROLL_WHEEL_EVENT_DELTA_AXIS_1),
        natural,
    );
    let horizontal = physical_delta(
        event.get_integer_value_field(EventField::SCROLL_WHEEL_EVENT_DELTA_AXIS_2),
        natural,
    );
    let mut state = state.lock().unwrap();
    for (axis, delta) in [(Axis::Vertical, vertical), (Axis::Horizontal, horizontal)] {
        let Some((code, _notches)) = state.notches.add(axis, delta as i32, MACOS_NOTCH) else {
            continue;
        };
        let now_ms = state.started.elapsed().as_millis() as u64;
        if state.throttle.allow(code, now_ms) {
            // a notch is one short press, never held
            let _ = tx.send(KeyEvent { down: true, code });
            let _ = tx.send(KeyEvent { down: false, code });
        }
    }
}

fn switch_tap_back_on(tap_address: &AtomicUsize) {
    let address = tap_address.load(Ordering::Relaxed);
    if address == 0 {
        return;
    }
    // SAFETY: the address is the tap's mach port, which stays alive as long as the capture thread runs this callback.
    unsafe { CGEventTapEnable(address as *mut c_void, true) };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn left_and_right_buttons_need_no_number() {
        let never = || panic!("only other buttons carry a number");
        assert_eq!(button_of(CGEventType::LeftMouseDown, never), Some(("MouseLeft", true)));
        assert_eq!(button_of(CGEventType::LeftMouseUp, never), Some(("MouseLeft", false)));
        assert_eq!(
            button_of(CGEventType::RightMouseDown, never),
            Some(("MouseRight", true))
        );
        assert_eq!(button_of(CGEventType::RightMouseUp, never), Some(("MouseRight", false)));
    }

    #[test]
    fn other_buttons_are_named_by_their_number() {
        assert_eq!(
            button_of(CGEventType::OtherMouseDown, || 2),
            Some(("MouseMiddle", true))
        );
        assert_eq!(button_of(CGEventType::OtherMouseUp, || 3), Some(("MouseBack", false)));
        assert_eq!(
            button_of(CGEventType::OtherMouseDown, || 4),
            Some(("MouseForward", true))
        );
        assert_eq!(button_of(CGEventType::OtherMouseDown, || 9), None);
    }

    #[test]
    fn movement_and_keys_are_not_buttons() {
        assert_eq!(button_of(CGEventType::MouseMoved, || 0), None);
        assert_eq!(button_of(CGEventType::KeyDown, || 0), None);
    }

    #[test]
    fn natural_scrolling_is_undone_so_the_same_turn_gives_the_same_name() {
        assert_eq!(physical_delta(3, false), 3);
        assert_eq!(physical_delta(-3, true), 3);
        assert_eq!(physical_delta(-3, false), -3);
        assert_eq!(physical_delta(3, true), -3);
    }

    #[test]
    fn starts_and_stops_when_macos_allows_it() {
        let (tx, _rx) = std::sync::mpsc::channel();
        // Without Input Monitoring `start` says so: then there is nothing to stop, and that is fine too.
        if let Ok(handle) = start(tx) {
            let started = Instant::now();
            handle.stop();
            assert!(started.elapsed().as_secs() < 2, "stop must wake the capture thread");
        }
    }
}
