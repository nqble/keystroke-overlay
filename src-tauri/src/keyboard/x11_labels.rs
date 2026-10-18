//! Linux, X11 desktops: what each typing key prints on the user's own keyboard, for key labels that follow the keyboard
//! language (src-tauri/src/key_labels.rs), and a watcher that says when the person switches layout. Same rules as the
//! Windows and Mac versions: only the typing keys are asked (keyboard/keymap.rs TYPING_KEYS, so the digit row keeps its
//! digits), and a key that doesn't print one visible character keeps its layout label. On a US keyboard every answer is
//! the letter the layout file already shows, so nothing changes.
//!
//! The X server keeps the keyboard map and the active layout group (XKB). The labels come from the core keyboard
//! mapping, read for the active group; the watcher listens for XKB's group-change and new-map events on its own
//! connection, so it costs nothing while the layout stays the same (no timer). Nothing about what is typed is read: a
//! key is looked up in the map, never from a real key press.

use super::keymap::TYPING_KEYS;
use super::linux_keys::X11_KEYCODE_OFFSET;
use std::collections::HashMap;
use x11rb::connection::{Connection, RequestConnection};
use x11rb::protocol::xkb::{self, ConnectionExt as _};
use x11rb::protocol::xproto::ConnectionExt as _;
use x11rb::protocol::Event;
use x11rb::rust_connection::RustConnection;

/// The XKB version the app speaks (every X server from the last twenty years has it).
const XKB_MAJOR: u16 = 1;
const XKB_MINOR: u16 = 0;

/// Keysyms 0x20 to 0x7E and 0xA0 to 0xFF are the Latin-1 characters with the same numbers.
const LATIN1_KEYSYMS: [std::ops::RangeInclusive<u32>; 2] = [0x20..=0x7E, 0xA0..=0xFF];
/// Keysyms from here on are Unicode characters: the keysym minus this is the code point.
const UNICODE_KEYSYM_BASE: u32 = 0x0100_0000;
/// The core keyboard mapping has each group's unshifted symbol in column 0 (group 1) or 2 (group 2); a third or fourth
/// group isn't in it, and then the keys keep their layout labels.
const UNSHIFTED_COLUMN_BY_GROUP: [usize; 2] = [0, 2];

/// The character a keysym stands for, for the ones that are plain characters (Latin-1 and the Unicode keysyms). Others
/// (dead keys, function keys, older non-Latin keysyms) give None, and that key keeps its layout label.
fn keysym_char(keysym: u32) -> Option<char> {
    if LATIN1_KEYSYMS.iter().any(|range| range.contains(&keysym)) {
        return char::from_u32(keysym);
    }
    if keysym > UNICODE_KEYSYM_BASE {
        return char::from_u32(keysym - UNICODE_KEYSYM_BASE);
    }
    None
}

/// Which column of the core keyboard mapping holds the unshifted symbol for this layout group (0 is the first group).
fn unshifted_column(group: u8) -> Option<usize> {
    UNSHIFTED_COLUMN_BY_GROUP.get(usize::from(group)).copied()
}

/// The label for one key from its row of the keyboard mapping, or None.
fn label_from_row(row: &[u32], column: usize) -> Option<String> {
    let typed = keysym_char(*row.get(column)?)?;
    let utf16 = u16::try_from(u32::from(typed)).ok()?;
    crate::key_labels::label_for(utf16)
}

/// Connect to the X server and switch XKB on for this connection. None without an X display (a Wayland-only session,
/// or no desktop at all): the keys then keep their layout labels.
fn connect() -> Option<RustConnection> {
    let (connection, _) = RustConnection::connect(None).ok()?;
    connection.extension_information(xkb::X11_EXTENSION_NAME).ok()??;
    let reply = connection.xkb_use_extension(XKB_MAJOR, XKB_MINOR).ok()?.reply().ok()?;
    reply.supported.then_some(connection)
}

/// The active layout group (0 for the first layout in the person's list).
fn active_group(connection: &RustConnection) -> Option<u8> {
    let state = connection
        .xkb_get_state(xkb::ID::USE_CORE_KBD.into())
        .ok()?
        .reply()
        .ok()?;
    Some(u8::from(state.group))
}

/// The labels for the typing keys on this connection's keyboard, for the active group.
fn labels_from(connection: &RustConnection) -> HashMap<&'static str, String> {
    let mut labels = HashMap::new();
    let Some(column) = active_group(connection).and_then(unshifted_column) else {
        return labels;
    };
    let setup = connection.setup();
    let first = setup.min_keycode;
    let count = setup.max_keycode - first + 1;
    let Some(mapping) = connection
        .get_keyboard_mapping(first, count)
        .ok()
        .and_then(|cookie| cookie.reply().ok())
    else {
        return labels;
    };
    let per_key = usize::from(mapping.keysyms_per_keycode);
    for &(code, scancode) in TYPING_KEYS {
        let Some(index) = (scancode + X11_KEYCODE_OFFSET).checked_sub(u32::from(first)) else {
            continue;
        };
        let start = index as usize * per_key;
        let Some(row) = mapping.keysyms.get(start..start + per_key) else {
            continue;
        };
        if let Some(label) = label_from_row(row, column) {
            labels.insert(code, label);
        }
    }
    labels
}

/// The labels of the typing keys on the user's keyboard: {"KeyQ": "A", ...} on a French AZERTY keyboard. Empty without
/// an X display.
pub fn keyboard_labels() -> HashMap<&'static str, String> {
    connect().map(|connection| labels_from(&connection)).unwrap_or_default()
}

