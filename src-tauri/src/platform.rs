//! The few operating-system-specific operations, kept in one place so porting means editing one file
//! (plus the keyboard capture methods in `keyboard/`).

use std::path::Path;

/// Hand freed memory pages back to the OS so the tray-only footprint drops after the settings window closes.
#[cfg(windows)]
pub fn trim_memory() {
    use windows::Win32::System::{ProcessStatus::EmptyWorkingSet, Threading::GetCurrentProcess};
    unsafe { let _ = EmptyWorkingSet(GetCurrentProcess()); }
}
#[cfg(not(windows))]
pub fn trim_memory() {}

fn opener() -> &'static str {
    if cfg!(windows) { "explorer" } else if cfg!(target_os = "macos") { "open" } else { "xdg-open" }
}

/// Show a folder in the system file manager.
pub fn open_folder(p: &Path) {
    let _ = std::process::Command::new(opener()).arg(p).spawn();
}

/// Open a web address in the default browser.
pub fn open_url(url: &str) -> std::io::Result<()> {
    std::process::Command::new(opener()).arg(url).spawn().map(|_| ())
}
