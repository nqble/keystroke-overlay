//! Every system's mouse button and wheel codes → our names (docs/proposals/mouse-input.md, "How it works"): Windows
//! Raw Input flags, X11 button numbers, Linux evdev codes and macOS button numbers, one small table each.
//!
//! Plain logic with no system calls, so it is built and tested on every system. It names only buttons and wheel turns,
//! never the movement of the pointer: where it is or how it moves is never looked at (the privacy rule of
//! docs/design/future-inputs.md section 7).

use super::wheel::Axis;

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

/// The wheel turn in one record: which axis and the signed turn (positive = up or right), for the notch counting in
/// `wheel.rs`. `None` when the record has no wheel flag or no turn.
pub fn wheel_turn(flags: u16, data: u16) -> Option<(Axis, i32)> {
    let turn = data as i16 as i32;
    if turn == 0 {
        return None;
    }
    if flags & WHEEL != 0 {
        return Some((Axis::Vertical, turn));
    }
    if flags & HWHEEL != 0 {
        return Some((Axis::Horizontal, turn));
    }
    None
}

/// Does the record say anything we use? A plain move has no button or wheel flag and is dropped at once.
pub fn has_buttons_or_wheel(flags: u16) -> bool {
    flags & (WHEEL | HWHEEL | ANY_BUTTON) != 0
}

/// Linux X11: the physical button number of an XInput2 raw button event. 1, 2 and 3 are left, middle and right; 4 to 7 are
/// the wheel (one press per notch, also for smooth-scrolling mice, where X sends them as emulated buttons); 8 and 9 are
/// back and forward. Anything else (a mouse with more buttons) is not named.
pub fn x11_button(button: u8) -> Option<&'static str> {
    Some(match button {
        1 => "MouseLeft",
        2 => "MouseMiddle",
        3 => "MouseRight",
        4 => "WheelUp",
        5 => "WheelDown",
        6 => "WheelLeft",
        7 => "WheelRight",
        8 => "MouseBack",
        9 => "MouseForward",
        _ => return None,
    })
}

const BTN_LEFT: u16 = 0x110;
const BTN_RIGHT: u16 = 0x111;
const BTN_MIDDLE: u16 = 0x112;
const BTN_SIDE: u16 = 0x113;
const BTN_EXTRA: u16 = 0x114;
const BTN_FORWARD: u16 = 0x115;
const BTN_BACK: u16 = 0x116;
const REL_HWHEEL: u16 = 0x06;
const REL_WHEEL: u16 = 0x08;

/// Linux evdev (Wayland): the key code of a mouse button. Back and side, forward and extra are the same two buttons
/// under the names different drivers use.
pub fn evdev_button(code: u16) -> Option<&'static str> {
    Some(match code {
        BTN_LEFT => "MouseLeft",
        BTN_RIGHT => "MouseRight",
        BTN_MIDDLE => "MouseMiddle",
        BTN_SIDE | BTN_BACK => "MouseBack",
        BTN_EXTRA | BTN_FORWARD => "MouseForward",
        _ => return None,
    })
}

/// Linux evdev: a wheel event. `REL_WHEEL` is one notch (positive = up) and `REL_HWHEEL` one notch sideways (positive =
/// right). The high-resolution codes are not named: the kernel also sends `REL_WHEEL` for each full notch.
pub fn evdev_wheel(code: u16, value: i32) -> Option<&'static str> {
    if value == 0 {
        return None;
    }
    match code {
        REL_WHEEL => Some(if value > 0 { "WheelUp" } else { "WheelDown" }),
        REL_HWHEEL => Some(if value > 0 { "WheelRight" } else { "WheelLeft" }),
        _ => None,
    }
}

