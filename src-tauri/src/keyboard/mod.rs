//! Keyboard capture. Two interchangeable methods feed the same pipeline:
//!
//!   * `hook`     – Windows low-level keyboard hook (WH_KEYBOARD_LL). The default; works with nearly every game.
//!   * `rawinput` – Windows Raw Input. Reads keys straight from the keyboard instead of hooking into key delivery;
//!     some games / anti-cheat tools block hooks but not this.
//!
//! Both feed `KeyTracker` (repeat filtering, stuck-key protection) → one channel → the dispatcher thread
//! (tracks held keys, drops everything while paused) → broadcast to WebSocket clients.
//! The method can be switched while the app runs (`Bus::set_method`).
//!
//! Both methods are Windows only. On Linux, the Standard method uses X11 instead (`x11`, docs/LINUX-PORT.md), and on
//! macOS it uses a listen-only event tap (`macos`, docs/MAC-PORT.md). On other systems the app builds and runs without
//! keyboard capture: starting a method fails with a clear message, shown in the settings window like any other
//! start-up problem (docs/CROSS-PLATFORM.md). A port adds its own method here (docs/MAC-PORT.md).
//!
//! Privacy: events live only in memory and are forwarded to localhost WebSocket clients. Nothing is written to disk.

#[cfg(windows)]
mod hook;
// keymap, tracker, linux_keys and macos_keys are plain logic used by the capture methods. They are built on every
// system so their unit tests run everywhere; on other systems nothing calls them.
#[cfg_attr(not(windows), allow(dead_code))]
pub mod keymap;
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
mod linux_keys;
#[cfg(target_os = "macos")]
mod macos;
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
mod macos_keys;
#[cfg(windows)]
mod rawinput;
#[cfg_attr(not(windows), allow(dead_code))]
mod tracker;
#[cfg(target_os = "linux")]
mod x11;

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;

#[derive(Clone, Copy)]
pub struct KeyEvent {
    pub down: bool,
    pub code: &'static str,
}

/// How keys are read. Stored in settings as `general.inputMethod`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Method {
    Hook,
    RawInput,
}
impl Method {
    pub fn parse(text: &str) -> Option<Self> {
        match text {
            "hook" => Some(Self::Hook),
            "rawinput" => Some(Self::RawInput),
            _ => None,
        }
    }
    pub fn id(self) -> &'static str {
        match self {
            Self::Hook => "hook",
            Self::RawInput => "rawinput",
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Self::Hook if cfg!(target_os = "linux") => "Standard (X11)",
            Self::Hook if cfg!(target_os = "macos") => "Standard (event tap)",
            Self::Hook => "Standard (keyboard hook)",
            Self::RawInput => "Compatibility (Raw Input)",
        }
    }
}

/// Shown when the app runs on a system that has no keyboard capture method yet.
#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
const UNSUPPORTED: &str = "keyboard capture isn't available on this system yet";

/// Shown when Compatibility is chosen on Linux, which only has the Standard method so far.
#[cfg(target_os = "linux")]
const LINUX_STANDARD_ONLY: &str = "only the Standard method is available on Linux so far";

/// Shown when Compatibility is chosen on macOS, which only has the Standard method so far.
#[cfg(target_os = "macos")]
const MACOS_STANDARD_ONLY: &str = "only the Standard method is available on macOS so far";

