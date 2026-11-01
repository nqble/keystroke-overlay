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
/// maximize / close buttons in the top right of its header row (windowbar.js). The app's own file-drop handler is off
/// too: while it is on, the page's own drag and drop (the Layout tab's cards) never gets the drop on Windows, and the
/// settings window takes no dropped files.
#[cfg(not(target_os = "macos"))]
pub fn style_settings_window(builder: WindowBuilder<'_>) -> WindowBuilder<'_> {
    builder.decorations(false).disable_drag_drop_handler()
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

/// The settings window is an app, not a browser page: switch off WebView2's own shortcuts and gestures, so keys such as
/// Ctrl+P / Ctrl+Shift+P (print), Ctrl+F (find), Ctrl+R and F5 (reload), Ctrl+S, Ctrl+U, F12 and Ctrl+Shift+I (developer
/// tools), Ctrl+plus / minus / mouse wheel (zoom) and Alt+Left (back) do nothing. Only the app's own keys work. The pause
/// shortcut (hotkeys.rs) is a system-wide shortcut and is not affected. Copy, paste and the like still work, and the
/// developer tools stay reachable through the inspector port (docs/DEBUGGING.md).
#[cfg(windows)]
pub fn lock_browser_features(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Settings, ICoreWebView2Settings3, ICoreWebView2Settings5, ICoreWebView2Settings6,
    };
    use windows::core::Interface;
    let _ = window.with_webview(|webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else {
            return;
        };
        let Ok(settings) = core.Settings() else { return };
        let _ = ICoreWebView2Settings::SetIsZoomControlEnabled(&settings, false);
        if let Ok(settings) = settings.cast::<ICoreWebView2Settings3>() {
            let _ = settings.SetAreBrowserAcceleratorKeysEnabled(false);
        }
        if let Ok(settings) = settings.cast::<ICoreWebView2Settings5>() {
            let _ = settings.SetIsPinchZoomEnabled(false);
        }
        if let Ok(settings) = settings.cast::<ICoreWebView2Settings6>() {
            let _ = settings.SetIsSwipeNavigationEnabled(false);
        }
    });
}

/// Other systems: their web views have no browser shortcuts of this kind to switch off.
#[cfg(not(windows))]
pub fn lock_browser_features(_window: &tauri::WebviewWindow) {}

/// The tray icon when there is nothing to report. On macOS a monochrome "template" picture that the menu bar tints for
/// light and dark; everywhere else the app icon, which keeps its colors.
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

/// Switch the tray icon between template and colored: the orange update dot needs color, so while it shows the icon
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

/// What a macOS menu-bar item should do. The ids are the ones `install_app_menu` gives its items.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))] // built on macOS, and tested everywhere
#[derive(Debug, PartialEq)]
pub enum AppMenuAction {
    Quit,
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
const MENU_QUIT_ID: &str = "app-quit";

/// Which action a menu item id means, if it is one of ours (the other items, like Copy and Close Window, work by themselves).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn app_menu_action(id: &str) -> Option<AppMenuAction> {
    match id {
        MENU_QUIT_ID => Some(AppMenuAction::Quit),
        _ => None,
    }
}

/// Does minimizing the settings window close it to the tray? Never on a Mac: the yellow button minimizes into the Dock,
/// as Mac users expect (decided 2026-11-01), and the Dock icon stays while the window is open. Elsewhere it follows the
/// "Minimize to tray" setting.
pub fn minimize_closes_window(minimize_to_tray_setting: bool) -> bool {
    !cfg!(target_os = "macos") && minimize_to_tray_setting
}

