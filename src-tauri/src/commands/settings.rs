//! App state, saving settings, port and autostart.

use crate::server;
use crate::settings;
use crate::state::{obs_url, sync_tray, AppState};
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, State};
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
    })
}

/// Persist settings from the UI. Port, autostart and lastSeenVersion have their own paths
/// (side effects / app-managed), so the UI's copy never overwrites them.
#[tauri::command]
pub fn save_settings(app: AppHandle, st: State<AppState>, settings: Value) -> Result<(), String> {
    let mut new = settings::migrate(settings);
    {
        let cur = st.shared.settings.read().unwrap();
        for k in ["port", "autostart", "lastSeenVersion", "inputMethod"] { new["general"][k] = cur["general"][k].clone(); }
    }
    let channel_changed = st.shared.settings.read().unwrap()["general"]["updateChannel"] != new["general"]["updateChannel"];
    settings::save(&st.shared.paths.settings(), &new).map_err(|e| e.to_string())?;
    *st.shared.settings.write().unwrap() = new;
    if channel_changed { *st.update_cache.lock().unwrap() = None; }   // a different channel needs a fresh check
    let _ = st.shared.cfg_tx.send("cfg");
    sync_tray(&app);
    Ok(())
}

#[tauri::command]
pub fn set_port(st: State<AppState>, port: u16) -> Result<String, String> {
    if port < 1024 { return Err("Choose a port between 1024 and 65535".into()); }
    let mut srv = st.server.lock().unwrap();
    if srv.as_ref().is_some_and(|s| s.port == port) { return Ok(obs_url(&st.shared)); }
    let new = server::start(st.shared.clone(), port)?; // bind first: on failure the old server keeps running
    if let Some(old) = srv.replace(new) { old.stop(); }
    *st.server_error.lock().unwrap() = None;
    let mut s = st.shared.settings.write().unwrap();
    s["general"]["port"] = json!(port);
    let _ = settings::save(&st.shared.paths.settings(), &s);
    drop(s);
    let _ = st.shared.cfg_tx.send("cfg");
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
pub fn list_layouts(st: State<AppState>) -> Vec<Value> { server::layouts(&st.shared.paths) }

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
    let mut s = st.shared.settings.write().unwrap();
    s["general"]["inputMethod"] = json!(m.id());
    let _ = settings::save(&st.shared.paths.settings(), &s);
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) { app.exit(0); }