enum Source {
    #[cfg(windows)]
    Hook(hook::Handle),
    #[cfg(windows)]
    RawInput(rawinput::Handle),
    #[cfg(target_os = "linux")]
    X11(x11::Handle),
    #[cfg(target_os = "macos")]
    Macos(macos::Handle),
}
impl Source {
    #[cfg(windows)]
    fn start(method: Method, tx: Sender<KeyEvent>) -> Result<Self, String> {
        match method {
            Method::Hook => hook::start(tx).map(Source::Hook),
            Method::RawInput => rawinput::start(tx).map(Source::RawInput),
        }
    }
    #[cfg(target_os = "linux")]
    fn start(method: Method, tx: Sender<KeyEvent>) -> Result<Self, String> {
        match method {
            Method::Hook => x11::start(tx).map(Source::X11),
            Method::RawInput => Err(LINUX_STANDARD_ONLY.to_string()),
        }
    }
    #[cfg(target_os = "macos")]
    fn start(method: Method, tx: Sender<KeyEvent>) -> Result<Self, String> {
        match method {
            Method::Hook => macos::start(tx).map(Source::Macos),
            Method::RawInput => Err(MACOS_STANDARD_ONLY.to_string()),
        }
    }
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    fn start(_method: Method, _tx: Sender<KeyEvent>) -> Result<Self, String> {
        Err(UNSUPPORTED.to_string())
    }
    /// Only the Windows hook can be dropped by the system, so only it is watched.
    fn set_watch(&self, on: bool) {
        #[cfg(windows)]
        if let Source::Hook(handle) = self {
            handle.set_watch(on);
        }
        let _ = on;
    }
    fn stop(self) {
        match self {
            #[cfg(windows)]
            Source::Hook(handle) => handle.stop(),
            #[cfg(windows)]
            Source::RawInput(handle) => handle.stop(),
            #[cfg(target_os = "linux")]
            Source::X11(handle) => handle.stop(),
            #[cfg(target_os = "macos")]
            Source::Macos(handle) => handle.stop(),
        }
    }
}

// ---- The hook watch (docs/DEBUGGING.md). Windows can remove a keyboard hook without telling the app, for example when
// the PC is overloaded. While at least one overlay page is connected, the hook thread checks every 30 s whether the PC
// is in use but the hook has heard nothing for over a minute, and then installs it again. With no overlay connected
// nothing runs (CLAUDE.md: no timers at idle).

/// How often the hook thread checks, while an overlay is connected.
#[cfg_attr(not(windows), allow(dead_code))] // used by the Windows hook (hook.rs) and the tests
pub(crate) const WATCH_INTERVAL_MS: u32 = 30_000;
/// The hook counts as dropped when the PC had input this much later than the hook's last key.
#[cfg_attr(not(windows), allow(dead_code))] // used by the Windows hook (hook.rs) and the tests
pub(crate) const SILENT_LIMIT_MS: u32 = 60_000;

/// Has Windows probably dropped the hook? All three are Windows tick counts in milliseconds (they wrap after 49 days,
/// hence wrapping_sub): `now`, the PC's last input from anyone (mouse included), and the hook's last key. Only when the
/// PC was used during the last check interval, yet long after the hook last heard a key. A wrong guess only costs a
/// harmless re-install (a quiet player moving only the mouse for a minute).
#[cfg_attr(not(windows), allow(dead_code))] // used by the Windows hook (hook.rs) and the tests
pub(crate) fn hook_looks_dropped(now: u32, last_input: u32, last_key: u32) -> bool {
    let in_use = now.wrapping_sub(last_input) <= WATCH_INTERVAL_MS;
    let silent =
        last_input.wrapping_sub(last_key) > SILENT_LIMIT_MS && last_input.wrapping_sub(last_key) < u32::MAX / 2;
    in_use && silent
}

/// Held by each connected overlay page (server.rs); the first one turns the hook watch on, the last one off.
pub struct WatchGuard<'a> {
    bus: &'a Bus,
}
impl Drop for WatchGuard<'_> {
    fn drop(&mut self) {
        if self.bus.watchers.fetch_sub(1, Ordering::Relaxed) == 1 {
            self.bus.set_watch(false);
        }
    }
}

/// What the operating system lets the app do with the keyboard. Only macOS asks the person first (Input Monitoring) and
/// can switch capture off while a password is typed (Secure Input); everywhere else both are fine.
pub struct Access {
    pub allowed: bool,
    pub secure_input: bool,
}

#[cfg(target_os = "macos")]
pub fn access() -> Access {
    Access {
        allowed: macos::input_monitoring_allowed(),
        secure_input: macos::secure_input_on(),
    }
}
#[cfg(not(target_os = "macos"))]
pub fn access() -> Access {
    Access {
        allowed: true,
        secure_input: false,
    }
}

/// Ask for keyboard access and open the page where it is granted (macOS only; nothing to do elsewhere).
pub fn request_access() {
    #[cfg(target_os = "macos")]
    macos::request_input_monitoring();
}

