//! Game controllers (docs/design/future-inputs.md). For now a trial, the "spike" of
//! docs/for-claude/proposals/controllers-gilrs.md (work order step 1), to measure the gilrs library before Jordan decides
//! on it as a dependency.
//!
//! Only `names.rs` (the name table) and `held.rs` (which buttons are held) are in every build. Everything else here is built only with the cargo feature
//! `gamepad` (off by default, so the shipped app has none of it) and runs only when KEYOVERLAY_GAMEPAD is set at launch
//! (docs/DEBUGGING.md, Trying the controller spike). This is the only file that uses gilrs.
//!
//! How it works: one thread, `gamepad`, owns gilrs and waits for its events. A button press or release becomes a key event
//! with the button's name (`PadA`, names.rs) on the keyboard's own channel, so the dispatcher, the held keys, Pause and
//! the overlay treat it like any key. Only the first controller is shown (the lowest gilrs id still connected). Sticks and
//! triggers as moving values are not sent yet (work order step 3); a trigger counts as a button past half way.
//!
//! What gilrs does underneath, read from gilrs-core 0.6.8 (the trial measures it):
//!   * Windows (`xinput` backend): its own thread polls XInput every 10 ms, always, even with no controller.
//!   * Linux: waits in epoll on the controller files (no timer), plus a thread waiting for udev's plug-in messages.
//!   * macOS: a run-loop thread with IOKit HID callbacks (no timer).
//!   * Force feedback is off (`with_force_feedback(false)`): with it on, gilrs starts a thread that wakes every 50 ms forever.
//!
//! Known stop problems, why this is a trial and not a feature:
//!   * gilrs's wait can't be woken from another thread, so our thread waits at most STOP_CHECK at a time, then looks
//!     whether it was asked to stop: one wake a second while on, and stop() can take up to a second.
//!   * Dropping gilrs doesn't end its own threads. Windows: the XInput thread has no stop signal and polls until the app
//!     quits. macOS: its run loop is never stopped, so the HID manager and its callbacks stay. Linux: the controller files
//!     close, but the udev thread stays until the next controller is plugged in or out. So each off-and-on can leave one
//!     more thread behind (KEYOVERLAY_GAMEPAD=cycle counts them).
//!   * Linux: gilrs opens a controller for reading and writing, and gives one that can rumble a rumble effect, even with
//!     force feedback off (it is never played). The keyboards are opened read-only; controllers are not.
//!
//! Privacy: only button names, in memory, down the keyboard's channel. Never a controller's name, serial or battery. The
//! event log says when a controller connects or disconnects, never which one. gilrs's own trace lines go nowhere: the app
//! installs no logger (tools/check-privacy.mjs forbids one).

// Plain logic, built in every build so their tests always run; only the trial below uses them so far.
#[cfg_attr(not(feature = "gamepad"), allow(dead_code))]
mod held;
#[cfg_attr(not(feature = "gamepad"), allow(dead_code))]
mod names;

#[cfg(feature = "gamepad")]
use {
    crate::keyboard::KeyEvent,
    held::HeldButtons,
    names::PadButton,
    std::sync::atomic::{AtomicBool, Ordering},
    std::sync::mpsc::Sender,
    std::sync::Arc,
    std::thread::JoinHandle,
    std::time::Duration,
};

/// The environment variable that starts the trial at launch: `1` turns controllers on; `cycle` first turns them on and
/// off ON_OFF_CYCLES times (to count the threads gilrs leaves behind), then on.
#[cfg(feature = "gamepad")]
const SWITCH: &str = "KEYOVERLAY_GAMEPAD";

/// How many times `cycle` turns controllers on and off (the proposal's measurement: 20).
#[cfg(feature = "gamepad")]
const ON_OFF_CYCLES: usize = 20;

/// The longest the thread waits for gilrs before it checks whether it should stop (see "Known stop problems").
#[cfg(feature = "gamepad")]
const STOP_CHECK: Duration = Duration::from_secs(1);

