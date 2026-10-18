//! The values that belong to THIS app: its name, its GitHub repository, its identifiers. The rest of the code asks here
//! instead of spelling them out, so another program built from this code changes them in one place. They must agree with
//! `app.config.json` at the root (tools and tests read that file) and with `tauri.conf.json`; `npm run check:config` checks it.

/// The app's name as people see it (window title, tray, messages).
pub const NAME: &str = "Keystroke Overlay";

/// The GitHub repository that hosts releases and update manifests.
pub const REPO: &str = "nqble/keystroke-overlay";

/// The app's identity in Windows (its data folder, its uninstall entry): the real app and the devbuild. (The program itself only
/// reads its identity from `tauri.conf.json`; these are here for the tests and the consistency check.)
#[cfg(test)]
pub const ID_APP: &str = "com.keyoverlay.app";
#[cfg(test)]
pub const ID_DEVBUILD: &str = "com.keyoverlay.devbuild";

/// The tag inside a layouts file made by "Export" (so "Import" can tell it is ours).
pub const LAYOUTS_FILE_TAG: &str = "keystroke-overlay-layouts";

/// The repository's releases page.
pub fn releases_url() -> String {
    format!("https://github.com/{REPO}/releases")
}
