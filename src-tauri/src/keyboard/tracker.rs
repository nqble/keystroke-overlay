//! Key state tracking shared by every Windows capture method: filters OS key-repeat, drops spurious events, counts which
//! keyboards hold each key (two keyboards can hold the same key at once), and (optionally) releases keys that Windows
//! says are no longer held, so the overlay can never get stuck.

use super::keymap::code_name;
use super::KeyEvent;
use std::sync::mpsc::Sender;

/// Which keyboard an event came from, as far as the capture method knows: the Raw Input device handle, or 0 where there
/// is no way to tell (the keyboard hook).
pub type DeviceId = u64;

/// How often, while a key is shown as down, the capture thread asks Windows whether it really is (milliseconds). The
/// timer runs only while a key is held, so an idle app still does nothing.
pub const RECONCILE_MS: u32 = 250;

/// Asks Windows whether a virtual key is down right now.
type KeyIsDown = Box<dyn Fn(u32) -> bool>;

/// One key that is down: which virtual key it is, its name, and the keyboards holding it (nearly always one).
#[derive(Clone)]
struct Held {
    virtual_key: u32,
    name: &'static str,
    devices: Vec<DeviceId>,
}

pub struct KeyTracker {
    /// indexed by scancode | extended<<8  ->  the key that is currently down there
    down: Vec<Option<Held>>,
    /// just the indexes that are down, so the stuck-key check costs O(keys held) per event
    held: Vec<usize>,
    /// asks Windows for the real key state of held keys on every event (None in unit tests, which have no real keyboard)
    key_is_down: Option<KeyIsDown>,
}

/// The real thing: Windows' own idea of whether a key is down. Not used on other systems (nothing to ask).
#[cfg(windows)]
fn windows_key_is_down() -> Option<KeyIsDown> {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    Some(Box::new(|virtual_key| {
        (unsafe { GetAsyncKeyState(virtual_key as i32) } as u16) & 0x8000 != 0
    }))
}
#[cfg(not(windows))]
fn windows_key_is_down() -> Option<KeyIsDown> {
    None
}

impl KeyTracker {
    /// `heal`: check the real key state of held keys (on Windows), so a key whose release was missed cannot stay lit.
    pub fn new(heal: bool) -> Self {
        Self::with_key_state(if heal { windows_key_is_down() } else { None })
    }

    fn with_key_state(key_is_down: Option<KeyIsDown>) -> Self {
        Self {
            down: vec![None; 512],
            held: Vec::with_capacity(8),
            key_is_down,
        }
    }

    /// Is any key shown as down? The capture methods run a short timer (`reconcile`) only while this is true.
    pub fn any_held(&self) -> bool {
        !self.held.is_empty()
    }

    /// Process one raw key event from `device`. Emits zero, one or two `KeyEvent`s on `tx`: a key goes down when the
    /// first keyboard presses it and up when the last keyboard lets go.
    pub fn handle(
        &mut self,
        device: DeviceId,
        virtual_key: u32,
        scancode: u32,
        extended: bool,
        down: bool,
        tx: &Sender<KeyEvent>,
    ) {
        // Fake shift scancodes Windows injects around extended keys: ignore.
        if extended && (scancode == 0x2A || scancode == 0x36) {
            return;
        }
        let Some(name) = code_name(virtual_key, scancode, extended) else {
            return;
        };
        // The Pause key sends a multi-part sequence; give it its own slot so it can't collide with other keys.
        let idx = if name == "Pause" {
            0x1FF
        } else {
            (scancode as usize & 0xFF) | if extended { 0x100 } else { 0 }
        };

        self.release_keys_that_are_really_up(Some(idx), tx);

        if down {
            self.press(idx, device, virtual_key, name, tx);
        } else {
            self.release(idx, device, name, tx);
        }
    }