/// macOS: the button number of a mouse event (`kCGMouseEventButtonNumber`): 0 left, 1 right, 2 middle, 3 back, 4 forward.
pub fn macos_button(number: i64) -> Option<&'static str> {
    Some(match number {
        0 => "MouseLeft",
        1 => "MouseRight",
        2 => "MouseMiddle",
        3 => "MouseBack",
        4 => "MouseForward",
        _ => return None,
    })
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
    fn the_wheel_turn_has_its_axis_and_sign() {
        assert_eq!(wheel_turn(WHEEL, 120), Some((Axis::Vertical, 120)));
        assert_eq!(wheel_turn(WHEEL, (-30i16) as u16), Some((Axis::Vertical, -30)));
        assert_eq!(wheel_turn(HWHEEL, 60), Some((Axis::Horizontal, 60)));
        assert_eq!(wheel_turn(WHEEL, 0), None);
        assert_eq!(wheel_turn(LEFT_DOWN, 120), None);
    }

    #[test]
    fn no_turn_or_no_wheel_flag_is_no_wheel() {
        assert_eq!(wheel_name(WHEEL, 0), None);
        assert_eq!(wheel_name(LEFT_DOWN, 120), None);
    }

    #[test]
    fn x11_buttons_one_to_nine_have_a_name_and_nothing_else_does() {
        let names: Vec<_> = (1..=9).map(x11_button).collect();
        assert_eq!(
            names,
            [
                Some("MouseLeft"),
                Some("MouseMiddle"),
                Some("MouseRight"),
                Some("WheelUp"),
                Some("WheelDown"),
                Some("WheelLeft"),
                Some("WheelRight"),
                Some("MouseBack"),
                Some("MouseForward"),
            ]
        );
        assert_eq!(x11_button(0), None);
        assert_eq!(x11_button(10), None);
        assert_eq!(x11_button(255), None);
    }

    #[test]
    fn evdev_buttons_use_both_names_for_the_side_buttons() {
        assert_eq!(evdev_button(BTN_LEFT), Some("MouseLeft"));
        assert_eq!(evdev_button(BTN_RIGHT), Some("MouseRight"));
        assert_eq!(evdev_button(BTN_MIDDLE), Some("MouseMiddle"));
        assert_eq!(evdev_button(BTN_SIDE), Some("MouseBack"));
        assert_eq!(evdev_button(BTN_BACK), Some("MouseBack"));
        assert_eq!(evdev_button(BTN_EXTRA), Some("MouseForward"));
        assert_eq!(evdev_button(BTN_FORWARD), Some("MouseForward"));
    }

    #[test]
    fn evdev_codes_that_are_not_mouse_buttons_are_ignored() {
        assert_eq!(evdev_button(0x1e), None); // KEY_A
        assert_eq!(evdev_button(0x117), None); // BTN_TASK
        assert_eq!(evdev_button(0x14a), None); // BTN_TOUCH: a touchpad tap, not a button
    }

    #[test]
    fn evdev_wheel_turns_follow_the_sign_and_the_high_resolution_codes_are_skipped() {
        assert_eq!(evdev_wheel(REL_WHEEL, 1), Some("WheelUp"));
        assert_eq!(evdev_wheel(REL_WHEEL, -1), Some("WheelDown"));
        assert_eq!(evdev_wheel(REL_HWHEEL, 1), Some("WheelRight"));
        assert_eq!(evdev_wheel(REL_HWHEEL, -1), Some("WheelLeft"));
        assert_eq!(evdev_wheel(REL_WHEEL, 0), None);
        assert_eq!(evdev_wheel(0x0b, 120), None); // REL_WHEEL_HI_RES
        assert_eq!(evdev_wheel(0x0c, 120), None); // REL_HWHEEL_HI_RES
    }

    #[test]
    fn macos_button_numbers_zero_to_four_have_a_name_and_nothing_else_does() {
        let names: Vec<_> = (0..=4).map(macos_button).collect();
        assert_eq!(
            names,
            [
                Some("MouseLeft"),
                Some("MouseRight"),
                Some("MouseMiddle"),
                Some("MouseBack"),
                Some("MouseForward")
            ]
        );
        assert_eq!(macos_button(-1), None);
        assert_eq!(macos_button(5), None);
    }
}