struct Capture {
    method: Method,
    source: Option<Source>,
    error: Option<String>,
}

/// Shared with the server: live broadcast + the set of currently held keys.
pub struct Bus {
    pub tx: broadcast::Sender<KeyEvent>,
    pub held: Mutex<HashSet<&'static str>>,
    /// When true, key events are dropped (tray "Pause overlay"). Capture keeps running.
    pub paused: AtomicBool,
    /// Has any key event ever arrived? Only a fact (never which key), so the window can tell "capture works" from "macOS
    /// let the tap start but sends it nothing", which is what a missing Input Monitoring permission can look like.
    keys_seen: AtomicBool,
    ev_tx: Sender<KeyEvent>,
    capture: Mutex<Capture>,
    /// How many overlay pages are connected (the hook watch runs while this is above 0).
    watchers: AtomicUsize,
}

impl Bus {
    /// Pass one key event on to the overlays, or drop it while paused. The pause check, the held-keys update and the
    /// send all happen under the `held` lock, and `set_paused` takes the same lock, so an event that arrives just as
    /// Pause is pressed can never slip through or leave a stuck key behind.
    fn forward(&self, event: KeyEvent) {
        self.keys_seen.store(true, Ordering::Relaxed);
        let mut held = self.held.lock().unwrap();
        if self.paused.load(Ordering::Relaxed) {
            return;
        }
        if event.down {
            held.insert(event.code);
        } else {
            held.remove(event.code);
        }
        let _ = self.tx.send(event); // Err = no listeners; fine.
    }

    /// Has any key event arrived since the app started? See `keys_seen`.
    pub fn has_seen_keys(&self) -> bool {
        self.keys_seen.load(Ordering::Relaxed)
    }

    /// Pause or resume (tray "Pause overlay" and the pause button). Pausing forgets every held key.
    pub fn set_paused(&self, paused: bool) {
        let mut held = self.held.lock().unwrap();
        self.paused.store(paused, Ordering::Relaxed);
        if paused {
            held.clear();
        }
    }

    /// An overlay page connected: keep the returned guard for as long as it stays connected.
    pub fn watch_guard(&self) -> WatchGuard<'_> {
        if self.watchers.fetch_add(1, Ordering::Relaxed) == 0 {
            self.set_watch(true);
        }
        WatchGuard { bus: self }
    }

    fn set_watch(&self, on: bool) {
        if let Some(source) = &self.capture.lock().unwrap().source {
            source.set_watch(on);
        }
    }

    pub fn method(&self) -> Method {
        self.capture.lock().unwrap().method
    }

    /// The last problem starting the selected capture method, if any (shown in the settings window).
    pub fn error(&self) -> Option<String> {
        self.capture.lock().unwrap().error.clone()
    }

    /// Switch capture method while running. If the new method can't start, the old one is restored and an error
    /// returned.
    pub fn set_method(&self, new: Method) -> Result<(), String> {
        let mut capture = self.capture.lock().unwrap();
        if capture.method == new && capture.source.is_some() {
            return Ok(());
        }
        let old_method = capture.method;
        if let Some(old_source) = capture.source.take() {
            old_source.stop();
        }
        // Keys held through the switch would never get a release from the old source: release them now.
        let held: Vec<&'static str> = self.held.lock().unwrap().iter().copied().collect();
        for code in held {
            let _ = self.ev_tx.send(KeyEvent { down: false, code });
        }
        match Source::start(new, self.ev_tx.clone()) {
            Ok(source) => {
                source.set_watch(self.watchers.load(Ordering::Relaxed) > 0); // a new hook keeps watching
                capture.method = new;
                capture.source = Some(source);
                capture.error = None;
                Ok(())
            }
            Err(e) => {
                let msg = format!("{} couldn't start: {e}", new.label());
                capture.source = Source::start(old_method, self.ev_tx.clone()).ok(); // keep the overlay working
                capture.method = old_method;
                capture.error = if capture.source.is_none() {
                    Some(msg.clone())
                } else {
                    None
                };
                Err(msg)
            }
        }
    }
}

