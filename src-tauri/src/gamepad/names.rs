//! The names of controller buttons, as the overlay knows them: the table in docs/design/future-inputs.md §2 (`PadA`,
//! `PadLB`, …). A layout key whose `code` is one of these lights up when that button is held, like a keyboard key.
//!
//! Buttons are named by their place on an Xbox-style controller (A is the bottom face button, whatever the controller
//! prints on it), which is also how the controller library names them. `PadButton` is our own copy of that list, so this
//! table needs no library: it is built and tested in every build, also without the `gamepad` cargo feature.
//! gamepad/mod.rs turns the library's buttons into these.
//!
//! Sticks and triggers as moving values (`PadStickL`, the `a` message) are not here yet: the spike sends buttons only
//! (docs/for-claude/proposals/controllers-gilrs.md, work order step 3).

/// One controller button, by its place on an Xbox-style controller.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PadButton {
    /// The bottom face button (A on Xbox, Cross on PlayStation).
    South,
    /// The right face button (B on Xbox, Circle on PlayStation).
    East,
    /// The left face button (X on Xbox, Square on PlayStation).
    West,
    /// The top face button (Y on Xbox, Triangle on PlayStation).
    North,
    LeftBumper,
    RightBumper,
    /// The analog triggers, as buttons: pressed past half way (future-inputs.md §3).
    LeftTrigger,
    RightTrigger,
    /// View / Select / Share.
    Back,
    /// Menu / Start / Options.
    Start,
    /// The Xbox / PlayStation / Home button.
    Home,
    /// Pressing a stick in.
    LeftStick,
    RightStick,
    Up,
    Down,
    Left,
    Right,
    /// Any other button (extra buttons some controllers have). Not shown.
    Other,
}

/// The name the overlay gets for a button, or None for a button it doesn't show.
pub fn button_name(button: PadButton) -> Option<&'static str> {
    let name = match button {
        PadButton::South => "PadA",
        PadButton::East => "PadB",
        PadButton::West => "PadX",
        PadButton::North => "PadY",
        PadButton::LeftBumper => "PadLB",
        PadButton::RightBumper => "PadRB",
        PadButton::LeftTrigger => "PadLT",
        PadButton::RightTrigger => "PadRT",
        PadButton::Back => "PadBack",
        PadButton::Start => "PadStart",
        PadButton::Home => "PadHome",
        PadButton::LeftStick => "PadLS",
        PadButton::RightStick => "PadRS",
        PadButton::Up => "PadUp",
        PadButton::Down => "PadDown",
        PadButton::Left => "PadLeft",
        PadButton::Right => "PadRight",
        PadButton::Other => return None,
    };
    Some(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every button that has a name.
    const NAMED: [PadButton; 17] = [
        PadButton::South,
        PadButton::East,
        PadButton::West,
        PadButton::North,
        PadButton::LeftBumper,
        PadButton::RightBumper,
        PadButton::LeftTrigger,
        PadButton::RightTrigger,
        PadButton::Back,
        PadButton::Start,
        PadButton::Home,
        PadButton::LeftStick,
        PadButton::RightStick,
        PadButton::Up,
        PadButton::Down,
        PadButton::Left,
        PadButton::Right,
    ];

    /// The design page every input follows. Its "Controller buttons" row is the list of names.
    const FUTURE_INPUTS: &str = include_str!("../../../docs/design/future-inputs.md");

    /// The names in the design page's "Controller buttons" row, in its order.
    fn names_in_the_design() -> Vec<&'static str> {
        let row = FUTURE_INPUTS
            .lines()
            .find(|line| line.starts_with("| Controller buttons |"))
            .expect("future-inputs.md has a Controller buttons row");
        row.split('`').filter(|part| part.starts_with("Pad")).collect()
    }

    #[test]
    fn the_names_are_exactly_the_ones_in_the_design() {
        let mut ours: Vec<&str> = NAMED.iter().filter_map(|button| button_name(*button)).collect();
        let mut designed = names_in_the_design();
        ours.sort_unstable();
        designed.sort_unstable();
        assert_eq!(ours, designed);
    }

    #[test]
    fn each_button_has_its_own_name() {
        let mut names: Vec<&str> = NAMED.iter().filter_map(|button| button_name(*button)).collect();
        assert_eq!(names.len(), NAMED.len(), "every named button has a name");
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), NAMED.len(), "no two buttons share a name");
    }

    #[test]
    fn the_face_buttons_are_named_by_place_like_an_xbox_controller() {
        assert_eq!(button_name(PadButton::South), Some("PadA"));
        assert_eq!(button_name(PadButton::East), Some("PadB"));
        assert_eq!(button_name(PadButton::West), Some("PadX"));
        assert_eq!(button_name(PadButton::North), Some("PadY"));
    }

    #[test]
    fn other_buttons_are_not_shown() {
        assert_eq!(button_name(PadButton::Other), None);
    }

    /// Keyboard names are DOM KeyboardEvent.code names, and none of them starts with "Pad" (future-inputs.md §2), so a
    /// layout can mix both kinds. Checked against the Windows key table, the one with the most keys.
    #[test]
    fn no_name_can_be_mistaken_for_a_keyboard_key() {
        for button in NAMED {
            assert!(button_name(button).unwrap().starts_with("Pad"));
        }
        for virtual_key in 0..=u8::MAX {
            for scan_code in 0..=u8::MAX {
                for extended in [false, true] {
                    let key = crate::keyboard::keymap::code_name(virtual_key.into(), scan_code.into(), extended);
                    assert!(!key.is_some_and(|name| name.starts_with("Pad")), "{key:?}");
                }
            }
        }
    }
}
