//! The controller buttons held right now, so that none stays lit when its controller goes away or capture stops
//! (gamepad/mod.rs sends what these functions return). Plain logic with no library behind it, so it is built and tested
//! in every build, also without the `gamepad` cargo feature.

use super::names::{button_name, PadButton};
use crate::keyboard::KeyEvent;

/// The buttons held right now on the controller that is shown, so that none stays lit when that controller goes away
/// or capture stops.
#[derive(Default)]
pub struct HeldButtons {
    /// The gilrs id of the controller the held buttons are on.
    pad: Option<usize>,
    names: Vec<&'static str>,
}

impl HeldButtons {
    /// A press on the shown controller. Nothing for a button without a name or one already held.
    pub fn press(&mut self, pad: usize, button: PadButton) -> Vec<KeyEvent> {
        let Some(code) = button_name(button) else {
            return Vec::new();
        };
        let mut events = Vec::new();
        if self.pad != Some(pad) {
            events = self.release_all(); // the shown controller changed
            self.pad = Some(pad);
        }
        if !self.names.contains(&code) {
            self.names.push(code);
            events.push(KeyEvent { down: true, code });
        }
        events
    }

    /// A release on any controller: only a button held on the shown one is released.
    pub fn release(&mut self, pad: usize, button: PadButton) -> Vec<KeyEvent> {
        let Some(code) = button_name(button) else {
            return Vec::new();
        };
        if self.pad != Some(pad) || !self.names.contains(&code) {
            return Vec::new();
        }
        self.names.retain(|held| *held != code);
        vec![KeyEvent { down: false, code }]
    }

    /// A controller went away: if it is the one with held buttons, release them.
    pub fn disconnected(&mut self, pad: usize) -> Vec<KeyEvent> {
        if self.pad != Some(pad) {
            return Vec::new();
        }
        self.release_all()
    }

    pub fn release_all(&mut self) -> Vec<KeyEvent> {
        self.pad = None;
        let released = self.names.drain(..);
        released.map(|code| KeyEvent { down: false, code }).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seen(events: &[KeyEvent]) -> Vec<(bool, &'static str)> {
        events.iter().map(|event| (event.down, event.code)).collect()
    }

    #[test]
    fn a_press_and_release_make_one_key_down_and_up() {
        let mut held = HeldButtons::default();
        assert_eq!(seen(&held.press(0, PadButton::South)), [(true, "PadA")]);
        assert!(held.press(0, PadButton::South).is_empty(), "already held");
        assert_eq!(seen(&held.release(0, PadButton::South)), [(false, "PadA")]);
        assert!(held.release(0, PadButton::South).is_empty(), "already released");
    }

    #[test]
    fn buttons_without_a_name_send_nothing() {
        let mut held = HeldButtons::default();
        assert!(held.press(0, PadButton::Other).is_empty());
        assert!(held.release(0, PadButton::Other).is_empty());
    }

    #[test]
    fn unplugging_the_controller_releases_its_buttons() {
        let mut held = HeldButtons::default();
        held.press(0, PadButton::South);
        held.press(0, PadButton::LeftBumper);
        assert!(held.disconnected(1).is_empty(), "another controller");
        assert_eq!(seen(&held.disconnected(0)), [(false, "PadA"), (false, "PadLB")]);
        assert!(held.release_all().is_empty());
    }

    #[test]
    fn a_new_shown_controller_releases_the_old_ones_buttons() {
        let mut held = HeldButtons::default();
        held.press(0, PadButton::South);
        assert_eq!(seen(&held.press(1, PadButton::East)), [(false, "PadA"), (true, "PadB")]);
        assert!(held.release(0, PadButton::South).is_empty(), "already released");
    }

    #[test]
    fn stopping_releases_every_held_button() {
        let mut held = HeldButtons::default();
        held.press(0, PadButton::Up);
        assert_eq!(seen(&held.release_all()), [(false, "PadUp")]);
    }
}
