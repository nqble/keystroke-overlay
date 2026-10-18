//! The settings window: created on demand, destroyed on close (so no WebView2 process runs while it is closed).

use crate::state::AppState;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

/// After the settings window closes, wait this long (so its web view has really been torn down) before asking Windows
/// to take back the memory the window used.
const TRIM_MEMORY_AFTER_MS: u64 = 1500;

/// macOS sends no "resized" event when the yellow button minimizes the window, but the window loses focus. A moment after
/// that (once the minimize has really happened) it is checked once, and a minimized window is closed to the tray.
const MINIMIZE_CHECK_DELAY_MS: u64 = 400;

pub fn open_settings(app: &AppHandle) {
    if let Some(settings_window) = app.get_webview_window("settings") {
        let _ = settings_window.unminimize();
        let _ = settings_window.set_focus();
        return;
    }
    crate::debug::detail("settings window opened");
    let builder = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("index.html".into()))
        .title(crate::app_info::NAME)   // still used by the taskbar and Alt+Tab
        .shadow(true)
        .inner_size(1060.0, 800.0)
        .min_inner_size(820.0, 600.0)
        .theme(Some(tauri::Theme::Dark))
        // Same colour as the page: the window appears instantly dark instead of flashing white
        // while the web view loads.
        .background_color(tauri::window::Color(18, 20, 26, 255))
        // One renderer process for the settings page + its preview frame instead of two (about 55 MB less
        // while the window is open, measured). Both pages are our own local content. The first flag keeps
        // Tauri's default WebView2 flags.
        .additional_browser_args("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-site-isolation-trials --renderer-process-limit=1");
    crate::platform::set_dock_icon_visible(app, true);
    let _ = crate::platform::style_settings_window(builder).build();
}

/// Opens the settings window on a specific tab (used by the tray's "Update available" entry).
/// An already open window is told to switch tab; a new one reads the request when it starts.
pub fn open_settings_tab(app: &AppHandle, tab: &str) {
    if app.get_webview_window("settings").is_some() {
        open_settings(app);
        let _ = app.emit("goto-tab", tab.to_string());
    } else {
        *app.state::<AppState>().pending_tab.lock().unwrap() = Some(tab.to_string());
        open_settings_async(app);
    }
}

/// Window creation must not run on the thread handling a tray click, so it is spawned.
pub fn open_settings_async(app: &AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move { open_settings(&app_handle) });
}

/// Window events: "minimize to tray" destroys the window, and closing it releases memory.
pub fn on_event(win: &tauri::Window, ev: &WindowEvent) {
    if win.label() != "settings" {
        return;
    }
    if let WindowEvent::Destroyed = ev {
        crate::platform::set_dock_icon_visible(win.app_handle(), false);
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(TRIM_MEMORY_AFTER_MS));
            crate::platform::trim_memory();
        });
    }
    match ev {
        WindowEvent::Resized(_) => close_if_minimized(win),
        WindowEvent::Focused(false) if crate::platform::minimize_needs_focus_check() => {
            // See MINIMIZE_CHECK_DELAY_MS.
            let win = win.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(MINIMIZE_CHECK_DELAY_MS));
                close_if_minimized(&win);
            });
        }
        _ => {}
    }
}

/// "Minimize to tray": a minimized settings window is closed instead (always on a Mac, see platform::minimize_closes_window).
fn close_if_minimized(win: &tauri::Window) {
    let st = win.state::<AppState>();
    let minimize_to_tray = st.shared.settings.read().unwrap()["general"]["minimizeToTray"]
        .as_bool()
        .unwrap_or(true);
    if crate::platform::minimize_closes_window(minimize_to_tray) && win.is_minimized().unwrap_or(false) {
        let _ = win.close();
    }
}
