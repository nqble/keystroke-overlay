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

/// What each typing key (keyboard/keymap.rs, TYPING_KEYS) prints on the user's own keyboard, as labels for the
/// overlay: {"KeyQ": "A", "Semicolon": "M", ...} on a French AZERTY keyboard. Empty for the US English keyboard (the
/// layout files already say what it prints), on other systems, and if Windows can't tell. Reads the default keyboard
/// in Windows' language settings once; it never looks at what is typed.
#[cfg(windows)]
pub fn keyboard_labels() -> std::collections::HashMap<&'static str, String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{MapVirtualKeyExW, ToUnicodeEx, HKL, MAPVK_VSC_TO_VK_EX};
    use windows::Win32::UI::WindowsAndMessaging::{
        SystemParametersInfoW, SPI_GETDEFAULTINPUTLANG, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
    };
    /// The US English keyboard: language 0x0409 with layout 0x0409.
    const US_ENGLISH: usize = 0x0409_0409;
    /// ToUnicodeEx flag: don't change the keyboard state while asking (Windows 10 1607 and later).
    const KEEP_KEYBOARD_STATE: u32 = 0x4;
    let mut labels = std::collections::HashMap::new();
    unsafe {
        let mut keyboard = HKL(std::ptr::null_mut());
        let found = SystemParametersInfoW(
            SPI_GETDEFAULTINPUTLANG,
            0,
            Some(&mut keyboard as *mut HKL as *mut core::ffi::c_void),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        );
        if found.is_err() || keyboard.0 as usize & 0xFFFF_FFFF == US_ENGLISH {
            return labels;
        }
        let no_keys_held = [0u8; 256];
        for &(code, scancode) in crate::keyboard::keymap::TYPING_KEYS {
            let virtual_key = MapVirtualKeyExW(scancode, MAPVK_VSC_TO_VK_EX, Some(keyboard));
            let mut typed = [0u16; 4];
            let count = ToUnicodeEx(
                virtual_key,
                scancode,
                &no_keys_held,
                &mut typed,
                KEEP_KEYBOARD_STATE,
                Some(keyboard),
            );
            if let Some(label) = (count == 1).then(|| crate::key_labels::label_for(typed[0])).flatten() {
                labels.insert(code, label);
            }
        }
    }
    labels
}
#[cfg(not(windows))]
pub fn keyboard_labels() -> std::collections::HashMap<&'static str, String> {
    std::collections::HashMap::new()
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
pub fn open_folder(folder: &Path) {
    let _ = std::process::Command::new(opener()).arg(folder).spawn();
}

/// Open a web address in the default browser.
pub fn open_url(url: &str) -> std::io::Result<()> {
    std::process::Command::new(opener()).arg(url).spawn().map(|_| ())
}
