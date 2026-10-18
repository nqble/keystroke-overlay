//! App state, saving settings, port and autostart.

use crate::server;
use crate::settings;
use crate::state::{obs_url, sync_tray, AppState};
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_clipboard_manager::ClipboardExt as _;

#[tauri::command]
pub fn get_state(st: State<AppState>) -> Value {
    json!({
        "settings": *st.shared.settings.read().unwrap(),
        "url": obs_url(&st.shared),
        "serverError": *st.server_error.lock().unwrap(),
        "version": env!("CARGO_PKG_VERSION"),
        "paused": st.shared.bus.paused.load(Ordering::Relaxed),
        "overlays": *st.shared.overlays.borrow(),
        "whatsNew": st.whats_new.load(Ordering::Relaxed),
        "firstRun": st.first_run.load(Ordering::Relaxed),
        "inputError": st.shared.bus.error(),
        "inputActive": st.shared.bus.method().id(),
        "platform": crate::platform::name(),
        "keyboardAccess": super::keyboard_access::status(&st.shared.bus),
        "secureLink": st.shared.settings.read().unwrap()["general"]["secureLink"],
        "gotoTab": st.pending_tab.lock().unwrap().take(),
        "updateBadge": st.tray.lock().unwrap().as_ref().is_some_and(|t| t.update_shown),
    })
}

/// The first run setup screen was closed: don't show it again by itself (General can still open it).
#[tauri::command]
pub fn ack_first_run(st: State<AppState>) {
    st.first_run.store(false, Ordering::Relaxed);
}

/// Persist settings from the UI. Port, autostart and lastSeenVersion have their own paths
/// (side effects / app-managed), so the UI's copy never overwrites them.
#[tauri::command]
pub fn save_settings(app: AppHandle, st: State<AppState>, settings: Value) -> Result<(), String> {
    let mut new = settings::migrate(settings);
    {
        let cur = st.shared.settings.read().unwrap();
        for k in [
            "port",
            "autostart",
            "lastSeenVersion",
            "inputMethod",
            "secureLink",
            "linkKey",
        ] {
            new["general"][k] = cur["general"][k].clone();
        }
        new["hotkeys"] = cur["hotkeys"].clone(); // changed only through set_pause_hotkey, which registers it
    }
    crate::debug::set_enabled(new["general"]["debugMode"].as_bool().unwrap_or(false));
    let channel_changed =
        st.shared.settings.read().unwrap()["general"]["updateChannel"] != new["general"]["updateChannel"];
    let order_changed = st.shared.settings.read().unwrap()["layout"]["order"] != new["layout"]["order"];
    let labels_changed = st.shared.settings.read().unwrap()["style"]["keyLabels"] != new["style"]["keyLabels"];
    settings::save(&st.shared.paths.settings(), &new).map_err(|e| {
        crate::debug::log(format!("settings could not be saved: {e}"));
        e.to_string()
    })?;
    *st.shared.settings.write().unwrap() = new;
    if channel_changed {
        *st.update_cache.lock().unwrap() = None;
    } // a different channel needs a fresh check
    let _ = st.shared.cfg_tx.send("cfg");
    if labels_changed {
        let _ = st.shared.cfg_tx.send("assets"); // the overlay re-fetches the layouts, now with the other labels
        let _ = app.emit("settings-changed", ()); // and so does the settings window
    }
    st.auto_check_changed.notify_one(); // "Check for updates automatically" may have changed
    if order_changed {
        crate::tray::refresh_tray_layouts(&app); // the tray's Layout menu follows the Layout tab's order
    }
    sync_tray(&app);
    Ok(())
}

#[tauri::command]
pub fn set_port(st: State<AppState>, port: u16) -> Result<String, String> {
    if port < 1024 {
        return Err("Choose a port between 1024 and 65535".into());
    }
    let mut srv = st.server.lock().unwrap();
    if srv.as_ref().is_some_and(|s| s.port == port) {
        return Ok(obs_url(&st.shared));
    }
    let new = server::start(st.shared.clone(), port)?; // bind first: on failure the old server keeps running
    if let Some(old) = srv.replace(new) {
        old.stop();
    }
    *st.server_error.lock().unwrap() = None;
    let mut current_settings = st.shared.settings.write().unwrap();
    current_settings["general"]["port"] = json!(port);
    let _ = settings::save(&st.shared.paths.settings(), &current_settings);
    drop(current_settings);
    let _ = st.shared.cfg_tx.send("cfg");
    crate::debug::log(format!("port changed to {port}"));
    Ok(obs_url(&st.shared))
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, st: State<AppState>, enabled: bool) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    (if enabled {
        autolaunch.enable()
    } else {
        autolaunch.disable()
    })
    .map_err(|e| e.to_string())?;
    let mut current_settings = st.shared.settings.write().unwrap();
    current_settings["general"]["autostart"] = json!(enabled);
    let _ = settings::save(&st.shared.paths.settings(), &current_settings);
    Ok(())
}

