//! Linux, Wayland desktops: mouse buttons and the wheel by reading the mice in /dev/input (docs/proposals/mouse-input.md).
//!
//! The keyboard's Wayland method (`keyboard/linux_devices.rs`) applied to mice: the devices that have a left button are
//! opened **read-only and never grabbed**, so every other app still gets every click, and one thread waits on all of them
//! and a wake pipe with poll() (`linux_poll.rs`), so at idle it sleeps in the kernel. The files belong to the `input` group:
//! the same group, and the same notice in the settings window, as for the keyboards.
//!
//! **Movement never reaches the app.** The kernel keeps an event mask per reader (`EVIOCSMASK`, Linux 4.4 and newer).
//! It is set so that this reader gets button presses and the two wheel codes only: the pointer's axes are not queued for
//! our file at all, and poll() does not wake when the mouse moves. `evdev` has no wrapper for the ioctl, so it is
//! declared here like the poll binding. If a kernel refuses the mask, movement events are read and dropped unread
//! (only buttons and wheel codes are ever looked at), and the Debug event log says so once.
//!
//! Touchpads are skipped: their clicks are taps the compositor makes, and they scroll continuously, not in notches.
//! Mice plugged in after the capture started are not picked up until it restarts (turn the input off and on).

use super::names;
use super::wheel::Throttle;
use crate::keyboard::KeyEvent;
use crate::linux_poll::{event_files, is_denied, open_read_only as open_file, wait_for_events, SYN_DROPPED};
use evdev::raw_stream::RawDevice;
use evdev::{EventType, KeyCode};
use std::collections::HashSet;
use std::io::{PipeReader, PipeWriter};
use std::os::fd::{AsRawFd, RawFd};
use std::sync::mpsc::Sender;
use std::thread::JoinHandle;
use std::time::Instant;

/// evdev event values for a button: 1 is a press, 0 a release.
const BUTTON_RELEASED: i32 = 0;
const BUTTON_PRESSED: i32 = 1;

/// Shown in General when no mouse could be opened for lack of permission.
pub const NO_PERMISSION: &str = "no permission to read the mice (the input group, see the notice above)";
const NO_MOUSE: &str = "no mouse found in /dev/input";

// ---- the event mask: buttons and the wheel only
/// `_IOW('E', 0x93, struct input_mask)` from linux/input.h (the struct is 16 bytes).
const EVIOCSMASK: std::os::raw::c_ulong = 0x4010_4593;
/// Event types (linux/input-event-codes.h).
const EV_KEY: u32 = 0x01;
const EV_REL: u32 = 0x02;
const EV_ABS: u32 = 0x03;
/// The key codes go up to KEY_MAX (0x2ff): the mask has one bit for each.
const KEY_BITS: usize = 0x300;
/// The wheel's two relative codes: one notch up or down, one notch sideways.
const REL_HWHEEL: u16 = 0x06;
const REL_WHEEL: u16 = 0x08;

/// `struct input_mask` of linux/input.h: which codes of one event type a reader wants.
#[repr(C)]
struct InputMask {
    event_type: u32,
    codes_size: u32,
    codes_ptr: u64,
}
extern "C" {
    fn ioctl(fd: RawFd, request: std::os::raw::c_ulong, ...) -> i32;
}

/// A bit mask of `bits` bits with the given codes set (little-endian bytes, as the kernel reads them).
fn mask_with(bits: usize, codes: &[u16]) -> Vec<u8> {
    let mut mask = vec![0u8; bits.div_ceil(8)];
    for &code in codes {
        mask[usize::from(code) / 8] |= 1 << (code % 8);
    }
    mask
}

/// Every key and button code.
fn all_keys_mask() -> Vec<u8> {
    vec![0xff; KEY_BITS / 8]
}

/// The two wheel codes and nothing else of the relative axes.
fn wheel_mask() -> Vec<u8> {
    mask_with(usize::from(REL_WHEEL) + 1, &[REL_HWHEEL, REL_WHEEL])
}

/// No absolute axis at all (a mouse that also reports absolute positions must not wake us either).
fn no_axes_mask() -> Vec<u8> {
    vec![0u8; 8]
}