    fn press(&mut self, idx: usize, device: DeviceId, virtual_key: u32, name: &'static str, tx: &Sender<KeyEvent>) {
        if let Some(slot) = &mut self.down[idx] {
            if !slot.devices.contains(&device) {
                slot.devices.push(device); // a second keyboard holding a key that is already shown down
                return;
            }
            // The same keyboard again: OS key-repeat, unless Windows says the key was already up before this press (its
            // release was missed, for example while the PC was locked). Then this is a new press: let go of the stale
            // one first. Windows has not counted the event being handled yet, so its answer is the key's state from
            // before it.
            if self
                .key_is_down
                .as_ref()
                .is_none_or(|key_is_down| key_is_down(virtual_key))
            {
                return;
            }
            self.clear(idx, tx);
        }
        self.down[idx] = Some(Held {
            virtual_key,
            name,
            devices: vec![device],
        });
        self.held.push(idx);
        let _ = tx.send(KeyEvent { down: true, code: name });
    }

    fn release(&mut self, idx: usize, device: DeviceId, name: &'static str, tx: &Sender<KeyEvent>) {
        let Some(slot) = &mut self.down[idx] else {
            // Windows only reports the release of PrintScreen: show it as a tap.
            if name == "PrintScreen" {
                let _ = tx.send(KeyEvent { down: true, code: name });
                let _ = tx.send(KeyEvent {
                    down: false,
                    code: name,
                });
            }
            return; // other spurious releases
        };
        slot.devices.retain(|held_by| *held_by != device);
        // another keyboard still holds it (or this release came from one that never pressed it): nothing changes
        if slot.devices.is_empty() {
            self.clear(idx, tx);
        }
    }

    /// Show a key as up: empty its slot and tell the overlay.
    fn clear(&mut self, idx: usize, tx: &Sender<KeyEvent>) {
        let Some(slot) = self.down[idx].take() else {
            return;
        };
        if let Some(position) = self.held.iter().position(|&held_index| held_index == idx) {
            self.held.swap_remove(position);
        }
        let _ = tx.send(KeyEvent {
            down: false,
            code: slot.name,
        });
    }

    /// A keyboard was unplugged: whatever only it was holding is up now.
    pub fn forget_device(&mut self, device: DeviceId, tx: &Sender<KeyEvent>) {
        for idx in self.held.clone() {
            let Some(slot) = &mut self.down[idx] else {
                continue;
            };
            slot.devices.retain(|held_by| *held_by != device);
            if slot.devices.is_empty() {
                self.clear(idx, tx);
            }
        }
    }

    /// Release every held key that Windows says is up. Called from a short timer while keys are held, so a release that
    /// was missed (the PC locked, the desktop switched, the hook removed) is made up for without waiting for the next
    /// key press.
    pub fn reconcile(&mut self, tx: &Sender<KeyEvent>) {
        self.release_keys_that_are_really_up(None, tx);
    }

