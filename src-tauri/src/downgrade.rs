//! Going back to an older version of the app, and forward again, without losing settings.
//!
//! An older version can't read the fields only a newer one knows, and its next save would drop them. So when it loads a
//! file written by a newer version, it first copies that file untouched to `settings.v<N>.json` (N = the newer file's
//! format version). When the newer version (format N) later finds that copy next to an older settings.json, it puts the
//! copy back underneath: what was changed on the older version wins, and the fields only it knows come back from the copy.
//! Then the copy is removed, so the next downgrade makes a fresh one. Loading lives in settings.rs (`load`), with the tests.
use crate::settings::{merge, read_json, CURRENT_VERSION};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

/// The settings file `source` was written by a NEWER version: copy it aside, once, never overwriting an existing copy.
pub fn keep_copy_of_newer_settings(source: &Path, raw: &Value) {
    let Some(version) = raw
        .get("version")
        .and_then(Value::as_u64)
        .filter(|version| *version > CURRENT_VERSION)
    else {
        return;
    };
    let copy = copy_path(source, version);
    if !copy.exists() {
        let _ = std::fs::copy(source, copy);
    }
}

/// `raw` was written by an OLDER version and a copy of this version's file waits next to it: the two merged (raw wins),
/// plus the copy's path so the caller can remove it once the result is saved. Otherwise `raw` unchanged and no path.
pub fn with_copy_restored(path: &Path, raw: Value) -> (Value, Option<PathBuf>) {
    let version = raw.get("version").and_then(Value::as_u64).unwrap_or(1);
    if version >= CURRENT_VERSION {
        return (raw, None);
    }
    let copy = copy_path(path, CURRENT_VERSION);
    let Some(mut restored) = read_json(&copy) else {
        return (raw, None);
    };
    merge(&mut restored, &raw);
    restored["version"] = json!(CURRENT_VERSION);
    (restored, Some(copy))
}

fn copy_path(next_to: &Path, version: u64) -> PathBuf {
    next_to.with_file_name(format!("settings.v{version}.json"))
}
