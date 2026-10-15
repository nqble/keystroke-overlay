//! App state, saving settings, port and autostart.

use crate::server;
use crate::settings;
use crate::state::{obs_url, sync_tray, AppState};
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, State};
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
        "whatsNew": st.whats_new.load(Ordering::Relaxed),
        "inputError": st.shared.bus.error(),
        "inputActive": st.shared.bus.method().id(),
        "secureLink": st.shared.settings.read().unwrap()["general"]["secureLink"],
        "gotoTab": st.pending_tab.lock().unwrap().take(),
        "updateBadge": st.tray.lock().unwrap().as_ref().is_some_and(|t| t.update_shown),
    })
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
    }
    crate::debug::set_enabled(new["general"]["debugMode"].as_bool().unwrap_or(false));
    let channel_changed =
        st.shared.settings.read().unwrap()["general"]["updateChannel"] != new["general"]["updateChannel"];
    settings::save(&st.shared.paths.settings(), &new).map_err(|e| e.to_string())?;
    *st.shared.settings.write().unwrap() = new;
    if channel_changed {
        *st.update_cache.lock().unwrap() = None;
    } // a different channel needs a fresh check
    let _ = st.shared.cfg_tx.send("cfg");
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
    let mut s = st.shared.settings.write().unwrap();
    s["general"]["port"] = json!(port);
    let _ = settings::save(&st.shared.paths.settings(), &s);
    drop(s);
    let _ = st.shared.cfg_tx.send("cfg");
    crate::debug::log(format!("port changed to {port}"));
    Ok(obs_url(&st.shared))
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, st: State<AppState>, enabled: bool) -> Result<(), String> {
    let al = app.autolaunch();
    (if enabled { al.enable() } else { al.disable() }).map_err(|e| e.to_string())?;
    let mut s = st.shared.settings.write().unwrap();
    s["general"]["autostart"] = json!(enabled);
    let _ = settings::save(&st.shared.paths.settings(), &s);
    Ok(())
}

#[tauri::command]
pub fn list_layouts(st: State<AppState>) -> Vec<Value> {
    server::layouts(&st.shared.paths)
}

#[tauri::command]
pub fn copy_text(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

/// Switch how keys are read ("hook" or "rawinput"). Takes effect immediately; if the new method can't start,
/// the old one keeps running and an error is returned. Saved only on success.
#[tauri::command]
pub fn set_input_method(st: State<AppState>, method: String) -> Result<(), String> {
    let m = crate::keyboard::Method::parse(&method).ok_or("Unknown input method")?;
    st.shared.bus.set_method(m)?;
    crate::debug::log(format!("keyboard input method is now {}", m.id()));
    let mut s = st.shared.settings.write().unwrap();
    s["general"]["inputMethod"] = json!(m.id());
    let _ = settings::save(&st.shared.paths.settings(), &s);
    Ok(())
}

/// Turn the optional secure link on or off. Turning it on creates a private key the first time. Existing overlay
/// connections are dropped (the server restarts) so an old link stops working immediately. Returns the new OBS address.
#[tauri::command]
pub async fn set_secure_link(app: AppHandle, enabled: bool) -> Result<String, String> {
    {
        let st = app.state::<AppState>();
        let mut s = st.shared.settings.write().unwrap();
        if enabled && s["general"]["linkKey"].as_str().unwrap_or("").is_empty() {
            s["general"]["linkKey"] = json!(settings::new_key()?);
        }
        s["general"]["secureLink"] = json!(enabled);
        crate::debug::log(format!("secure link {}", if enabled { "on" } else { "off" }));
        settings::save(&st.shared.paths.settings(), &s).map_err(|e| e.to_string())?;
    }
    let a = app.clone();
    tauri::async_runtime::spawn_blocking(move || crate::tray::restart_server_inner(&a))
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
        let mut s = st.shared.settings.write().unwrap();
        if !s["general"]["secureLink"].as_bool().unwrap_or(false) {
            return Err("Turn the secure link on first".into());
        }
        s["general"]["linkKey"] = json!(settings::new_key()?);
        settings::save(&st.shared.paths.settings(), &s).map_err(|e| e.to_string())?;
    }
    let a = app.clone();
    tauri::async_runtime::spawn_blocking(move || crate::tray::restart_server_inner(&a))
        .await
        .map_err(|e| e.to_string())??;
    Ok(obs_url(&app.state::<AppState>().shared))
}

/// Put every setting back to its default. The user's own layouts, presets and fonts are files and are kept.
/// Turns off start-with-Windows, the secure link and the Compatibility input method, then restarts the server. The port
/// is kept so the OBS link doesn't move.
#[tauri::command]
pub async fn reset_settings(app: AppHandle) -> Result<String, String> {
    let _ = app.autolaunch().disable();
    crate::debug::log("all settings reset to defaults");
    {
        let st = app.state::<AppState>();
        let mut new = settings::defaults();
        {
            let cur = st.shared.settings.read().unwrap();
            for k in ["lastSeenVersion", "port"] {
                new["general"][k] = cur["general"][k].clone();
            }
        }
        let _ = st.shared.bus.set_method(crate::keyboard::Method::Hook);
        settings::save(&st.shared.paths.settings(), &new).map_err(|e| e.to_string())?;
        *st.shared.settings.write().unwrap() = new;
        *st.update_cache.lock().unwrap() = None;
    }
    let a = app.clone();
    tauri::async_runtime::spawn_blocking(move || crate::tray::restart_server_inner(&a))
        .await
        .map_err(|e| e.to_string())??;
    crate::state::announce(&app);
    sync_tray(&app);
    Ok(obs_url(&app.state::<AppState>().shared))
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
