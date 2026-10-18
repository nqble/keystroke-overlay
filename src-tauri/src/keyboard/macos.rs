//! macOS: keyboard capture with a listen-only event tap (docs/MAC-PORT.md).
//!
//! A "listen-only" tap gets a copy of every key event and can never block or change one, so it asks macOS for the
//! Input Monitoring permission only, not the broader Accessibility one (least privilege). Without that permission macOS
//! refuses to create the tap, which `start` reports as an error. While a password field has focus, macOS turns on
//! "Secure Event Input" and stops all taps by itself: passwords can never reach the overlay.
//!
//! The tap lives on its own thread with a run loop (macOS delivers tap events through one). The callback does nothing
//! but name the key and send it down the channel, like the Linux and Windows methods. Key naming and the repeat and
//! stuck-key filter are plain logic in macos_keys.rs, tested on every system.

use super::macos_keys::{modifier_flag_bit, modifier_is_down, MacKeyFilter};
use super::KeyEvent;
use core_foundation::base::TCFType;
use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use core_graphics::event::{
    CGEvent, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType, CallbackResult,
    EventField,
};
use std::ffi::c_void;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{sync_channel, Sender};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

const TEXT_NO_PERMISSION: &str = "macOS isn't letting the app read the keyboard yet. Turn on Keystroke Overlay in \
     System Settings > Privacy & Security > Input Monitoring, then restart the app";
const TEXT_THREAD_STOPPED: &str = "the keyboard capture thread stopped unexpectedly";

/// `kCGEventSourceStateHIDSystemState`: the state of the keyboard hardware itself, as opposed to what apps were told.
const HID_SYSTEM_STATE: i32 = 1;

/// Where System Settings lists the apps allowed to read the keyboard (Privacy & Security > Input Monitoring).
const INPUT_MONITORING_PANE: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent";

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventSourceKeyState(state_id: i32, key: u16) -> bool;
    fn CGEventTapEnable(tap: *mut c_void, enable: bool);
    fn CGPreflightListenEventAccess() -> bool;
    fn CGRequestListenEventAccess() -> bool;
}

#[link(name = "Carbon", kind = "framework")]
extern "C" {
    fn IsSecureEventInputEnabled() -> bool;
}

/// Is this app allowed to read the keyboard (Input Monitoring)? Only asks macOS; never shows a prompt.
pub fn input_monitoring_allowed() -> bool {
    // SAFETY: plain query that takes no arguments and touches no memory of ours.
    unsafe { CGPreflightListenEventAccess() }
}

/// Is "Secure Event Input" on? macOS turns it on while a password field has focus, and then stops every event tap, so
/// no key reaches the overlay. Some apps leave it stuck on by mistake.
pub fn secure_input_on() -> bool {
    // SAFETY: plain query that takes no arguments and touches no memory of ours.
    unsafe { IsSecureEventInputEnabled() }
}

/// Ask macOS for Input Monitoring (it shows its own prompt the first time, which also puts this app in the list) and
/// open the System Settings page where the person ticks it. macOS never asks twice, so the page is opened every time.
pub fn request_input_monitoring() {
    // SAFETY: plain request that takes no arguments and touches no memory of ours.
    unsafe { CGRequestListenEventAccess() };
    let _ = crate::platform::open_url(INPUT_MONITORING_PANE);
}

/// Wraps the capture thread's run loop so `stop` can wake it from another thread. Stopping a run loop from another
/// thread is what Apple documents `CFRunLoopStop` for.
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

/// Start the capture thread. Returns an error when macOS refuses the tap, which is how a missing permission shows.
pub fn start(tx: Sender<KeyEvent>) -> Result<Handle, String> {
    let (ready_tx, ready_rx) = sync_channel::<Result<RunLoopHandle, String>>(1);
    let join = std::thread::Builder::new()
        .name("key-macos".into())
        .spawn(move || capture(tx, ready_tx))
        .map_err(|e| e.to_string())?;
    let run_loop = ready_rx.recv().map_err(|_| TEXT_THREAD_STOPPED.to_string())??;
    Ok(Handle { run_loop, join })
}