/// A trigger counts as pressed from half way (future-inputs.md §3) and as released below 0.4, so a trigger resting near
/// half way doesn't flicker (the proposal's TRIGGER_RELEASE). gilrs's own defaults are 0.75 and 0.65.
#[cfg(feature = "gamepad")]
const TRIGGER_PRESSED: f32 = 0.5;
#[cfg(feature = "gamepad")]
const TRIGGER_RELEASED: f32 = 0.4;

/// Shown where gilrs has no backend for the system.
#[cfg(feature = "gamepad")]
const UNAVAILABLE: &str = "controllers aren't available on this system yet";

/// What KEYOVERLAY_GAMEPAD asks for.
#[cfg(feature = "gamepad")]
#[derive(Debug, PartialEq, Eq)]
enum Trial {
    Off,
    On,
    OnAfterCycles,
}

#[cfg(feature = "gamepad")]
fn trial_from(value: Option<&str>) -> Trial {
    match value {
        Some("1") => Trial::On,
        Some("cycle") => Trial::OnAfterCycles,
        _ => Trial::Off,
    }
}

/// Starts the trial if KEYOVERLAY_GAMEPAD asks for it (main.rs, at launch). It then runs until the app quits. The start
/// happens on a short-lived thread of its own, because `cycle` takes up to ON_OFF_CYCLES seconds.
#[cfg(feature = "gamepad")]
pub fn start_trial_if_asked(tx: Sender<KeyEvent>) {
    let trial = trial_from(std::env::var(SWITCH).ok().as_deref());
    if trial == Trial::Off {
        return;
    }
    let spawned = std::thread::Builder::new()
        .name("gamepad-trial".into())
        .spawn(move || run_trial(trial, tx));
    if spawned.is_err() {
        crate::debug::log("controller trial: could not start its thread");
    }
}

#[cfg(feature = "gamepad")]
fn run_trial(trial: Trial, tx: Sender<KeyEvent>) {
    if trial == Trial::OnAfterCycles {
        for _ in 0..ON_OFF_CYCLES {
            match start(tx.clone()) {
                Ok(handle) => handle.stop(),
                Err(_) => break, // the start below logs why
            }
        }
        crate::debug::log(format!("controller trial: turned on and off {ON_OFF_CYCLES} times"));
    }
    match start(tx) {
        // Not stopped: the capture runs until the app quits.
        Ok(_handle) => crate::debug::log("controller trial: on"),
        Err(problem) => crate::debug::log(format!("controller trial: couldn't start: {problem}")),
    }
}

#[cfg(feature = "gamepad")]
pub struct Handle {
    stop: Arc<AtomicBool>,
    join: JoinHandle<()>,
}

#[cfg(feature = "gamepad")]
impl Handle {
    /// Asks the thread to stop and waits for it (up to STOP_CHECK). Its held buttons are released first.
    pub fn stop(self) {
        self.stop.store(true, Ordering::Relaxed);
        let _ = self.join.join();
    }
}

/// Starts reading controllers: button presses and releases go to `tx` as key events.
#[cfg(feature = "gamepad")]
pub fn start(tx: Sender<KeyEvent>) -> Result<Handle, String> {
    let gilrs = open_gilrs()?;
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = stop.clone();
    let join = std::thread::Builder::new()
        .name("gamepad".into())
        .spawn(move || capture(gilrs, &thread_stop, &tx))
        .map_err(|e| e.to_string())?;
    Ok(Handle { stop, join })
}

#[cfg(feature = "gamepad")]
fn open_gilrs() -> Result<gilrs::Gilrs, String> {
    let built = gilrs::GilrsBuilder::new()
        .with_force_feedback(false)
        .set_axis_to_btn(TRIGGER_PRESSED, TRIGGER_RELEASED)
        .build();
    match built {
        Ok(gilrs) => Ok(gilrs),
        // gilrs hands back a stand-in that never reports anything; it is dropped here.
        Err(gilrs::Error::NotImplemented(_)) => Err(UNAVAILABLE.to_string()),
        Err(other) => Err(other.to_string()),
    }
}

