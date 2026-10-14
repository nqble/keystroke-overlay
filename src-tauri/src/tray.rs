//! System-tray icon + menu, and the quick actions behind it (also callable from the settings window).

use crate::server::{self, Shared};
use crate::settings;
use crate::state::{announce, obs_url, port_of, sync_tray, AppState, TrayItems};
use crate::window::open_settings_async;
use serde_json::json;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::menu::{CheckMenuItem, CheckMenuItemBuilder, IsMenuItem, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt as _;

// ---------------------------------------------------------------- quick actions
pub fn toggle_pause_inner(app: &AppHandle) -> bool {
    let st = app.state::<AppState>();
    let now = !st.shared.bus.paused.load(Ordering::Relaxed);
    st.shared.bus.paused.store(now, Ordering::Relaxed);
    if now { st.shared.bus.held.lock().unwrap().clear(); }
    announce(app);
    sync_tray(app);
    now
}

pub fn set_layout_inner(app: &AppHandle, id: &str) -> Result<(), String> {
    let st = app.state::<AppState>();
    if !server::layouts(&st.shared.paths).iter().any(|l| l["id"] == id) { return Err(format!("Unknown layout: {id}")); }
    {
        let mut s = st.shared.settings.write().unwrap();
        s["layout"]["id"] = json!(id);
        settings::save(&st.shared.paths.settings(), &s).map_err(|e| e.to_string())?;
    }
    announce(app);
    sync_tray(app);
    Ok(())
}

/// Rebuilds the tray's Layout list after a layout was created or deleted.
pub fn refresh_tray_layouts(app: &AppHandle) {
    let st = app.state::<AppState>();
    let cur = st.shared.settings.read().unwrap()["layout"]["id"].as_str().unwrap_or("").to_string();
    let mut guard = st.tray.lock().unwrap();
    let Some(t) = guard.as_mut() else { return };
    for (_, it) in t.layouts.drain(..) { let _ = t.layout_menu.remove(&it); }
    for l in server::layouts(&st.shared.paths) {
        let id = l["id"].as_str().unwrap_or("").to_string();
        let name = l["name"].as_str().unwrap_or(&id).to_string();
        if let Ok(it) = CheckMenuItemBuilder::with_id(format!("layout:{id}"), name).checked(id == cur).build(app) {
            let _ = t.layout_menu.append(&it);
            t.layouts.push((id, it));
        }
    }
}

/// Stops the overlay server and starts it again on the same port. The old listener needs a moment to
/// release the port, so binding is retried briefly.
pub fn restart_server_inner(app: &AppHandle) -> Result<(), String> {
    let st = app.state::<AppState>();
    let port = port_of(&st.shared);
    if let Some(old) = st.server.lock().unwrap().take() { old.stop(); }
    let mut last = String::new();
    for _ in 0..40 {
        match server::start(st.shared.clone(), port) {
            Ok(h) => {
                *st.server.lock().unwrap() = Some(h);
                *st.server_error.lock().unwrap() = None;
                let _ = app.emit("settings-changed", ());
                return Ok(());
            }
            Err(e) => { last = e; std::thread::sleep(std::time::Duration::from_millis(100)); }
        }
    }
    *st.server_error.lock().unwrap() = Some(last.clone());
    let _ = app.emit("settings-changed", ());
    open_settings_async(app); // make the problem visible
    Err(last)
}

// ---------------------------------------------------------------- the tray itself
pub fn build(app: &tauri::App, shared: Arc<Shared>) -> tauri::Result<()> {
    let cur_layout = shared.settings.read().unwrap()["layout"]["id"].as_str().unwrap_or("").to_string();
    let pause_item = CheckMenuItemBuilder::with_id("pause", "Pause overlay").checked(false).build(app)?;
    let mut layout_items: Vec<(String, CheckMenuItem<tauri::Wry>)> = Vec::new();
    for l in server::layouts(&shared.paths) {
        let id = l["id"].as_str().unwrap_or("").to_string();
        let name = l["name"].as_str().unwrap_or(&id).to_string();
        let it = CheckMenuItemBuilder::with_id(format!("layout:{id}"), name).checked(id == cur_layout).build(app)?;
        layout_items.push((id, it));
    }
    let refs: Vec<&dyn IsMenuItem<tauri::Wry>> = layout_items.iter().map(|(_, i)| i as &dyn IsMenuItem<tauri::Wry>).collect();
    let layout_menu = SubmenuBuilder::new(app, "Layout").items(&refs).build()?;
    let menu = MenuBuilder::new(app)
        .item(&MenuItemBuilder::with_id("open", "Open settings").build(app)?)
        .item(&MenuItemBuilder::with_id("copy", "Copy OBS URL").build(app)?)
        .separator()
        .item(&pause_item)
        .item(&layout_menu)
        .item(&MenuItemBuilder::with_id("restart", "Restart server").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("quit", "Quit").build(app)?)
        .build()?;
    *app.state::<AppState>().tray.lock().unwrap() = Some(TrayItems { pause: pause_item, layouts: layout_items, layout_menu });

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Keystroke Overlay")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, ev| {
            let id = ev.id().as_ref().to_string();
            match id.as_str() {
                "open" => open_settings_async(app),
                "copy" => { let _ = app.clipboard().write_text(obs_url(&shared)); }
                "pause" => { toggle_pause_inner(app); }
                "restart" => { let a = app.clone(); std::thread::spawn(move || { let _ = restart_server_inner(&a); }); }
                "quit" => app.exit(0),
                other => if let Some(l) = other.strip_prefix("layout:") {
                    if set_layout_inner(app, l).is_err() { sync_tray(app); }
                },
            }
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                open_settings_async(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}