/// Start the dispatcher and the chosen capture method.
pub fn start(method: Method) -> Arc<Bus> {
    let (btx, _) = broadcast::channel(256);
    let (ev_tx, rx) = channel::<KeyEvent>();
    let (source, error) = match Source::start(method, ev_tx.clone()) {
        Ok(s) => (Some(s), None),
        Err(e) => (None, Some(format!("{} couldn't start: {e}", method.label()))),
    };
    let bus = Arc::new(Bus {
        tx: btx,
        held: Mutex::new(HashSet::new()),
        paused: AtomicBool::new(false),
        keys_seen: AtomicBool::new(false),
        ev_tx,
        capture: Mutex::new(Capture { method, source, error }),
        watchers: AtomicUsize::new(0),
    });

    let dispatch_bus = bus.clone();
    std::thread::Builder::new()
        .name("key-dispatch".into())
        .spawn(move || {
            while let Ok(event) = rx.recv() {
                dispatch_bus.forward(event);
            }
        })
        .unwrap();
    bus
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_bus() -> Bus {
        let (ev_tx, _) = channel::<KeyEvent>();
        Bus {
            tx: broadcast::channel(256).0,
            held: Mutex::new(HashSet::new()),
            paused: AtomicBool::new(false),
            keys_seen: AtomicBool::new(false),
            ev_tx,
            capture: Mutex::new(Capture {
                method: Method::Hook,
                source: None,
                error: None,
            }),
            watchers: AtomicUsize::new(0),
        }
    }

    #[test]
    fn the_hook_counts_as_dropped_only_when_the_pc_is_in_use_and_the_hook_long_silent() {
        let minute = SILENT_LIMIT_MS;
        assert!(
            hook_looks_dropped(500_000, 499_000, 499_000 - minute - 1),
            "in use, silent over a minute"
        );
        assert!(
            !hook_looks_dropped(500_000, 499_000, 499_000 - minute + 1),
            "a key less than a minute before"
        );
        assert!(
            !hook_looks_dropped(500_000, 400_000, 100),
            "the PC itself is idle: nothing to compare"
        );
        assert!(
            !hook_looks_dropped(500_000, 499_000, 499_500),
            "a key after the last input"
        );
        // the tick counter wraps after 49 days
        assert!(hook_looks_dropped(5_000, 4_000, u32::MAX - minute), "across the wrap");
    }

    #[test]
    fn the_watch_follows_the_connected_pages() {
        let bus = test_bus();
        let first = bus.watch_guard();
        let second = bus.watch_guard();
        assert_eq!(bus.watchers.load(Ordering::Relaxed), 2);
        drop(first);
        drop(second);
        assert_eq!(
            bus.watchers.load(Ordering::Relaxed),
            0,
            "the last page leaving turns it off"
        );
    }

    #[test]
    fn the_bus_remembers_that_a_key_arrived() {
        let bus = test_bus();
        assert!(!bus.has_seen_keys());
        bus.forward(KeyEvent {
            down: true,
            code: "KeyW",
        });
        assert!(bus.has_seen_keys());
    }

    #[test]
    fn nothing_gets_through_while_paused() {
        let bus = test_bus();
        let mut overlay = bus.tx.subscribe();
        bus.set_paused(true);
        bus.forward(KeyEvent {
            down: true,
            code: "KeyW",
        });
        assert!(overlay.try_recv().is_err());
        assert!(bus.held.lock().unwrap().is_empty());
    }

    /// The outside review's race: a key event in flight while Pause is pressed used to be able to land in `held` after
    /// pausing cleared it, so the overlay showed a stuck key after resuming. Pause while another thread forwards keys,
    /// many times over; after the forwarding thread stops, nothing may be held.
    #[test]
    fn pausing_while_keys_arrive_never_leaves_a_stuck_key() {
        const ROUNDS: usize = 2000;
        let bus = Arc::new(test_bus());
        for _ in 0..ROUNDS {
            bus.set_paused(false);
            let typing = {
                let bus = bus.clone();
                std::thread::spawn(move || {
                    for _ in 0..50 {
                        bus.forward(KeyEvent {
                            down: true,
                            code: "KeyA",
                        });
                    }
                })
            };
            bus.set_paused(true);
            typing.join().unwrap();
            assert!(bus.held.lock().unwrap().is_empty(), "a key stayed held after pausing");
        }
    }
}
