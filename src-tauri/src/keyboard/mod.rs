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
//! Privacy: events live only in memory and are forwarded to localhost WebSocket clients. Nothing is written to disk.

mod hook;
pub mod keymap;
mod rawinput;
mod tracker;

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
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
            Self::Hook => "Standard (keyboard hook)",
            Self::RawInput => "Compatibility (Raw Input)",
        }
    }
}

enum Source {
    Hook(hook::Handle),
    RawInput(rawinput::Handle),
}
impl Source {
    fn start(method: Method, tx: Sender<KeyEvent>) -> Result<Self, String> {
        match method {
            Method::Hook => hook::start(tx).map(Source::Hook),
            Method::RawInput => rawinput::start(tx).map(Source::RawInput),
        }
    }
    fn stop(self) {
        match self {
            Source::Hook(handle) => handle.stop(),
            Source::RawInput(handle) => handle.stop(),
        }
    }
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
    ev_tx: Sender<KeyEvent>,
    capture: Mutex<Capture>,
}

impl Bus {
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
        ev_tx,
        capture: Mutex::new(Capture { method, source, error }),
    });

    let dispatch_bus = bus.clone();
    std::thread::Builder::new()
        .name("key-dispatch".into())
        .spawn(move || {
            while let Ok(ev) = rx.recv() {
                if dispatch_bus.paused.load(Ordering::Relaxed) {
                    continue;
                } // paused: forward nothing
                {
                    let mut held = dispatch_bus.held.lock().unwrap();
                    if ev.down {
                        held.insert(ev.code);
                    } else {
                        held.remove(ev.code);
                    }
                }
                let _ = dispatch_bus.tx.send(ev); // Err = no listeners; fine.
            }
        })
        .unwrap();
    bus
}