#[tauri::command]
pub fn list_layouts(st: State<AppState>) -> Vec<Value> {
    crate::key_labels::layouts_to_show(&st.shared.paths, &st.shared.settings.read().unwrap())
}

#[tauri::command]
pub fn copy_text(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

/// Switch how keys are read ("hook" or "rawinput"). Takes effect immediately; if the new method can't start,
/// the old one keeps running and an error is returned. Saved only on success.
#[tauri::command]
pub fn set_input_method(st: State<AppState>, method: String) -> Result<(), String> {
    let input_method = crate::keyboard::Method::parse(&method).ok_or("Unknown input method")?;
    st.shared.bus.set_method(input_method).map_err(|e| {
        crate::debug::log(format!(
            "keyboard input ({}) could not start, kept the old one: {e}",
            input_method.id()
        ));
        e
    })?;
    crate::debug::log(format!("keyboard input method is now {}", input_method.id()));
    let mut current_settings = st.shared.settings.write().unwrap();
    current_settings["general"]["inputMethod"] = json!(input_method.id());
    let _ = settings::save(&st.shared.paths.settings(), &current_settings);
    Ok(())
}

/// Turn the optional secure link on or off. Turning it on creates a private key the first time. Existing overlay
/// connections are dropped (the server restarts) so an old link stops working immediately. Returns the new OBS address.
#[tauri::command]
pub async fn set_secure_link(app: AppHandle, enabled: bool) -> Result<String, String> {
    {
        let st = app.state::<AppState>();
        let mut current_settings = st.shared.settings.write().unwrap();
        if enabled && current_settings["general"]["linkKey"].as_str().unwrap_or("").is_empty() {
            current_settings["general"]["linkKey"] = json!(settings::new_key()?);
        }
        current_settings["general"]["secureLink"] = json!(enabled);
        crate::debug::log(format!("secure link {}", if enabled { "on" } else { "off" }));
        settings::save(&st.shared.paths.settings(), &current_settings).map_err(|e| e.to_string())?;
    }
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || crate::tray::restart_server_inner(&app_handle))
        .await
        .map_err(|e| e.to_string())??;
    Ok(obs_url(&app.state::<AppState>().shared))
}

/// Replace the private key: every link made with the old one stops working. Only meaningful while the secure link is
/// on.
#[tauri::command]
pub async fn regenerate_link_key(app: AppHandle) -> Result<String, String> {
    {
        let st = app.state::<AppState>();
        let mut current_settings = st.shared.settings.write().unwrap();
        if !current_settings["general"]["secureLink"].as_bool().unwrap_or(false) {
            return Err("Turn the secure link on first".into());
        }
        current_settings["general"]["linkKey"] = json!(settings::new_key()?);
        settings::save(&st.shared.paths.settings(), &current_settings).map_err(|e| e.to_string())?;
    }
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || crate::tray::restart_server_inner(&app_handle))
        .await
        .map_err(|e| e.to_string())??;
    Ok(obs_url(&app.state::<AppState>().shared))
}

/// Put every setting back to its default. The user's own layouts, presets and fonts are files and are kept.
/// Turns off start-with-Windows and the Compatibility input method, then restarts the server. The port and the secure
/// link are kept so the OBS link doesn't change (see `settings::reset_keeping_link`).
#[tauri::command]
pub async fn reset_settings(app: AppHandle) -> Result<String, String> {
    let _ = app.autolaunch().disable();
    crate::debug::log("all settings reset to defaults");
    {
        let st = app.state::<AppState>();
        let new = settings::reset_keeping_link(&st.shared.settings.read().unwrap());
        let _ = st.shared.bus.set_method(crate::keyboard::Method::Hook);
        settings::save(&st.shared.paths.settings(), &new).map_err(|e| e.to_string())?;
        *st.shared.settings.write().unwrap() = new;
        *st.update_cache.lock().unwrap() = None;
        st.auto_check_changed.notify_one(); // the default turns automatic checks back on
    }
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || crate::tray::restart_server_inner(&app_handle))
        .await
        .map_err(|e| e.to_string())??;
    crate::state::announce(&app);
    crate::tray::refresh_tray_layouts(&app); // the default order is back
    sync_tray(&app);
    Ok(obs_url(&app.state::<AppState>().shared))
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
