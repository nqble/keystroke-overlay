//! Wheel turns into whole notches, and at most one press per wheel direction per `MIN_TAP_MS`
//! (docs/proposals/mouse-input.md, "Wheel").
//!
//! Plain logic with no system calls and no clock of its own (the caller passes the time), so it is tested on every system.
//! Two jobs:
//!
//! - **High-resolution wheels** send fractions of a notch (Windows deltas under 120, macOS fractional lines).
//!   `Notches` adds them up per axis and says how many whole notches have come in which direction; turning the other way
//!   starts the count over, so a little back and forth never adds up to a notch.
//! - **Free-spinning wheels** can send hundreds of notches a second. `Throttle` lets one press per wheel direction through
//!   every `MIN_TAP_MS` and drops the rest, so the overlay shows a steady flash instead of a flood.

/// How long a tap shows on the overlay at least, in milliseconds. The same number as `MIN_TAP_MS` in
/// `ui/overlay/taps.js`: keep the two in step.
pub const MIN_TAP_MS: u64 = 100;

/// One notch of a Windows wheel (`WHEEL_DELTA`): its turns come in 120ths.
pub const WINDOWS_NOTCH: i32 = 120;
/// One notch of a macOS wheel: one line.
pub const MACOS_NOTCH: i32 = 1;

/// The two directions a wheel can turn: up and down, or left and right.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Axis {
    Vertical,
    Horizontal,
}

/// The turns of one wheel added up, until they make whole notches. Keep one per mouse.
#[derive(Default)]
pub struct Notches {
    vertical: i32,
    horizontal: i32,
}

impl Notches {
    /// Adds one turn of `delta` (positive = up or right, as the wheel reports it) and returns the wheel name and how many
    /// whole notches it completed (`None` while it is only part of one). `notch` is the size of one notch in the
    /// system's units (`WINDOWS_NOTCH`, `MACOS_NOTCH`). A turn the other way than the one before drops what was left
    /// of it first.
    pub fn add(&mut self, axis: Axis, delta: i32, notch: i32) -> Option<(&'static str, u32)> {
        if delta == 0 || notch <= 0 {
            return None;
        }
        let total = match axis {
            Axis::Vertical => &mut self.vertical,
            Axis::Horizontal => &mut self.horizontal,
        };
        if (*total > 0) != (delta > 0) {
            *total = 0; // turned the other way: start over
        }
        *total += delta;
        let whole = *total / notch;
        if whole == 0 {
            return None;
        }
        *total -= whole * notch;
        let name = match (axis, whole > 0) {
            (Axis::Vertical, true) => "WheelUp",
            (Axis::Vertical, false) => "WheelDown",
            (Axis::Horizontal, true) => "WheelRight",
            (Axis::Horizontal, false) => "WheelLeft",
        };
        Some((name, whole.unsigned_abs()))
    }
}

/// At most one press per wheel name per `MIN_TAP_MS`: asks "may this notch be sent now?" with the time in milliseconds.
#[derive(Default)]
pub struct Throttle {
    last_sent: [Option<u64>; 4],
}