fn set_mask(fd: RawFd, event_type: u32, codes: &[u8]) -> std::io::Result<()> {
    let mask = InputMask {
        event_type,
        codes_size: codes.len() as u32,
        codes_ptr: codes.as_ptr() as u64,
    };
    // SAFETY: `mask` and the bytes it points to live for the whole call; the ioctl only reads them.
    let result = unsafe { ioctl(fd, EVIOCSMASK, &mask as *const InputMask) };
    if result == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

/// Tells the kernel this reader wants button presses and the wheel, nothing else. The error is the kernel's refusal.
fn mask_out_movement(device: &RawDevice) -> std::io::Result<()> {
    let fd = device.as_raw_fd();
    set_mask(fd, EV_KEY, &all_keys_mask())?;
    set_mask(fd, EV_REL, &wheel_mask())?;
    set_mask(fd, EV_ABS, &no_axes_mask())
}

// ---- finding the mice
/// A mouse has a left button; a touchpad or touchscreen also has `BTN_TOUCH` and is skipped.
fn is_mouse(device: &RawDevice) -> bool {
    let Some(keys) = device.supported_keys() else {
        return false;
    };
    keys.contains(KeyCode::BTN_LEFT) && !keys.contains(KeyCode::BTN_TOUCH)
}

/// One open mouse and the buttons it holds down right now.
struct Mouse {
    device: RawDevice,
    held: HashSet<&'static str>,
}

struct Found {
    mice: Vec<Mouse>,
    denied: bool,
}

fn find_mice() -> Found {
    let mut found = Found {
        mice: Vec::new(),
        denied: false,
    };
    for path in event_files() {
        let opened = open_file(&path).and_then(|file| RawDevice::from_fd(file.into()));
        match opened {
            Ok(device) if is_mouse(&device) => found.mice.push(Mouse {
                device,
                held: HashSet::new(),
            }),
            Ok(_) => {}
            Err(error) if is_denied(&error) => found.denied = true,
            Err(_) => {}
        }
    }
    found
}

fn nothing_opened(denied: bool) -> &'static str {
    if denied {
        NO_PERMISSION
    } else {
        NO_MOUSE
    }
}

pub struct Handle {
    /// Dropping it closes the pipe, which wakes the capture thread.
    wake: PipeWriter,
    join: JoinHandle<()>,
}

impl Handle {
    pub fn stop(self) {
        drop(self.wake);
        let _ = self.join.join();
    }
}

pub fn start(tx: Sender<KeyEvent>) -> Result<Handle, String> {
    let found = find_mice();
    if found.mice.is_empty() {
        return Err(nothing_opened(found.denied).to_string());
    }
    // Movement is masked out of what the kernel queues for us. A refusal is not fatal: movement is read and dropped.
    if let Some(error) = found
        .mice
        .iter()
        .find_map(|mouse| mask_out_movement(&mouse.device).err())
    {
        crate::debug::log(format!(
            "mouse: this kernel refused the event mask ({error}), movement events are read and dropped unread"
        ));
    }
    let (wake_reader, wake) = std::io::pipe().map_err(|e| e.to_string())?;
    let join = std::thread::Builder::new()
        .name("mouse-devices".into())
        .spawn(move || capture(found.mice, &wake_reader, &tx))
        .map_err(|e| e.to_string())?;
    Ok(Handle { wake, join })
}

