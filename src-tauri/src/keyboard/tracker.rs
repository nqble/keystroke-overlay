//! Key state tracking shared by every capture method: filters OS key-repeat, drops spurious events, and
//! (optionally) releases keys that Windows says are no longer held, so the overlay can never get stuck.

use super::keymap::code_name;
use super::KeyEvent;
use std::sync::mpsc::Sender;

pub struct KeyTracker {
    /// indexed by scancode | extended<<8  ->  (virtual key, name) of the key that is currently down
    down: [Option<(u32, &'static str)>; 512],
    /// just the indexes that are down, so the stuck-key check costs O(keys held) per event
    held: Vec<usize>,
    /// check the real key state of held keys on every event (off in unit tests, which have no real keyboard)
    heal: bool,
}

impl KeyTracker {
    pub fn new(heal: bool) -> Self {
        Self {
            down: [None; 512],
            held: Vec::with_capacity(8),
            heal,
        }
    }

    /// Process one raw key event. Emits zero, one or two `KeyEvent`s on `tx`.
    pub fn handle(&mut self, virtual_key: u32, scancode: u32, extended: bool, down: bool, tx: &Sender<KeyEvent>) {
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

        if self.heal {
            self.release_keys_that_are_really_up(idx, tx);
        }

        if down && self.down[idx].is_some() {
            return;
        } // OS key-repeat: ignore
        if !down && self.down[idx].is_none() {
            // Windows only reports the release of PrintScreen: show it as a tap.
            if name == "PrintScreen" {
                let _ = tx.send(KeyEvent { down: true, code: name });
                let _ = tx.send(KeyEvent {
                    down: false,
                    code: name,
                });
            }
            return; // other spurious releases
        }
        if down {
            self.down[idx] = Some((virtual_key, name));
            self.held.push(idx);
        } else {
            self.down[idx] = None;
            if let Some(held_position) = self.held.iter().position(|&x| x == idx) {
                self.held.swap_remove(held_position);
            }
        }
        let _ = tx.send(KeyEvent { down, code: name });
    }

    /// A key released while the PC was locked (Win+L, Ctrl+Alt+Del) never sends a key-up. If Windows says a
    /// key we think is held is up, release it now.
    #[cfg(windows)]
    fn release_keys_that_are_really_up(&mut self, current: usize, tx: &Sender<KeyEvent>) {
        use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
        let mut i = 0;
        while i < self.held.len() {
            let held_index = self.held[i];
            if held_index != current {
                if let Some((virtual_key, name)) = self.down[held_index] {
                    if (unsafe { GetAsyncKeyState(virtual_key as i32) } as u16) & 0x8000 == 0 {
                        self.down[held_index] = None;
                        self.held.swap_remove(i);
                        let _ = tx.send(KeyEvent {
                            down: false,
                            code: name,
                        });
                        continue;
                    }
                }
            }
            i += 1;
        }
    }
    #[cfg(not(windows))]
    fn release_keys_that_are_really_up(&mut self, _current: usize, _tx: &Sender<KeyEvent>) {}
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::channel;

    fn run(events: &[(u32, u32, bool, bool)]) -> Vec<(bool, &'static str)> {
        let (tx, rx) = channel();
        let mut tracker = KeyTracker::new(false);
        for &(vk, sc, ext, down) in events {
            tracker.handle(vk, sc, ext, down, &tx);
        }
        drop(tx);
        rx.iter().map(|e| (e.down, e.code)).collect()
    }
    const W: (u32, u32, bool) = (0x57, 0x11, false);

    #[test]
    fn press_and_release() {
        assert_eq!(
            run(&[(W.0, W.1, W.2, true), (W.0, W.1, W.2, false)]),
            vec![(true, "KeyW"), (false, "KeyW")]
        );
    }
    #[test]
    fn os_key_repeat_is_ignored() {
        let out = run(&[
            (W.0, W.1, W.2, true),
            (W.0, W.1, W.2, true),
            (W.0, W.1, W.2, true),
            (W.0, W.1, W.2, false),
        ]);
        assert_eq!(out, vec![(true, "KeyW"), (false, "KeyW")]);
    }
    #[test]
    fn spurious_release_is_ignored() {
        assert!(run(&[(W.0, W.1, W.2, false)]).is_empty());
    }
    #[test]
    fn fake_shift_around_extended_keys_is_ignored() {
        assert!(run(&[(0xA0, 0x2A, true, true), (0xA0, 0x2A, true, false)]).is_empty());
    }
    #[test]
    fn printscreen_release_only_shows_as_a_tap() {
        assert_eq!(
            run(&[(0x2C, 0x37, true, false)]),
            vec![(true, "PrintScreen"), (false, "PrintScreen")]
        );
    }
    #[test]
    fn extended_and_plain_keys_do_not_collide() {
        // numpad Enter (extended 0x1C) and main Enter (0x1C) are different keys held at once
        let out = run(&[
            (0x0D, 0x1C, false, true),
            (0x0D, 0x1C, true, true),
            (0x0D, 0x1C, false, false),
            (0x0D, 0x1C, true, false),
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
        let out = run(&[
            (0xA2, 0x1D, false, true),
            (0x13, 0x1D, false, true),
            (0x13, 0x1D, false, false),
            (0xA2, 0x1D, false, false),
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
}
