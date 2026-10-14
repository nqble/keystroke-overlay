//! Shared application state and the small helpers every module uses.

use crate::server::{ServerHandle, Shared};
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::menu::CheckMenuItem;
use tauri::{AppHandle, Emitter, Manager};

/// GitHub repository that hosts releases and update manifests.
pub const REPO: &str = "nqble/keystroke-overlay";

/// Tray menu items we need to re-check when settings change from elsewhere.
pub struct TrayItems {
    pub pause: CheckMenuItem<tauri::Wry>,
    pub layouts: Vec<(String, CheckMenuItem<tauri::Wry>)>,
}

pub struct AppState {
    pub shared: Arc<Shared>,
    pub server: Mutex<Option<ServerHandle>>,
    pub server_error: Mutex<Option<String>>,
    pub tray: Mutex<Option<TrayItems>>,
    /// Last update-check result (checked at, channel, result) so the background check runs at most every 6 hours.
    pub update_cache: Mutex<Option<(std::time::Instant, String, Value)>>,
    /// True until the user has been shown the "What's new" window for this version.
    pub whats_new: AtomicBool,
}

pub fn port_of(s: &Shared) -> u16 {
    s.settings.read().unwrap()["general"]["port"].as_u64().unwrap_or(7878) as u16
}
pub fn obs_url(s: &Shared) -> String {
    format!("http://localhost:{}/", port_of(s))
}

/// Re-check the tray's Pause / Layout items to match the real state.
pub fn sync_tray(app: &AppHandle) {
    let st = app.state::<AppState>();
    let cur = st.shared.settings.read().unwrap()["layout"]["id"].as_str().unwrap_or("").to_string();
    let paused = st.shared.bus.paused.load(Ordering::Relaxed);
    let guard = st.tray.lock().unwrap();
    if let Some(t) = guard.as_ref() {
        let _ = t.pause.set_checked(paused);
        for (id, it) in &t.layouts { let _ = it.set_checked(*id == cur); }
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
    settings["general"]["updateChannel"].as_str().unwrap_or("stable").to_string()
}