/// macOS: the app's own menu bar while the settings window is open (the Dock icon is showing). Quit (Command+Q) really
/// quits: the default Quit asks the app to exit without a code, which the app refuses so that closing the last window leaves
/// it in the tray. Close Window (Command+W) closes the window like the red button, and the Edit
/// menu keeps copy and paste working in the settings fields. Does nothing elsewhere.
#[cfg(target_os = "macos")]
pub fn install_app_menu(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
    let name = crate::app_info::NAME;
    let quit = MenuItemBuilder::with_id(MENU_QUIT_ID, format!("Quit {name}"))
        .accelerator("Cmd+Q")
        .build(app)?;
    let app_menu = SubmenuBuilder::new(app, name)
        .hide()
        .hide_others()
        .separator()
        .item(&quit)
        .build()?;
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let window_menu = SubmenuBuilder::new(app, "Window").close_window().build()?;
    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&edit_menu)
        .item(&window_menu)
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}
#[cfg(not(target_os = "macos"))]
pub fn install_app_menu(_app: &tauri::App) -> tauri::Result<()> {
    Ok(())
}

/// Do what a menu item of ours asks (see `install_app_menu`). Quit uses `exit(0)`: an exit with a code is the one the app
/// does not hold back.
pub fn on_app_menu_event(app: &AppHandle, id: &str) {
    match app_menu_action(id) {
        Some(AppMenuAction::Quit) => app.exit(0),
        None => {}
    }
}

/// Should a "reopen" open the settings window? macOS sends one when the person opens the app again (Finder, Launchpad,
/// Spotlight, the Dock icon) while it is already running; with no window showing, they expect it to appear.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))] // used by on_run_event on macOS, and by the tests
fn reopen_opens_settings(has_visible_windows: bool) -> bool {
    !has_visible_windows
}