/// The capture loop: wait for gilrs's next event (at most STOP_CHECK), turn buttons into key events, until asked to stop.
#[cfg(feature = "gamepad")]
fn capture(mut gilrs: gilrs::Gilrs, stop: &AtomicBool, tx: &Sender<KeyEvent>) {
    let mut held = HeldButtons::default();
    while !stop.load(Ordering::Relaxed) {
        let Some(event) = gilrs.next_event_blocking(Some(STOP_CHECK)) else {
            continue; // nothing within STOP_CHECK
        };
        let pad = usize::from(event.id);
        let shown = gilrs.gamepads().next().map(|(id, _)| usize::from(id));
        let key_events = match event.event {
            gilrs::EventType::ButtonPressed(button, _) if shown == Some(pad) => held.press(pad, our_button(button)),
            gilrs::EventType::ButtonReleased(button, _) => held.release(pad, our_button(button)),
            gilrs::EventType::Connected => {
                crate::debug::log("controller trial: a controller connected");
                Vec::new()
            }
            gilrs::EventType::Disconnected => {
                crate::debug::log("controller trial: a controller disconnected");
                held.disconnected(pad)
            }
            _ => Vec::new(), // moving values (step 3), and the other controllers' presses
        };
        for key_event in key_events {
            let _ = tx.send(key_event);
        }
    }
    for key_event in held.release_all() {
        let _ = tx.send(key_event);
    }
}

/// gilrs's buttons, which it names by place like we do. Its LeftTrigger is the bumper, LeftTrigger2 the trigger.
#[cfg(feature = "gamepad")]
fn our_button(button: gilrs::Button) -> PadButton {
    use gilrs::Button as Gilrs;
    match button {
        Gilrs::South => PadButton::South,
        Gilrs::East => PadButton::East,
        Gilrs::West => PadButton::West,
        Gilrs::North => PadButton::North,
        Gilrs::LeftTrigger => PadButton::LeftBumper,
        Gilrs::RightTrigger => PadButton::RightBumper,
        Gilrs::LeftTrigger2 => PadButton::LeftTrigger,
        Gilrs::RightTrigger2 => PadButton::RightTrigger,
        Gilrs::Select => PadButton::Back,
        Gilrs::Start => PadButton::Start,
        Gilrs::Mode => PadButton::Home,
        Gilrs::LeftThumb => PadButton::LeftStick,
        Gilrs::RightThumb => PadButton::RightStick,
        Gilrs::DPadUp => PadButton::Up,
        Gilrs::DPadDown => PadButton::Down,
        Gilrs::DPadLeft => PadButton::Left,
        Gilrs::DPadRight => PadButton::Right,
        Gilrs::C | Gilrs::Z | Gilrs::Unknown => PadButton::Other,
    }
}

#[cfg(test)]
mod tests {
    // Everything here tests the trial, so it is built only with the `gamepad` feature, like the trial itself.
    #[cfg(feature = "gamepad")]
    use super::*;

    #[test]
    #[cfg(feature = "gamepad")]
    fn the_switch_needs_an_exact_value() {
        assert_eq!(trial_from(Some("1")), Trial::On);
        assert_eq!(trial_from(Some("cycle")), Trial::OnAfterCycles);
        for value in [None, Some(""), Some("0"), Some("yes"), Some("true")] {
            assert_eq!(trial_from(value), Trial::Off, "{value:?}");
        }
    }

