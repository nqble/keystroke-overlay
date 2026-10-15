//! The few operating-system-specific operations, kept in one place so porting means editing one file
//! (plus the keyboard capture methods in `keyboard/`).

use std::path::Path;

/// Hand freed memory pages back to the OS so the tray-only footprint drops after the settings window closes.
#[cfg(windows)]
pub fn trim_memory() {
    use windows::Win32::System::{ProcessStatus::EmptyWorkingSet, Threading::GetCurrentProcess};
    unsafe {
        let _ = EmptyWorkingSet(GetCurrentProcess());
    }
}
#[cfg(not(windows))]
pub fn trim_memory() {}

/// This process's memory (MB, the part resident in RAM) and open handle count, for the Debug tab. Zeros where
/// unsupported.
#[cfg(windows)]
pub fn process_stats() -> (f64, u32) {
    use windows::Win32::System::{
        ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS},
        Threading::{GetCurrentProcess, GetProcessHandleCount},
    };
    unsafe {
        let process = GetCurrentProcess();
        let mut counters = PROCESS_MEMORY_COUNTERS {
            cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
            ..Default::default()
        };
        let _ = GetProcessMemoryInfo(process, &mut counters, counters.cb);
        let mut handles = 0u32;
        let _ = GetProcessHandleCount(process, &mut handles);
        (counters.WorkingSetSize as f64 / 1_048_576.0, handles)
    }
}
#[cfg(not(windows))]
pub fn process_stats() -> (f64, u32) {
    (0.0, 0)
}

fn opener() -> &'static str {
    if cfg!(windows) {
        "explorer"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    }
}

/// Show a folder in the system file manager.
pub fn open_folder(p: &Path) {
    let _ = std::process::Command::new(opener()).arg(p).spawn();
}

/// Open a web address in the default browser.
pub fn open_url(url: &str) -> std::io::Result<()> {
    std::process::Command::new(opener()).arg(url).spawn().map(|_| ())
}