    /// A key released while the PC was locked (Win+L, Ctrl+Alt+Del) never sends a key-up. If Windows says a key we think
    /// is held is up, release it now. `current` is the key of the event being handled, left alone: Windows has not
    /// counted that event yet.
    fn release_keys_that_are_really_up(&mut self, current: Option<usize>, tx: &Sender<KeyEvent>) {
        let Some(key_is_down) = &self.key_is_down else {
            return;
        };
        let really_up: Vec<usize> = self
            .held
            .iter()
            .copied()
            .filter(|&held_index| Some(held_index) != current)
            .filter(|&held_index| {
                self.down[held_index]
                    .as_ref()
                    .is_some_and(|slot| !key_is_down(slot.virtual_key))
            })
            .collect();
        for idx in really_up {
            self.clear(idx, tx);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashSet;
    use std::rc::Rc;
    use std::sync::mpsc::{channel, Receiver};

    const W: (u32, u32, bool) = (0x57, 0x11, false);
    const A: (u32, u32, bool) = (0x41, 0x1E, false);
    const KEYBOARD_1: DeviceId = 1;
    const KEYBOARD_2: DeviceId = 2;

    /// A tracker with no real keyboard behind it, and the channel its events go to.
    fn quiet() -> (KeyTracker, Sender<KeyEvent>, Receiver<KeyEvent>) {
        let (tx, rx) = channel();
        (KeyTracker::with_key_state(None), tx, rx)
    }

    fn run(events: &[(DeviceId, (u32, u32, bool), bool)]) -> Vec<(bool, &'static str)> {
        let (mut tracker, tx, rx) = quiet();
        for &(device, key, down) in events {
            tracker.handle(device, key.0, key.1, key.2, down, &tx);
        }
        drop(tx);
        rx.iter().map(|e| (e.down, e.code)).collect()
    }

    /// A tracker whose "Windows" is a set of virtual keys the test says are down.
    fn with_keyboard_state() -> (KeyTracker, Rc<RefCell<HashSet<u32>>>) {
        let state = Rc::new(RefCell::new(HashSet::new()));
        let asked = state.clone();
        let tracker =
            KeyTracker::with_key_state(Some(Box::new(move |virtual_key| asked.borrow().contains(&virtual_key))));
        (tracker, state)
    }
    fn sent(rx: &Receiver<KeyEvent>) -> Vec<(bool, &'static str)> {
        rx.try_iter().map(|e| (e.down, e.code)).collect()
    }

    #[test]
    fn press_and_release() {
        assert_eq!(
            run(&[(0, W, true), (0, W, false)]),
            vec![(true, "KeyW"), (false, "KeyW")]
        );
    }
    #[test]
    fn os_key_repeat_is_ignored() {
        let out = run(&[(0, W, true), (0, W, true), (0, W, true), (0, W, false)]);
        assert_eq!(out, vec![(true, "KeyW"), (false, "KeyW")]);
    }
    #[test]
    fn spurious_release_is_ignored() {
        assert!(run(&[(0, W, false)]).is_empty());
    }
    #[test]
    fn fake_shift_around_extended_keys_is_ignored() {
        assert!(run(&[(0, (0xA0, 0x2A, true), true), (0, (0xA0, 0x2A, true), false)]).is_empty());
    }
    #[test]
    fn printscreen_release_only_shows_as_a_tap() {
        assert_eq!(
            run(&[(0, (0x2C, 0x37, true), false)]),
            vec![(true, "PrintScreen"), (false, "PrintScreen")]
        );
    }
    #[test]
    fn extended_and_plain_keys_do_not_collide() {
        // numpad Enter (extended 0x1C) and main Enter (0x1C) are different keys held at once
        let enter = (0x0D, 0x1C, false);
        let numpad_enter = (0x0D, 0x1C, true);
        let out = run(&[
            (0, enter, true),
            (0, numpad_enter, true),
            (0, enter, false),
            (0, numpad_enter, false),
        ]);
        assert_eq!(
            out,
            vec![
                (true, "Enter"),
                (true, "NumpadEnter"),
                (false, "Enter"),
                (false, "NumpadEnter")
            ]
        );
    }
    #[test]
    fn pause_has_its_own_slot() {
        // Pause shares scancode 0x1D with Control; holding Ctrl must not swallow Pause
        let control = (0xA2, 0x1D, false);
        let pause = (0x13, 0x1D, false);
        let out = run(&[
            (0, control, true),
            (0, pause, true),
            (0, pause, false),
            (0, control, false),
        ]);
        assert_eq!(
            out,
            vec![
                (true, "ControlLeft"),
                (true, "Pause"),
                (false, "Pause"),
                (false, "ControlLeft")
            ]
        );
    }

    // ---- two keyboards
    #[test]
    fn a_key_held_on_two_keyboards_stays_down_until_the_last_one_lets_go() {
        // A down W, B down W, A up W, B up W: W goes up once, when B lets go (it used to go up when A did)
        let out = run(&[
            (KEYBOARD_1, W, true),
            (KEYBOARD_2, W, true),
            (KEYBOARD_1, W, false),
            (KEYBOARD_2, W, false),
        ]);
        assert_eq!(out, vec![(true, "KeyW"), (false, "KeyW")]);
    }
    #[test]
    fn key_repeat_on_one_keyboard_does_not_count_twice() {
        let out = run(&[
            (KEYBOARD_1, W, true),
            (KEYBOARD_1, W, true),
            (KEYBOARD_2, W, true),
            (KEYBOARD_2, W, false),
            (KEYBOARD_1, W, false),
        ]);
        assert_eq!(out, vec![(true, "KeyW"), (false, "KeyW")]);
    }
    #[test]
    fn a_release_from_a_keyboard_that_did_not_press_it_changes_nothing() {
        let out = run(&[(KEYBOARD_1, W, true), (KEYBOARD_2, W, false), (KEYBOARD_1, W, false)]);
        assert_eq!(out, vec![(true, "KeyW"), (false, "KeyW")]);
    }
    #[test]
    fn unplugging_a_keyboard_lets_go_of_what_only_it_held() {
        let (mut tracker, tx, rx) = quiet();
        tracker.handle(KEYBOARD_1, W.0, W.1, W.2, true, &tx);
        tracker.handle(KEYBOARD_1, A.0, A.1, A.2, true, &tx);
        tracker.handle(KEYBOARD_2, A.0, A.1, A.2, true, &tx);
        sent(&rx);
        tracker.forget_device(KEYBOARD_1, &tx);
        assert_eq!(sent(&rx), vec![(false, "KeyW")]); // A is still held by the other keyboard
        tracker.forget_device(KEYBOARD_2, &tx);
        assert_eq!(sent(&rx), vec![(false, "KeyA")]);
        assert!(!tracker.any_held());
    }

    // ---- a release that was missed
    #[test]
    fn a_missed_release_followed_by_silence_is_made_up_for_by_the_timer() {
        let (mut tracker, state) = with_keyboard_state();
        let (tx, rx) = channel();
        state.borrow_mut().insert(W.0);
        tracker.handle(0, W.0, W.1, W.2, true, &tx);
        assert_eq!(sent(&rx), vec![(true, "KeyW")]);
        tracker.reconcile(&tx);
        assert!(sent(&rx).is_empty(), "W is really still down: nothing to release");
        state.borrow_mut().remove(&W.0); // released while the PC was locked: no key-up ever came
        tracker.reconcile(&tx);
        assert_eq!(sent(&rx), vec![(false, "KeyW")]);
        assert!(!tracker.any_held());
    }
    #[test]
    fn after_a_missed_release_the_same_key_pressed_again_is_a_new_press() {
        let (mut tracker, state) = with_keyboard_state();
        let (tx, rx) = channel();
        state.borrow_mut().insert(W.0);
        tracker.handle(0, W.0, W.1, W.2, true, &tx);
        state.borrow_mut().remove(&W.0); // the release was missed
        tracker.handle(0, W.0, W.1, W.2, true, &tx); // Windows has not counted this press yet: W still reads as up
        assert_eq!(sent(&rx), vec![(true, "KeyW"), (false, "KeyW"), (true, "KeyW")]);
        state.borrow_mut().insert(W.0);
        tracker.handle(0, W.0, W.1, W.2, false, &tx);
        assert_eq!(sent(&rx), vec![(false, "KeyW")]);
    }
    #[test]
    fn a_key_that_is_really_held_still_repeats_quietly() {
        let (mut tracker, state) = with_keyboard_state();
        let (tx, rx) = channel();
        state.borrow_mut().insert(W.0);
        tracker.handle(0, W.0, W.1, W.2, true, &tx);
        tracker.handle(0, W.0, W.1, W.2, true, &tx);
        tracker.handle(0, W.0, W.1, W.2, true, &tx);
        assert_eq!(sent(&rx), vec![(true, "KeyW")]);
    }
    #[test]
    fn after_a_missed_release_a_different_key_lets_go_of_the_stale_one() {
        let (mut tracker, state) = with_keyboard_state();
        let (tx, rx) = channel();
        state.borrow_mut().insert(W.0);
        tracker.handle(0, W.0, W.1, W.2, true, &tx);
        state.borrow_mut().remove(&W.0);
        state.borrow_mut().insert(A.0);
        tracker.handle(0, A.0, A.1, A.2, true, &tx);
        assert_eq!(sent(&rx), vec![(true, "KeyW"), (false, "KeyW"), (true, "KeyA")]);
    }
}