/// The capture thread: create the tap, report whether that worked, then run until `stop` is called.
fn capture(tx: Sender<KeyEvent>, ready_tx: std::sync::mpsc::SyncSender<Result<RunLoopHandle, String>>) {
    // The callback needs the tap to switch it back on, but the tap is created after the callback: pass the address in.
    let tap_address = Arc::new(AtomicUsize::new(0));
    let callback = make_callback(tx, tap_address.clone());
    let created = CGEventTap::new(
        CGEventTapLocation::HID,
        CGEventTapPlacement::HeadInsertEventTap,
        CGEventTapOptions::ListenOnly,
        vec![CGEventType::KeyDown, CGEventType::KeyUp, CGEventType::FlagsChanged],
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
    // Dropping `tap` here switches the tap off.
}

/// The tap's callback: tiny, and never blocks (macOS switches off a tap whose callback is slow).
fn make_callback(
    tx: Sender<KeyEvent>,
    tap_address: Arc<AtomicUsize>,
) -> impl Fn(core_graphics::event::CGEventTapProxy, CGEventType, &CGEvent) -> CallbackResult + Send + 'static {
    let filter = Mutex::new(MacKeyFilter::default());
    move |_proxy, event_type, event| {
        let mut filter = filter.lock().unwrap();
        match event_type {
            CGEventType::KeyDown | CGEventType::KeyUp => {
                if let Some((keycode, down)) = key_event(event_type, event) {
                    send_all(&tx, filter.handle(keycode, down, &key_is_really_down));
                }
            }
            CGEventType::FlagsChanged => {
                let keycode = keycode_of(event);
                let down = modifier_is_down(keycode, event.get_flags().bits());
                if modifier_flag_bit(keycode).is_some() {
                    send_all(&tx, filter.handle(keycode, down, &key_is_really_down));
                }
            }
            CGEventType::TapDisabledByTimeout | CGEventType::TapDisabledByUserInput => {
                // Releases may have been missed while the tap was off: let go of everything, then switch it back on.
                send_all(&tx, filter.release_all());
                switch_tap_back_on(&tap_address);
            }
            _ => {}
        }
        CallbackResult::Keep
    }
}

/// The key code and direction of a key-down or key-up event, or None for key repeat (the filter would drop it too, but
/// this saves the work).
fn key_event(event_type: CGEventType, event: &CGEvent) -> Option<(u16, bool)> {
    let down = matches!(event_type, CGEventType::KeyDown);
    let is_repeat = event.get_integer_value_field(EventField::KEYBOARD_EVENT_AUTOREPEAT) != 0;
    if down && is_repeat {
        return None;
    }
    Some((keycode_of(event), down))
}

fn keycode_of(event: &CGEvent) -> u16 {
    event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE) as u16
}

fn send_all(tx: &Sender<KeyEvent>, events: Vec<KeyEvent>) {
    for event in events {
        let _ = tx.send(event);
    }
}

fn key_is_really_down(mac_keycode: u16) -> bool {
    // SAFETY: plain query with a state id and a key code; touches no memory of ours.
    unsafe { CGEventSourceKeyState(HID_SYSTEM_STATE, mac_keycode) }
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

    #[link(name = "Carbon", kind = "framework")]
    extern "C" {
        fn EnableSecureEventInput() -> i32;
        fn DisableSecureEventInput() -> i32;
    }

    /// Turns Secure Input on the way a password box does and checks the app sees it, then off again. It is on only for the
    /// moment of the test, and it proves `secure_input_on` (what the window's Secure Input hint and the bug report use)
    /// follows the system.
    #[test]
    fn secure_input_on_follows_the_system() {
        assert!(
            !secure_input_on(),
            "start from Secure Input off (close any app that holds it)"
        );
        // SAFETY: plain calls that take no arguments; they are paired, so the system is left as it was found.
        unsafe { EnableSecureEventInput() };
        let seen_on = secure_input_on();
        unsafe { DisableSecureEventInput() };
        assert!(seen_on, "Secure Input was switched on, so the app must see it");
        assert!(!secure_input_on(), "and see it end");
    }
}
