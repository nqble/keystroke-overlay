//! The crash note: if the app ever crashes, one short line is saved so the next start can say so in the event log and
//! the bug report (docs/DEBUGGING.md). Release builds stop at once on a crash (`panic = "abort"` in Cargo.toml), so
//! without this a crash leaves no trace at all.
//!
//! PRIVACY: the note holds only the app version, WHERE in the code the crash happened (file, line, thread) and how long
//! the app had been running. Not the crash message (it could in theory contain data), never a key. It lives in the
//! app's data folder and is deleted as soon as the next start has read it. PRIVACY.md says the same.

use std::path::{Path, PathBuf};
use std::time::Instant;

const FILE_NAME: &str = "crash-note.txt";

fn note_path(data_dir: &Path) -> PathBuf {
    data_dir.join(FILE_NAME)
}

/// The note's one line, in plain words: "v1.4.0 crashed in src/server.rs:120 (thread key-hook), 12 min after start".
fn describe(location: &str, thread: &str, minutes: u64) -> String {
    format!(
        "v{} crashed in {location} (thread {thread}), {minutes} min after start",
        env!("CARGO_PKG_VERSION")
    )
}

/// Install the crash hook, at start-up. Runs just before the app stops; the usual crash output still follows.
pub fn install(data_dir: &Path) {
    let path = note_path(data_dir);
    let started = Instant::now();
    let usual = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info.location().map_or("an unknown place".to_string(), |l| {
            format!("{}:{}", l.file().replace('\\', "/"), l.line())
        });
        let thread = std::thread::current().name().unwrap_or("unnamed").to_string();
        let _ = std::fs::write(&path, describe(&location, &thread, started.elapsed().as_secs() / 60));
        usual(info);
    }));
}

/// The note from the last run, if it crashed; the note is deleted once read, so it is reported only once.
pub fn take_last(data_dir: &Path) -> Option<String> {
    let path = note_path(data_dir);
    let note = std::fs::read_to_string(&path).ok()?;
    let _ = std::fs::remove_file(&path);
    let line = note.lines().next()?.trim().chars().take(200).collect::<String>();
    (!line.is_empty()).then_some(line)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_note_is_read_once_then_gone_and_holds_only_place_and_time() {
        let dir = std::env::temp_dir().join(format!("ko-crash-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(take_last(&dir), None, "no crash, no note");
        std::fs::write(note_path(&dir), describe("src/server.rs:120", "key-hook", 12)).unwrap();
        let note = take_last(&dir).unwrap();
        assert!(
            note.ends_with("crashed in src/server.rs:120 (thread key-hook), 12 min after start"),
            "{note}"
        );
        assert_eq!(take_last(&dir), None, "reported only once");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_panic_writes_the_note_with_its_place_but_not_its_message() {
        let dir = std::env::temp_dir().join(format!("ko-crash-hook-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let before = std::panic::take_hook();
        install(&dir);
        let crashed = std::thread::Builder::new()
            .name("crash-test".into())
            .spawn(|| panic!("secret message KeyW"))
            .unwrap()
            .join();
        std::panic::set_hook(before);
        assert!(crashed.is_err());
        let note = take_last(&dir).expect("the hook wrote a note");
        assert!(note.contains("src/crash.rs:"), "{note}");
        assert!(note.contains("(thread crash-test)"), "{note}");
        assert!(
            !note.contains("secret") && !note.contains("KeyW"),
            "the message is never saved: {note}"
        );
        std::fs::remove_dir_all(&dir).ok();
    }
}