impl Throttle {
    /// True when a press of `name` may go out at `now_ms`, false while one sent less than `MIN_TAP_MS` ago is still
    /// showing. Names other than the four wheel names are always let through.
    pub fn allow(&mut self, name: &str, now_ms: u64) -> bool {
        let slot = match name {
            "WheelUp" => 0,
            "WheelDown" => 1,
            "WheelLeft" => 2,
            "WheelRight" => 3,
            _ => return true,
        };
        match self.last_sent[slot] {
            Some(sent) if now_ms.saturating_sub(sent) < MIN_TAP_MS => false,
            _ => {
                self.last_sent[slot] = Some(now_ms);
                true
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn up(notches: &mut Notches, delta: i32) -> Option<(&'static str, u32)> {
        notches.add(Axis::Vertical, delta, WINDOWS_NOTCH)
    }

    #[test]
    fn a_full_notch_is_one_notch() {
        assert_eq!(up(&mut Notches::default(), 120), Some(("WheelUp", 1)));
        assert_eq!(up(&mut Notches::default(), -120), Some(("WheelDown", 1)));
    }

    #[test]
    fn small_turns_add_up_to_a_notch() {
        let mut notches = Notches::default();
        assert_eq!(up(&mut notches, 30), None);
        assert_eq!(up(&mut notches, 30), None);
        assert_eq!(up(&mut notches, 60), Some(("WheelUp", 1)));
        assert_eq!(up(&mut notches, 120), Some(("WheelUp", 1))); // nothing was left over
    }

    #[test]
    fn what_is_left_over_counts_towards_the_next_notch() {
        let mut notches = Notches::default();
        assert_eq!(up(&mut notches, 200), Some(("WheelUp", 1)));
        assert_eq!(up(&mut notches, 40), Some(("WheelUp", 1))); // 80 left + 40
    }

    #[test]
    fn a_fast_turn_can_be_several_notches() {
        assert_eq!(up(&mut Notches::default(), 360), Some(("WheelUp", 3)));
        assert_eq!(up(&mut Notches::default(), -240), Some(("WheelDown", 2)));
    }

    #[test]
    fn turning_the_other_way_starts_over() {
        let mut notches = Notches::default();
        assert_eq!(up(&mut notches, 60), None);
        assert_eq!(up(&mut notches, -60), None); // half a notch up, half down: nothing
        assert_eq!(up(&mut notches, -60), Some(("WheelDown", 1))); // the 60 up were dropped
    }

    #[test]
    fn the_two_axes_are_counted_apart() {
        let mut notches = Notches::default();
        assert_eq!(notches.add(Axis::Vertical, 60, WINDOWS_NOTCH), None);
        assert_eq!(notches.add(Axis::Horizontal, 60, WINDOWS_NOTCH), None);
        assert_eq!(
            notches.add(Axis::Horizontal, 60, WINDOWS_NOTCH),
            Some(("WheelRight", 1))
        );
        assert_eq!(notches.add(Axis::Vertical, 60, WINDOWS_NOTCH), Some(("WheelUp", 1)));
        assert_eq!(
            notches.add(Axis::Horizontal, -120, WINDOWS_NOTCH),
            Some(("WheelLeft", 1))
        );
    }

    #[test]
    fn a_macos_line_is_a_notch() {
        let mut notches = Notches::default();
        assert_eq!(notches.add(Axis::Vertical, 1, MACOS_NOTCH), Some(("WheelUp", 1)));
        assert_eq!(notches.add(Axis::Vertical, -3, MACOS_NOTCH), Some(("WheelDown", 3)));
    }

    #[test]
    fn no_turn_and_no_notch_size_are_nothing() {
        let mut notches = Notches::default();
        assert_eq!(notches.add(Axis::Vertical, 0, WINDOWS_NOTCH), None);
        assert_eq!(notches.add(Axis::Vertical, 120, 0), None);
    }

    #[test]
    fn a_burst_of_notches_inside_the_minimum_tap_is_one_press() {
        let mut throttle = Throttle::default();
        let sent = (0..50).filter(|i| throttle.allow("WheelDown", 1000 + i * 2)).count(); // 50 notches in 98 ms
        assert_eq!(sent, 1);
    }

    #[test]
    fn a_long_spin_is_one_press_per_minimum_tap() {
        let mut throttle = Throttle::default();
        let sent = (0..100).filter(|i| throttle.allow("WheelUp", i * 10)).count(); // a notch every 10 ms for a second
        assert_eq!(sent, 10);
    }

    #[test]
    fn each_wheel_direction_has_its_own_clock() {
        let mut throttle = Throttle::default();
        assert!(throttle.allow("WheelUp", 0));
        assert!(throttle.allow("WheelDown", 5));
        assert!(throttle.allow("WheelLeft", 10));
        assert!(throttle.allow("WheelRight", 15));
        assert!(!throttle.allow("WheelUp", 50));
        assert!(throttle.allow("WheelUp", MIN_TAP_MS));
    }

    #[test]
    fn buttons_are_never_held_back() {
        let mut throttle = Throttle::default();
        assert!((0..10).all(|i| throttle.allow("MouseLeft", i)));
    }
}