    #[test]
    #[cfg(feature = "gamepad")]
    fn every_gilrs_button_maps_by_place() {
        assert_eq!(our_button(gilrs::Button::South), PadButton::South);
        assert_eq!(
            our_button(gilrs::Button::LeftTrigger),
            PadButton::LeftBumper,
            "gilrs's LeftTrigger is LB"
        );
        assert_eq!(
            our_button(gilrs::Button::LeftTrigger2),
            PadButton::LeftTrigger,
            "LeftTrigger2 is LT"
        );
        assert_eq!(our_button(gilrs::Button::Select), PadButton::Back);
        assert_eq!(our_button(gilrs::Button::Mode), PadButton::Home);
        for ignored in [gilrs::Button::C, gilrs::Button::Z, gilrs::Button::Unknown] {
            assert_eq!(names::button_name(our_button(ignored)), None);
        }
    }

    // ---- With the real library, Linux only (docs/DEBUGGING.md, Trying the controller spike). Skipped by default: they
    // start gilrs, and the virtual controller needs /dev/uinput and udev. Making a virtual device is only allowed here, in
    // tests: the app itself never does (tools/check-privacy.mjs).

    /// This process's threads, from /proc.
    #[cfg(all(feature = "gamepad", target_os = "linux"))]
    fn thread_count() -> usize {
        std::fs::read_dir("/proc/self/task")
            .map(|tasks| tasks.count())
            .unwrap_or(0)
    }

    /// Not a check: the trial's thread measurement. Turns controllers on and off ON_OFF_CYCLES times and prints the
    /// thread count after each, so a thread gilrs leaves behind shows up. Run with
    /// `cargo test --manifest-path src-tauri/Cargo.toml --features gamepad -- --ignored --nocapture --exact gamepad::tests::count_threads_over_on_off_cycles`
    #[test]
    #[cfg(all(feature = "gamepad", target_os = "linux"))]
    #[ignore = "a measurement for the controller trial"]
    fn count_threads_over_on_off_cycles() {
        let (tx, _rx) = std::sync::mpsc::channel();
        let before = thread_count();
        for cycle in 1..=ON_OFF_CYCLES {
            start(tx.clone()).expect("gilrs should start").stop();
            println!("after {cycle} on/off: {} threads (before: {before})", thread_count());
        }
    }

    /// How long `count_wakes_while_idle` watches.
    #[cfg(all(feature = "gamepad", target_os = "linux"))]
    const IDLE_WATCH: Duration = Duration::from_secs(10);

    /// Each thread's name and how often it has woken up (the kernel's count of times it went to sleep by itself).
    #[cfg(all(feature = "gamepad", target_os = "linux"))]
    fn wakes_per_thread() -> Vec<(String, u64)> {
        let mut found = Vec::new();
        for task in std::fs::read_dir("/proc/self/task").into_iter().flatten().flatten() {
            let name = std::fs::read_to_string(task.path().join("comm")).unwrap_or_default();
            let status = std::fs::read_to_string(task.path().join("status")).unwrap_or_default();
            let wakes = status
                .lines()
                .find_map(|line| line.strip_prefix("voluntary_ctxt_switches:"))
                .and_then(|count| count.trim().parse().ok())
                .unwrap_or(0);
            found.push((name.trim().to_string(), wakes));
        }
        found
    }

    /// Not a check: the trial's idle measurement. Turns controllers on, leaves them alone for IDLE_WATCH, and prints how
    /// often each thread woke up meanwhile (ours, `gamepad`, should wake once per STOP_CHECK; gilrs's should not wake).
    /// Run like `count_threads_over_on_off_cycles`, with this test's name.
    #[test]
    #[cfg(all(feature = "gamepad", target_os = "linux"))]
    #[ignore = "a measurement for the controller trial"]
    fn count_wakes_while_idle() {
        let (tx, _rx) = std::sync::mpsc::channel();
        let handle = start(tx).expect("gilrs should start");
        let before = wakes_per_thread();
        std::thread::sleep(IDLE_WATCH);
        for (name, wakes) in wakes_per_thread() {
            let earlier = before
                .iter()
                .find(|(seen, _)| *seen == name)
                .map_or(0, |(_, count)| *count);
            println!("{name}: woke {} times in {IDLE_WATCH:?}", wakes - earlier);
        }
        handle.stop();
    }