/// macOS: opening the app again while it runs in the menu bar brings up the settings window (see `reopen_opens_settings`).
/// Other systems have no such event, and a second start is handled by the single-instance plugin.
pub fn on_run_event(app: &AppHandle, event: &tauri::RunEvent) {
    #[cfg(target_os = "macos")]
    if let tauri::RunEvent::Reopen {
        has_visible_windows, ..
    } = event
    {
        if reopen_opens_settings(*has_visible_windows) {
            crate::window::open_settings_async(app);
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, event);
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
/// Linux (glibc): give the memory the allocator kept after the settings window closed back to the system, like
/// EmptyWorkingSet does on Windows. Without it the freed pages stay counted against the app until reused.
#[cfg(all(target_os = "linux", target_env = "gnu"))]
pub fn trim_memory() {
    extern "C" {
        fn malloc_trim(pad: usize) -> i32;
    }
    // SAFETY: glibc's malloc_trim takes a plain number and only touches the allocator's own free lists.
    unsafe {
        malloc_trim(0);
    }
}
#[cfg(not(any(windows, all(target_os = "linux", target_env = "gnu"))))]
pub fn trim_memory() {}

/// This process's memory (MB, the part resident in RAM) and open handle count, for the Debug tab. Each is 0 / None
/// where it is not measured on this system, and the Debug tab then says so instead of showing a zero.
#[cfg(windows)]
pub fn process_stats() -> (f64, Option<u32>) {
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
        (counters.WorkingSetSize as f64 / 1_048_576.0, Some(handles))
    }
}
/// macOS: the resident size from the Mach task, and the open files counted in /dev/fd.
#[cfg(target_os = "macos")]
pub fn process_stats() -> (f64, Option<u32>) {
    (macos_resident_mb(), count_entries(Path::new("/dev/fd")))
}
/// Linux: the resident size from /proc/self/status, and the open files counted in /proc/self/fd.
#[cfg(target_os = "linux")]
pub fn process_stats() -> (f64, Option<u32>) {
    let status = std::fs::read_to_string("/proc/self/status").unwrap_or_default();
    (
        vm_rss_mb(&status).unwrap_or(0.0),
        count_entries(Path::new("/proc/self/fd")),
    )
}
#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
pub fn process_stats() -> (f64, Option<u32>) {
    (0.0, None)
}

/// How many entries a folder of open files has (the folder's own open file is not counted). None if it can't be read.
#[cfg_attr(not(any(target_os = "macos", target_os = "linux")), allow(dead_code))]
fn count_entries(folder: &Path) -> Option<u32> {
    let entries = std::fs::read_dir(folder).ok()?;
    Some(entries.count().saturating_sub(1) as u32)
}

/// The "VmRSS: 12345 kB" line of a Linux /proc/self/status file, in MB.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))] // used by process_stats on Linux, and by the tests
fn vm_rss_mb(status: &str) -> Option<f64> {
    let line = status.lines().find(|line| line.starts_with("VmRSS:"))?;
    let kilobytes: f64 = line.split_whitespace().nth(1)?.parse().ok()?;
    Some(kilobytes / 1024.0)
}

/// macOS: the memory this program holds in RAM, in MB, from the Mach kernel (`task_info`, flavour MACH_TASK_BASIC_INFO).
/// 0 if the kernel does not answer.
#[cfg(target_os = "macos")]
fn macos_resident_mb() -> f64 {
    /// `mach_task_basic_info` in mach/task_info.h.
    #[repr(C)]
    #[derive(Default)]
    struct MachTaskBasicInfo {
        virtual_size: u64,
        resident_size: u64,
        resident_size_max: u64,
        user_time: [i32; 2],
        system_time: [i32; 2],
        policy: i32,
        suspend_count: i32,
    }
    const MACH_TASK_BASIC_INFO: u32 = 20;
    extern "C" {
        static mach_task_self_: u32;
        fn task_info(task: u32, flavor: u32, info: *mut MachTaskBasicInfo, count: *mut u32) -> i32;
    }
    let mut info = MachTaskBasicInfo::default();
    let mut count = (std::mem::size_of::<MachTaskBasicInfo>() / std::mem::size_of::<u32>()) as u32;
    // SAFETY: `info` is a correctly sized, writable MachTaskBasicInfo and `count` its size in 32-bit words, as task_info
    // asks; `mach_task_self_` is the process's own task port, which the system provides.
    let status = unsafe { task_info(mach_task_self_, MACH_TASK_BASIC_INFO, &mut info, &mut count) };
    if status != 0 {
        return 0.0;
    }
    info.resident_size as f64 / 1_048_576.0
}

/// What each typing key (keyboard/keymap.rs, TYPING_KEYS) prints on the user's own keyboard, as labels for the
/// overlay: {"KeyQ": "A", "Semicolon": "M", ...} on a French AZERTY keyboard. Empty for the US keyboard (the layout
/// files already say what it prints) and if the system can't tell. Each system has its own file in keyboard/; none of
/// them looks at what is typed.
#[cfg(windows)]
pub fn keyboard_labels() -> std::collections::HashMap<&'static str, String> {
    crate::keyboard::windows_labels::keyboard_labels()
}
#[cfg(target_os = "macos")]
pub fn keyboard_labels() -> std::collections::HashMap<&'static str, String> {
    crate::keyboard::macos_labels::keyboard_labels()
}
/// The typing keys by the virtual key the keyboard layout in use gives them ({65: "KeyQ", ...} on a French keyboard),
/// for importing NohBoard keyboard files. Only Windows has virtual keys; the import is hidden on the other systems.
#[cfg(windows)]
pub fn typing_keys_by_virtual_key() -> Result<std::collections::HashMap<u32, &'static str>, String> {
    Ok(crate::keyboard::windows_labels::typing_keys_by_virtual_key())
}
#[cfg(not(windows))]
pub fn typing_keys_by_virtual_key() -> Result<std::collections::HashMap<u32, &'static str>, String> {
    Err("not available on this system yet".into())
}
/// Call `on_change` each time the keyboard layout may have changed, so the key labels can follow live, on a thread
/// where `keyboard_labels` may be called (the main thread on a Mac). Each system tells the app itself (no timer): a
/// notification on a Mac, XKB events on Linux, a window coming to the front on Windows. Elsewhere nothing happens and
/// the labels are read once at start-up.
pub fn watch_keyboard_layout(on_change: impl Fn() + Send + Sync + 'static) {
    #[cfg(target_os = "macos")]
    crate::keyboard::macos_labels::watch(Box::new(on_change));
    #[cfg(target_os = "linux")]
    crate::keyboard::x11_labels::watch(Box::new(on_change));
    #[cfg(windows)]
    crate::keyboard::windows_labels::watch(Box::new(on_change));
    #[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
    let _ = on_change;
}