/// Call `on_change` each time the person switches layout group or the keyboard map is replaced (for example a new
/// layout picked in the desktop's settings). Runs on its own thread, which waits for X events and so uses no CPU in
/// between; it ends with the app. Without an X display nothing happens.
pub fn watch(on_change: Box<dyn Fn() + Send + Sync>) {
    let Some(connection) = connect() else {
        return;
    };
    let _ = std::thread::Builder::new()
        .name("key-layout-watch".into())
        .spawn(move || wait_for_layout_changes(&connection, on_change.as_ref()));
}

/// Ask XKB for group changes and new keyboard maps only, then call `on_change` for each.
fn wait_for_layout_changes(connection: &RustConnection, on_change: &dyn Fn()) {
    // Map and new-keyboard events in full; state events only for a group change (not every Shift press).
    let maps = xkb::EventType::MAP_NOTIFY | xkb::EventType::NEW_KEYBOARD_NOTIFY;
    let group_only = xkb::SelectEventsAuxStateNotify {
        affect_state: xkb::StatePart::GROUP_STATE,
        state_details: xkb::StatePart::GROUP_STATE,
    };
    let details = xkb::SelectEventsAux::new().state_notify(group_only);
    let everything = xkb::MapPart::from(u16::MAX);
    let selected = connection.xkb_select_events(
        xkb::ID::USE_CORE_KBD.into(),
        xkb::EventType::from(0u16),
        maps,
        everything,
        everything,
        &details,
    );
    if selected.is_err() || connection.flush().is_err() {
        return;
    }
    while let Ok(event) = connection.wait_for_event() {
        if matches!(
            event,
            Event::XkbStateNotify(_) | Event::XkbMapNotify(_) | Event::XkbNewKeyboardNotify(_)
        ) {
            on_change();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn latin1_and_unicode_keysyms_are_characters() {
        assert_eq!(keysym_char(0x61), Some('a'));
        assert_eq!(keysym_char(0xE9), Some('é'), "é on a French keyboard");
        assert_eq!(keysym_char(0xDF), Some('ß'), "ß on a German keyboard");
        assert_eq!(keysym_char(0x0100_0444), Some('ф'), "a Unicode keysym");
    }

    #[test]
    fn other_keysyms_keep_the_layout_label() {
        assert_eq!(keysym_char(0xFE51), None, "a dead key (dead_circumflex)");
        assert_eq!(keysym_char(0xFFBE), None, "F1");
        assert_eq!(keysym_char(0), None, "NoSymbol");
    }

    #[test]
    fn the_first_two_groups_have_columns_and_later_ones_do_not() {
        assert_eq!(unshifted_column(0), Some(0));
        assert_eq!(unshifted_column(1), Some(2));
        assert_eq!(unshifted_column(2), None);
    }

    #[test]
    fn a_row_gives_the_upper_case_label_of_its_group() {
        let french_q_key = [0x61, 0x41, 0x71, 0x51]; // a A (group 1), q Q (group 2)
        assert_eq!(label_from_row(&french_q_key, 0), Some("A".into()));
        assert_eq!(label_from_row(&french_q_key, 2), Some("Q".into()));
        assert_eq!(
            label_from_row(&french_q_key[..1], 2),
            None,
            "a short row keeps the layout label"
        );
    }

    /// Needs a real X server, so it doesn't run with the other tests (run it with
    /// `xvfb-run cargo test --manifest-path src-tauri/Cargo.toml real_x_server -- --ignored`). It swaps what the Q and A
    /// keys print, as French AZERTY does, then checks the labels follow and the watcher says so.
    #[test]
    #[ignore]
    fn a_real_x_server_gives_the_labels_and_tells_of_changes() {
        let connection = connect().expect("an X server (run under xvfb-run)");
        let per_key = connection
            .get_keyboard_mapping(24, 1)
            .unwrap()
            .reply()
            .unwrap()
            .keysyms_per_keycode;
        let row = |lower: u32| {
            let mut row = vec![0u32; usize::from(per_key)];
            row[0] = lower;
            row[1] = lower - 0x20;
            row
        };
        let (changed_tx, changed_rx) = std::sync::mpsc::channel();
        watch(Box::new(move || {
            let _ = changed_tx.send(());
        }));
        std::thread::sleep(std::time::Duration::from_millis(200)); // let the watcher select its events
        let q_key = 0x10 + X11_KEYCODE_OFFSET as u8;
        let a_key = 0x1E + X11_KEYCODE_OFFSET as u8;
        connection
            .change_keyboard_mapping(1, q_key, per_key, &row(u32::from(b'a')))
            .unwrap();
        connection
            .change_keyboard_mapping(1, a_key, per_key, &row(u32::from(b'q')))
            .unwrap();
        connection.flush().unwrap();
        let told = changed_rx.recv_timeout(std::time::Duration::from_secs(2));
        let labels = keyboard_labels();
        connection
            .change_keyboard_mapping(1, q_key, per_key, &row(u32::from(b'q')))
            .unwrap();
        connection
            .change_keyboard_mapping(1, a_key, per_key, &row(u32::from(b'a')))
            .unwrap();
        connection.flush().unwrap();
        assert_eq!(labels.get("KeyQ").map(String::as_str), Some("A"));
        assert_eq!(labels.get("KeyA").map(String::as_str), Some("Q"));
        assert_eq!(
            labels.get("KeyW").map(String::as_str),
            Some("W"),
            "an unchanged key keeps its letter"
        );
        assert!(told.is_ok(), "the watcher reports a changed keyboard map");
    }
}