/// What one evdev event means for the overlay.
#[derive(Debug, PartialEq)]
enum Change {
    /// A button went down or up.
    Button(&'static str, bool),
    /// The wheel turned one notch (a short press).
    Wheel(&'static str),
}

/// The change in one evdev event, or None for everything else (sync, scan codes, the pointer's axes, repeats).
fn mouse_change(event_type: EventType, code: u16, value: i32) -> Option<Change> {
    match event_type {
        EventType::KEY => {
            let name = names::evdev_button(code)?;
            match value {
                BUTTON_PRESSED => Some(Change::Button(name, true)),
                BUTTON_RELEASED => Some(Change::Button(name, false)),
                _ => None,
            }
        }
        EventType::RELATIVE => names::evdev_wheel(code, value).map(Change::Wheel),
        _ => None,
    }
}

/// How many times poll() woke the capture, to show that moving the mouse does not (tests only).
#[cfg(test)]
static WAKES: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

/// The capture loop: wait until a mouse has events or the wake pipe is closed, then pass on buttons and wheel notches.
fn capture(mut mice: Vec<Mouse>, wake: &PipeReader, tx: &Sender<KeyEvent>) {
    let mut throttle = Throttle::default();
    let started = Instant::now();
    loop {
        let fds: Vec<RawFd> = mice.iter().map(|mouse| mouse.device.as_raw_fd()).collect();
        let Some(ready) = wait_for_events(&fds, wake) else {
            break; // asked to stop, or poll itself failed
        };
        #[cfg(test)]
        WAKES.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        // A mouse that fails to read (unplugged) is dropped, and lets go of its buttons.
        let mut still_there = Vec::with_capacity(mice.len());
        for (mut mouse, has_events) in mice.into_iter().zip(ready) {
            if has_events && !read_mouse(&mut mouse, &mut throttle, started, tx) {
                release_all(&mut mouse.held, tx);
                continue;
            }
            still_there.push(mouse);
        }
        mice = still_there;
    }
    for mouse in &mut mice {
        release_all(&mut mouse.held, tx);
    }
}

fn release_all(held: &mut HashSet<&'static str>, tx: &Sender<KeyEvent>) {
    for code in held.drain() {
        let _ = tx.send(KeyEvent { down: false, code });
    }
}

/// Reads the waiting events of one mouse. False when the mouse can no longer be read.
fn read_mouse(mouse: &mut Mouse, throttle: &mut Throttle, started: Instant, tx: &Sender<KeyEvent>) -> bool {
    let Ok(events) = mouse.device.fetch_events() else {
        return false;
    };
    for event in events {
        if event.event_type() == EventType::SYNCHRONIZATION && event.code() == SYN_DROPPED {
            // a release may have been among the dropped events: let go of the buttons rather than leave one stuck down
            release_all(&mut mouse.held, tx);
            continue;
        }
        match mouse_change(event.event_type(), event.code(), event.value()) {
            Some(Change::Button(code, down)) => {
                if down {
                    mouse.held.insert(code);
                } else {
                    mouse.held.remove(code);
                }
                let _ = tx.send(KeyEvent { down, code });
            }
            // a notch is one short press, at most one per direction every MIN_TAP_MS
            Some(Change::Wheel(code)) if throttle.allow(code, started.elapsed().as_millis() as u64) => {
                let _ = tx.send(KeyEvent { down: true, code });
                let _ = tx.send(KeyEvent { down: false, code });
            }
            Some(Change::Wheel(_)) | None => {}
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use evdev::{AttributeSet, InputEvent, RelativeAxisCode};
    use std::time::Duration;

    #[test]
    fn the_masks_name_buttons_and_the_wheel_only() {
        assert_eq!(
            wheel_mask(),
            vec![0x40, 0x01],
            "REL_HWHEEL (6) and REL_WHEEL (8), no other axis"
        );
        assert!(all_keys_mask().iter().all(|byte| *byte == 0xff));
        assert_eq!(all_keys_mask().len() * 8, KEY_BITS);
        assert!(no_axes_mask().iter().all(|byte| *byte == 0));
        assert!(
            !no_axes_mask().is_empty(),
            "an empty mask would mean no mask: every axis would come through"
        );
    }

    #[test]
    fn the_ioctl_number_is_the_kernels() {
        // _IOW('E', 0x93, 16 bytes): direction write (1) << 30, size << 16, type 'E' << 8, number 0x93
        assert_eq!(
            EVIOCSMASK,
            (1 << 30) | (16 << 16) | (std::os::raw::c_ulong::from(b'E') << 8) | 0x93
        );
        assert_eq!(std::mem::size_of::<InputMask>(), 16);
    }

    /// A recorded stream: a click, a move, a notch up, a scroll the other way, a sideways notch, the release, and the
    /// scan code and sync events that come with them. Only the buttons and the notches are named.
    #[test]
    fn a_recorded_stream_becomes_buttons_and_notches_and_no_movement() {
        let recorded = [
            (EventType::MISC, 4, 0x90001),
            (EventType::KEY, 0x110, BUTTON_PRESSED),
            (EventType::SYNCHRONIZATION, 0, 0),
            (EventType::RELATIVE, 0, 3), // the pointer moved: never named
            (EventType::RELATIVE, 1, -2),
            (EventType::RELATIVE, REL_WHEEL, 1),
            (EventType::RELATIVE, REL_WHEEL, -1),
            (EventType::RELATIVE, REL_HWHEEL, 1),
            (EventType::RELATIVE, 0x0b, 120), // the high-resolution wheel: skipped
            (EventType::KEY, 0x110, 2),       // a repeat
            (EventType::KEY, 0x110, BUTTON_RELEASED),
            (EventType::KEY, 0x113, BUTTON_PRESSED), // BTN_SIDE
            (EventType::KEY, 0x30, BUTTON_PRESSED),  // a key of a keyboard
        ];
        let seen: Vec<Change> = recorded
            .into_iter()
            .filter_map(|(event_type, code, value)| mouse_change(event_type, code, value))
            .collect();
        assert_eq!(
            seen,
            vec![
                Change::Button("MouseLeft", true),
                Change::Wheel("WheelUp"),
                Change::Wheel("WheelDown"),
                Change::Wheel("WheelRight"),
                Change::Button("MouseLeft", false),
                Change::Button("MouseBack", true),
            ]
        );
    }

    #[test]
    fn the_error_says_when_permission_is_missing() {
        assert_eq!(nothing_opened(true), NO_PERMISSION);
        assert_eq!(nothing_opened(false), NO_MOUSE);
    }

    #[test]
    fn stops_promptly_while_waiting() {
        let (wake_reader, wake) = std::io::pipe().unwrap();
        let (tx, _rx) = std::sync::mpsc::channel();
        let join = std::thread::spawn(move || capture(Vec::new(), &wake_reader, &tx));
        drop(wake);
        join.join().unwrap();
    }

    // ---- Tests on a real virtual mouse (uinput). They need /dev/uinput, so they are skipped by default and run in the
    // Linux tests workflow (.github/workflows/linux-tests.yml). Making a virtual device is only allowed here, in tests:
    // the app itself never does (tools/check-privacy.mjs).

    /// How long the kernel and the desktop take to list a new virtual device.
    const DEVICE_SETTLE: Duration = Duration::from_millis(500);

    /// A virtual mouse: five buttons, the pointer's two axes and both wheels.
    fn virtual_mouse() -> evdev::uinput::VirtualDevice {
        let mut keys = AttributeSet::<KeyCode>::new();
        for code in [
            KeyCode::BTN_LEFT,
            KeyCode::BTN_RIGHT,
            KeyCode::BTN_MIDDLE,
            KeyCode::BTN_SIDE,
            KeyCode::BTN_EXTRA,
        ] {
            keys.insert(code);
        }
        let mut axes = AttributeSet::<RelativeAxisCode>::new();
        for axis in [
            RelativeAxisCode::REL_X,
            RelativeAxisCode::REL_Y,
            RelativeAxisCode::REL_WHEEL,
            RelativeAxisCode::REL_HWHEEL,
        ] {
            axes.insert(axis);
        }
        let device = evdev::uinput::VirtualDevice::builder()
            .and_then(|builder| builder.name("Keystroke Overlay test mouse").with_keys(&keys))
            .and_then(|builder| builder.with_relative_axes(&axes))
            .and_then(|builder| builder.build())
            .expect("needs write access to /dev/uinput (run as root)");
        std::thread::sleep(DEVICE_SETTLE);
        device
    }

    fn emit(device: &mut evdev::uinput::VirtualDevice, event_type: EventType, code: u16, value: i32) {
        device.emit(&[InputEvent::new(event_type.0, code, value)]).unwrap();
    }

    #[test]
    #[ignore = "needs /dev/uinput (the Linux tests workflow)"]
    fn captures_a_virtual_mouse() {
        let mut device = virtual_mouse();
        let (tx, rx) = std::sync::mpsc::channel();
        let handle = start(tx).expect("capture should start when the mice can be read");
        let buttons = [
            (0x110, "MouseLeft"),
            (0x111, "MouseRight"),
            (0x112, "MouseMiddle"),
            (0x113, "MouseBack"),
            (0x114, "MouseForward"),
        ];
        for (code, _) in buttons {
            for value in [BUTTON_PRESSED, BUTTON_RELEASED] {
                emit(&mut device, EventType::KEY, code, value);
            }
        }
        let wait = Duration::from_secs(2);
        for (_, name) in buttons {
            for down in [true, false] {
                let event = rx.recv_timeout(wait).expect("every press and release should arrive");
                assert_eq!((event.down, event.code), (down, name));
            }
        }
        // one notch each way, then sideways, spaced out so the throttle lets every one through
        for (code, value, name) in [
            (REL_WHEEL, 1, "WheelUp"),
            (REL_WHEEL, -1, "WheelDown"),
            (REL_HWHEEL, 1, "WheelRight"),
            (REL_HWHEEL, -1, "WheelLeft"),
        ] {
            std::thread::sleep(Duration::from_millis(150));
            emit(&mut device, EventType::RELATIVE, code, value);
            for down in [true, false] {
                let event = rx.recv_timeout(wait).expect("a notch is a press and a release");
                assert_eq!((event.down, event.code), (down, name));
            }
        }
        handle.stop();
    }

    /// Asks the kernel directly, so a failure of the next test says whether the mask or something else is to blame.
    #[test]
    #[ignore = "needs /dev/uinput (the Linux tests workflow)"]
    fn the_kernel_accepts_the_mask() {
        let _device = virtual_mouse();
        let found = find_mice();
        assert!(
            !found.mice.is_empty(),
            "the virtual mouse should be found (denied: {})",
            found.denied
        );
        for mouse in &found.mice {
            mask_out_movement(&mouse.device).expect("the kernel should accept the event mask");
        }
    }

    /// The point of the mask: moving the mouse 1,000 times neither sends anything nor wakes the capture.
    #[test]
    #[ignore = "needs /dev/uinput (the Linux tests workflow)"]
    fn movement_never_wakes_the_capture() {
        use std::sync::atomic::Ordering;
        let mut device = virtual_mouse();
        let (tx, rx) = std::sync::mpsc::channel();
        let handle = start(tx).expect("capture should start when the mice can be read");
        std::thread::sleep(Duration::from_millis(300));
        let before = WAKES.load(Ordering::SeqCst);
        for step in 0..1000 {
            let axis = if step % 2 == 0 {
                RelativeAxisCode::REL_X
            } else {
                RelativeAxisCode::REL_Y
            };
            emit(&mut device, EventType::RELATIVE, axis.0, 1);
            emit(&mut device, EventType::SYNCHRONIZATION, 0, 0);
        }
        std::thread::sleep(Duration::from_millis(500));
        assert_eq!(
            WAKES.load(Ordering::SeqCst),
            before,
            "moving the mouse must not wake the capture thread"
        );
        assert!(rx.try_recv().is_err(), "moving the mouse must send nothing");
        handle.stop();
    }

    /// Run as a user who is not in the input group, while a mouse exists: the error must point to the fix.
    #[test]
    #[ignore = "needs a mouse device and a user outside the input group (the Linux tests workflow)"]
    fn without_the_input_group_the_error_says_so() {
        let (tx, _rx) = std::sync::mpsc::channel();
        let error = start(tx).err().expect("no mouse should open without the input group");
        assert_eq!(error, NO_PERMISSION);
    }

    /// Not a check: keeps a virtual mouse alive until the file named in KO_TYPE_WHEN exists, then clicks once.
    #[test]
    #[ignore = "a helper for the Linux tests workflow"]
    fn keep_a_virtual_mouse_for_the_app_test() {
        let signal = std::env::var("KO_TYPE_WHEN").expect("KO_TYPE_WHEN names the file to wait for");
        let mut device = virtual_mouse();
        while !std::path::Path::new(&signal).exists() {
            std::thread::sleep(Duration::from_millis(100));
        }
        for (code, value) in [(0x110, BUTTON_PRESSED), (0x110, BUTTON_RELEASED)] {
            emit(&mut device, EventType::KEY, code, value);
        }
        std::thread::sleep(Duration::from_secs(2));
    }
}
