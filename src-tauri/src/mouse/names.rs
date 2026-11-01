//! Windows Raw Input mouse flags → our names (docs/proposals/mouse-input.md, "Windows: Raw Input").
//!
//! Plain logic with no system calls, so it is tested anywhere. It reads only the button and wheel flags of a Raw Input
//! record, never the movement fields: where the pointer is or how it moves is never looked at (the privacy rule of
//! docs/design/future-inputs.md section 7).

const LEFT_DOWN: u16 = 0x0001;
const LEFT_UP: u16 = 0x0002;
const RIGHT_DOWN: u16 = 0x0004;
const RIGHT_UP: u16 = 0x0008;
const MIDDLE_DOWN: u16 = 0x0010;
const MIDDLE_UP: u16 = 0x0020;
const BUTTON_4_DOWN: u16 = 0x0040;
const BUTTON_4_UP: u16 = 0x0080;
const BUTTON_5_DOWN: u16 = 0x0100;
const BUTTON_5_UP: u16 = 0x0200;
const WHEEL: u16 = 0x0400;
const HWHEEL: u16 = 0x0800;
/// All ten button flags together.
const ANY_BUTTON: u16 = 0x03FF;

/// Every button flag with the name it stands for and whether it is a press. Raw Input reports the physical buttons.
const BUTTONS: [(u16, &str, bool); 10] = [
    (LEFT_DOWN, "MouseLeft", true),
    (LEFT_UP, "MouseLeft", false),
    (RIGHT_DOWN, "MouseRight", true),
    (RIGHT_UP, "MouseRight", false),
    (MIDDLE_DOWN, "MouseMiddle", true),
    (MIDDLE_UP, "MouseMiddle", false),
    (BUTTON_4_DOWN, "MouseBack", true),
    (BUTTON_4_UP, "MouseBack", false),
    (BUTTON_5_DOWN, "MouseForward", true),
    (BUTTON_5_UP, "MouseForward", false),
];

/// The button presses and releases in one record's flags: (name, is a press). One record can hold several.
pub fn button_events(flags: u16) -> impl Iterator<Item = (&'static str, bool)> {
    BUTTONS
        .iter()
        .filter(move |(mask, _, _)| flags & mask != 0)
        .map(|&(_, name, down)| (name, down))
}

/// The wheel direction in one record, if it has a wheel turn: the vertical wheel (positive = away from you) or the
/// horizontal one (positive = right). `data` is the record's button data, read as the signed turn.
pub fn wheel_name(flags: u16, data: u16) -> Option<&'static str> {
    let turn = data as i16;
    if turn == 0 {
        return None;
    }
    if flags & WHEEL != 0 {
        return Some(if turn > 0 { "WheelUp" } else { "WheelDown" });
    }
    if flags & HWHEEL != 0 {
        return Some(if turn > 0 { "WheelRight" } else { "WheelLeft" });
    }
    None
}

/// Does the record say anything we use? A plain move has no button or wheel flag and is dropped at once.
pub fn has_buttons_or_wheel(flags: u16) -> bool {
    flags & (WHEEL | HWHEEL | ANY_BUTTON) != 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn events(flags: u16) -> Vec<(&'static str, bool)> {
        button_events(flags).collect()
    }

    #[test]
    fn each_button_flag_has_its_name_and_direction() {
        assert_eq!(events(LEFT_DOWN), [("MouseLeft", true)]);
        assert_eq!(events(LEFT_UP), [("MouseLeft", false)]);
        assert_eq!(events(RIGHT_DOWN), [("MouseRight", true)]);
        assert_eq!(events(MIDDLE_UP), [("MouseMiddle", false)]);
        assert_eq!(events(BUTTON_4_DOWN), [("MouseBack", true)]);
        assert_eq!(events(BUTTON_5_UP), [("MouseForward", false)]);
    }

    #[test]
    fn one_record_can_hold_several_buttons() {
        assert_eq!(
            events(LEFT_UP | RIGHT_DOWN),
            [("MouseLeft", false), ("MouseRight", true)]
        );
    }

    #[test]
    fn a_plain_move_or_unknown_flag_gives_nothing() {
        assert!(events(0).is_empty());
        assert!(events(0x1000).is_empty());
        assert!(!has_buttons_or_wheel(0));
        assert!(has_buttons_or_wheel(LEFT_DOWN));
        assert!(has_buttons_or_wheel(WHEEL));
    }

    #[test]
    fn the_wheel_follows_the_sign_of_its_turn() {
        assert_eq!(wheel_name(WHEEL, 120), Some("WheelUp"));
        assert_eq!(wheel_name(WHEEL, (-120i16) as u16), Some("WheelDown"));
        assert_eq!(wheel_name(HWHEEL, 120), Some("WheelRight"));
        assert_eq!(wheel_name(HWHEEL, (-120i16) as u16), Some("WheelLeft"));
    }

    #[test]
    fn no_turn_or_no_wheel_flag_is_no_wheel() {
        assert_eq!(wheel_name(WHEEL, 0), None);
        assert_eq!(wheel_name(LEFT_DOWN, 120), None);
    }
}
