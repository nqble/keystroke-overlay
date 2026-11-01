//! Shared application state and the small helpers every module uses.

use crate::server::{ServerHandle, Shared};
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, Submenu};
use tauri::tray::TrayIcon;
use tauri::{AppHandle, Emitter, Manager};

/// Tray menu items we need to re-check when settings change from elsewhere.
pub struct TrayItems {
    pub pause: CheckMenuItem<tauri::Wry>,
    pub layouts: Vec<(String, CheckMenuItem<tauri::Wry>)>,
    pub layout_menu: Submenu<tauri::Wry>,
    /// Show keyboard / mouse / controller, by input name (input_kinds.rs).
    pub shown: Vec<(String, CheckMenuItem<tauri::Wry>)>,
    /// The tray menu, the "Update available" entry that is added at its top while an update exists, and the two icons.
    pub menu: Menu<tauri::Wry>,
    pub update_item: MenuItem<tauri::Wry>,
    pub update_shown: bool,
    pub icon: Image<'static>,
    pub icon_badged: Image<'static>,
    pub tray: TrayIcon<tauri::Wry>,
}

pub struct AppState {
    pub shared: Arc<Shared>,
    pub server: Mutex<Option<ServerHandle>>,
    pub server_error: Mutex<Option<String>>,
    pub tray: Mutex<Option<TrayItems>>,
    /// Last update-check result (checked at, channel, result) so the check runs at most once an hour.
    pub update_cache: Mutex<Option<(std::time::Instant, String, Value)>>,
    /// True until the user has been shown the "What's new" window for this version.
    pub whats_new: AtomicBool,
    /// True on a brand-new install until the first run setup screen has been closed (settings::is_first_run).
    pub first_run: AtomicBool,
    /// A settings tab to open as soon as a freshly created settings window is ready (set by the tray's "Update
    /// available").
    pub pending_tab: Mutex<Option<String>>,
    /// Wakes the background update check after a settings change, so it can wait without a timer while it is off.
    pub auto_check_changed: tokio::sync::Notify,
}

pub fn port_of(shared: &Shared) -> u16 {
    shared.settings.read().unwrap()["general"]["port"]
        .as_u64()
        .unwrap_or(7878) as u16
}
/// The address to paste into OBS. With the optional secure link on it carries the private key.
pub fn obs_url(shared: &Shared) -> String {
    let base = format!("http://localhost:{}/", port_of(shared));
    let st = shared.settings.read().unwrap();
    let key = st["general"]["linkKey"].as_str().unwrap_or("");
    if st["general"]["secureLink"].as_bool().unwrap_or(false) && !key.is_empty() {
        format!("{base}?key={key}")
    } else {
        base
    }
}

/// Re-check the tray's Pause / Layout items to match the real state.
pub fn sync_tray(app: &AppHandle) {
    let st = app.state::<AppState>();
    let cur = st.shared.settings.read().unwrap()["layout"]["id"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let paused = st.shared.bus.paused.load(Ordering::Relaxed);
    let inputs: Vec<(String, bool, bool)> = {
        let current = st.shared.settings.read().unwrap();
        crate::input_kinds::INPUT_KINDS
            .iter()
            .map(|kind| {
                let enabled = crate::input_kinds::input_enabled(&current, kind);
                (
                    kind.to_string(),
                    enabled,
                    enabled && crate::input_kinds::input_shown(&current, kind),
                )
            })
            .collect()
    };
    // Copy the items out and release the lock first: setting a check mark hops to the main thread, which may be
    // waiting for this same lock (a tray click), and holding it here could freeze the app.
    let (pause, layouts, shown) = {
        let guard = st.tray.lock().unwrap();
        match guard.as_ref() {
            Some(t) => (t.pause.clone(), t.layouts.clone(), t.shown.clone()),
            None => return,
        }
    };
    let _ = pause.set_checked(paused);
    for (id, item) in &layouts {
        let _ = item.set_checked(*id == cur);
    }
    for (kind, item) in &shown {
        if let Some((_, enabled, checked)) = inputs.iter().find(|(name, _, _)| name == kind) {
            let _ = item.set_enabled(*enabled);
            let _ = item.set_checked(*checked);
        }
    }
}

/// Tell overlays (WebSocket) and the settings window that something changed.
pub fn announce(app: &AppHandle) {
    let st = app.state::<AppState>();
    let _ = st.shared.cfg_tx.send("cfg");
    let _ = app.emit("settings-changed", ());
}

/// The selected update channel ("stable" unless the user chose "latest").
pub fn channel_of_settings(settings: &Value) -> String {
    settings["general"]["updateChannel"]
        .as_str()
        .unwrap_or("stable")
        .to_string()
}

/// Tells the settings window each time an OBS overlay connects or disconnects, for its "Live in OBS" status.
/// The task sleeps on the watch channel between changes, so it costs nothing while idle.
pub fn forward_overlay_count(app: AppHandle, shared: &Arc<Shared>) {
    let mut overlays = shared.overlays.subscribe();
    tauri::async_runtime::spawn(async move {
        while overlays.changed().await.is_ok() {
            let count = *overlays.borrow_and_update();
            // important for bug reports: "the overlay is blank" usually means OBS isn't connected
            crate::debug::log(format!("OBS overlay pages connected: {count}"));
            let _ = app.emit("overlays-changed", count);
        }
    });
}
