//! The few operating-system-specific operations, kept in one place so porting means editing one file
//! (plus the keyboard capture methods in `keyboard/`).

use std::path::Path;
use tauri::image::Image;
use tauri::tray::TrayIcon;
use tauri::{AppHandle, WebviewWindowBuilder};

/// macOS: where the red / yellow / green window buttons sit (from the window's top left), so they line up with the
/// page's header row. The page leaves room for them: `--mac-window-buttons-width` in settings.css.
#[cfg(target_os = "macos")]
const WINDOW_BUTTONS_X: f64 = 16.0;
#[cfg(target_os = "macos")]
const WINDOW_BUTTONS_Y: f64 = 24.0;

/// Which system the app runs on: "windows", "macos" or "linux". The settings window uses it to show each person their own
/// keyboard's names (Command on a Mac, Win on Windows) and to show notices that only one system needs.
pub fn name() -> &'static str {
    if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

type WindowBuilder<'a> = WebviewWindowBuilder<'a, tauri::Wry, AppHandle>;

/// The look of the settings window's frame. Windows and Linux: no native title bar, the page draws its own minimize /
/// maximize / close buttons in the top right of its header row (windowbar.js).
#[cfg(not(target_os = "macos"))]
pub fn style_settings_window(builder: WindowBuilder<'_>) -> WindowBuilder<'_> {
    builder.decorations(false)
}

/// macOS: the real window frame, with its rounded corners and red / yellow / green buttons. The title bar is see-through
/// (Overlay) so the page's own header shows through it, and the page hides its drawn buttons and leaves room for the
/// real ones (the `mac` class, header.css).
#[cfg(target_os = "macos")]
pub fn style_settings_window(builder: WindowBuilder<'_>) -> WindowBuilder<'_> {
    builder
        .decorations(true)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::LogicalPosition::new(WINDOW_BUTTONS_X, WINDOW_BUTTONS_Y))
        .initialization_script("document.documentElement.classList.add('mac')")
}

/// The tray icon when there is nothing to report. On macOS a monochrome "template" picture that the menu bar tints for
/// light and dark; everywhere else the app icon, which keeps its colours.
pub fn tray_icon(app_icon: &Image<'_>) -> Image<'static> {
    #[cfg(target_os = "macos")]
    if let Ok(template) = Image::from_bytes(include_bytes!("../icons/tray-template.png")) {
        return template;
    }
    Image::new_owned(app_icon.rgba().to_vec(), app_icon.width(), app_icon.height())
}

/// Is the resting tray icon a template (see `tray_icon`)? Only macOS has them.
pub fn tray_icon_is_template() -> bool {
    cfg!(target_os = "macos")
}

/// Switch the tray icon between template and coloured: the orange update dot needs colour, so while it shows the icon
/// is not a template. Does nothing off macOS.
pub fn set_tray_icon_template(tray: &TrayIcon, template: bool) {
    #[cfg(target_os = "macos")]
    let _ = tray.set_icon_as_template(template);
    #[cfg(not(target_os = "macos"))]
    let _ = (tray, template);
}

/// Where the running app's `.app` folder is, from the program's own path (`.../Keystroke Overlay.app/Contents/MacOS/name`).
/// None when the program does not run from a `.app` (a `tauri dev` build, for example).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))] // used by restart_app on macOS, and by the tests
fn app_bundle_of(program: &Path) -> Option<std::path::PathBuf> {
    let bundle = program.parent()?.parent()?.parent()?;
    let is_app_folder = bundle.extension().is_some_and(|extension| extension == "app");
    let in_macos_folder = program.parent()?.file_name()? == "MacOS";
    (is_app_folder && in_macos_folder).then(|| bundle.to_path_buf())
}

/// Quit and start the app again. macOS: Tauri's own restart opens the new copy while this one is still running, and the
/// single-instance guard sends the new copy away, so the app would just disappear. Instead a small helper waits for this
/// process to be gone, then opens the app. Elsewhere, and for a `tauri dev` build, Tauri's restart is fine.
pub fn restart_app(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    if let Some(bundle) = std::env::current_exe().ok().and_then(|program| app_bundle_of(&program)) {
        // $1 is the app folder, $2 this process's id. Waits until that process is gone, then opens a fresh copy.
        const WAIT_THEN_OPEN: &str = "while kill -0 \"$2\" 2>/dev/null; do sleep 0.2; done; /usr/bin/open -n \"$1\"";
        let helper = std::process::Command::new("/bin/sh")
            .args(["-c", WAIT_THEN_OPEN, "restart"])
            .arg(&bundle)
            .arg(std::process::id().to_string())
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
        if helper.is_ok() {
            app.exit(0);
            return;
        }
    }
    app.restart();
}

/// macOS: show the app in the Dock (and the app switcher) while its settings window is open, hide it when the window
/// closes, so the app is a menu-bar app the rest of the time. Does nothing elsewhere.
pub fn set_dock_icon_visible(app: &AppHandle, visible: bool) {
    #[cfg(target_os = "macos")]
    let _ = app.set_dock_visibility(visible);
    #[cfg(not(target_os = "macos"))]
    let _ = (app, visible);
}

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn the_app_folder_is_found_from_the_program_inside_it() {
        let program = Path::new("/Applications/Keystroke Overlay.app/Contents/MacOS/keyoverlay");
        assert_eq!(
            app_bundle_of(program),
            Some(PathBuf::from("/Applications/Keystroke Overlay.app"))
        );
    }

    #[test]
    fn a_program_outside_an_app_folder_has_none() {
        assert_eq!(
            app_bundle_of(Path::new(
                "/Users/me/keystroke-overlay/src-tauri/target/debug/keyoverlay"
            )),
            None
        );
        assert_eq!(app_bundle_of(Path::new("/Applications/Tool.app/keyoverlay")), None);
        assert_eq!(app_bundle_of(Path::new("keyoverlay")), None);
    }
}