/// The keys whose release can end a layout switch inside one window, where the system doesn't announce it (Windows,
/// keyboard/windows_labels.rs). Empty where the system does.
pub fn layout_switch_keys() -> &'static [&'static str] {
    #[cfg(windows)]
    return crate::keyboard::windows_labels::SWITCH_KEYS;
    #[cfg(not(windows))]
    return &[];
}

#[cfg(target_os = "linux")]
pub fn keyboard_labels() -> std::collections::HashMap<&'static str, String> {
    crate::keyboard::x11_labels::keyboard_labels()
}
#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
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

    /// Freed memory goes back to the system after trim_memory (Linux): allocate and free about 64 MB in small pieces,
    /// which glibc keeps for reuse, then check that trimming brings the resident size down again.
    #[cfg(all(target_os = "linux", target_env = "gnu"))]
    #[test]
    fn trimming_gives_freed_memory_back_on_linux() {
        const PIECES: usize = 64 * 1024;
        const PIECE_SIZE: usize = 1024;
        let pieces: Vec<Vec<u8>> = (0..PIECES).map(|i| vec![(i % 251) as u8; PIECE_SIZE]).collect();
        let full = process_stats().0;
        drop(pieces);
        let before_trim = process_stats().0;
        trim_memory();
        let after_trim = process_stats().0;
        assert!(full > 0.0, "the resident size is measured");
        assert!(after_trim <= before_trim, "trimming never grows the resident size");
        assert!(
            after_trim < full - 16.0,
            "most of the 64 MB went back: {full} MB, then {after_trim} MB"
        );
    }

    #[test]
    fn the_resident_size_is_read_from_a_linux_status_file() {
        let status = "Name:\tkeyoverlay\nVmPeak:\t  900000 kB\nVmRSS:\t   20480 kB\nThreads:\t9\n";
        assert_eq!(vm_rss_mb(status), Some(20.0));
        assert_eq!(vm_rss_mb("Name:\tx\n"), None);
        assert_eq!(vm_rss_mb("VmRSS: lots kB\n"), None);
    }

    #[cfg(any(windows, target_os = "macos", target_os = "linux"))]
    #[test]
    fn this_program_has_memory_and_open_handles_where_they_are_measured() {
        let (memory_mb, handles) = process_stats();
        assert!(memory_mb > 0.0, "memory should be measured");
        assert!(handles.is_some_and(|count| count > 0), "open handles should be counted");
    }

    #[test]
    fn opening_the_app_again_shows_settings_only_when_no_window_is_showing() {
        assert!(reopen_opens_settings(false));
        assert!(
            !reopen_opens_settings(true),
            "a window already there is just brought forward by macOS"
        );
    }

    #[test]
    fn our_menu_items_map_to_their_actions_and_others_to_nothing() {
        assert_eq!(app_menu_action("app-quit"), Some(AppMenuAction::Quit));
        assert_eq!(
            app_menu_action("app-settings"),
            None,
            "there is no Settings item: the menu only exists while the window is open"
        );
        assert_eq!(app_menu_action("copy"), None);
        assert_eq!(app_menu_action(""), None);
    }

    #[test]
    fn minimizing_follows_the_setting_except_on_a_mac_where_it_minimizes() {
        assert_eq!(minimize_closes_window(true), !cfg!(target_os = "macos"));
        assert!(!minimize_closes_window(false));
    }

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