    /// How long the kernel and udev take to list a new virtual device.
    #[cfg(all(feature = "gamepad", target_os = "linux"))]
    const DEVICE_SETTLE: Duration = Duration::from_millis(500);

    /// A virtual Xbox 360 controller (vendor 045e, product 028e, so gilrs's SDL mapping applies). udev marks it as a
    /// joystick, which is what gilrs looks for.
    #[cfg(all(feature = "gamepad", target_os = "linux"))]
    fn virtual_controller() -> evdev::uinput::VirtualDevice {
        use evdev::{AbsInfo, AbsoluteAxisCode as Abs, AttributeSet, BusType, InputId, KeyCode, UinputAbsSetup};
        let mut buttons = AttributeSet::<KeyCode>::new();
        for button in [
            KeyCode::BTN_SOUTH,
            KeyCode::BTN_EAST,
            KeyCode::BTN_NORTH,
            KeyCode::BTN_WEST,
            KeyCode::BTN_TL,
            KeyCode::BTN_TR,
            KeyCode::BTN_SELECT,
            KeyCode::BTN_START,
            KeyCode::BTN_MODE,
            KeyCode::BTN_THUMBL,
            KeyCode::BTN_THUMBR,
        ] {
            buttons.insert(button);
        }
        let stick = AbsInfo::new(0, -32768, 32767, 16, 128, 0);
        let trigger = AbsInfo::new(0, 0, 255, 0, 0, 0);
        let hat = AbsInfo::new(0, -1, 1, 0, 0, 0);
        let axes = [
            (Abs::ABS_X, stick),
            (Abs::ABS_Y, stick),
            (Abs::ABS_RX, stick),
            (Abs::ABS_RY, stick),
            (Abs::ABS_Z, trigger),
            (Abs::ABS_RZ, trigger),
            (Abs::ABS_HAT0X, hat),
            (Abs::ABS_HAT0Y, hat),
        ];
        let mut builder = evdev::uinput::VirtualDevice::builder()
            .and_then(|builder| builder.with_keys(&buttons))
            .expect("needs write access to /dev/uinput (run as root)")
            .name("Keystroke Overlay test controller")
            .input_id(InputId::new(BusType::BUS_USB, 0x045e, 0x028e, 0x110));
        for (axis, info) in axes {
            builder = builder.with_absolute_axis(&UinputAbsSetup::new(axis, info)).unwrap();
        }
        let device = builder.build().expect("the virtual controller should be made");
        std::thread::sleep(DEVICE_SETTLE);
        device
    }

    #[test]
    #[cfg(all(feature = "gamepad", target_os = "linux"))]
    #[ignore = "needs /dev/uinput and udev"]
    fn captures_a_virtual_controller() {
        use evdev::{AbsoluteAxisCode, EventType, InputEvent, KeyCode};
        const TRIGGER_AT_80_PERCENT: i32 = 204;
        let mut device = virtual_controller();
        let (tx, rx) = std::sync::mpsc::channel();
        let handle = start(tx).expect("gilrs should start");
        let a_button = KeyCode::BTN_SOUTH.0;
        let right_trigger = AbsoluteAxisCode::ABS_RZ.0;
        for (kind, code, value) in [
            (EventType::KEY, a_button, 1),
            (EventType::KEY, a_button, 0),
            (EventType::ABSOLUTE, right_trigger, TRIGGER_AT_80_PERCENT),
            (EventType::ABSOLUTE, right_trigger, 0),
        ] {
            device.emit(&[InputEvent::new(kind.0, code, value)]).unwrap();
        }
        let wait = Duration::from_secs(2);
        for expected in [(true, "PadA"), (false, "PadA"), (true, "PadRT"), (false, "PadRT")] {
            let event = rx.recv_timeout(wait).expect("every press and release should arrive");
            assert_eq!((event.down, event.code), expected);
        }
        handle.stop();
    }
}
