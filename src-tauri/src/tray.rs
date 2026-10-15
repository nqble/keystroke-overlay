//! System-tray icon + menu, and the quick actions behind it (also callable from the settings window).

use crate::server::{self, Shared};
use crate::settings;
use crate::state::{announce, obs_url, port_of, sync_tray, AppState, TrayItems};
use crate::window::{open_settings_async, open_settings_tab};
use serde_json::json;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, CheckMenuItemBuilder, IsMenuItem, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt as _;

// ---------------------------------------------------------------- quick actions
pub fn toggle_pause_inner(app: &AppHandle) -> bool {
    let st = app.state::<AppState>();
    let now = !st.shared.bus.paused.load(Ordering::Relaxed);
    st.shared.bus.paused.store(now, Ordering::Relaxed);
    if now {
        st.shared.bus.held.lock().unwrap().clear();
    }
    announce(app);
    sync_tray(app);
    crate::debug::log(format!("overlay {}", if now { "paused" } else { "resumed" }));
    now
}

pub fn set_layout_inner(app: &AppHandle, id: &str) -> Result<(), String> {
    crate::debug::log(format!("layout set to {id}"));
    let st = app.state::<AppState>();
    if !server::layouts(&st.shared.paths).iter().any(|l| l["id"] == id) {
        return Err(format!("Unknown layout: {id}"));
    }
    {
        let mut current_settings = st.shared.settings.write().unwrap();
        current_settings["layout"]["id"] = json!(id);
        settings::save(&st.shared.paths.settings(), &current_settings).map_err(|e| e.to_string())?;
    }
    announce(app);
    sync_tray(app);
    Ok(())
}

/// Draws a small orange dot (with a dark ring so it stays visible on any taskbar) in the top right corner of an RGBA
/// icon.
pub fn badge_rgba(rgba: &[u8], w: u32, h: u32) -> Vec<u8> {
    let mut out = rgba.to_vec();
    let (cx, cy, radius) = (w as f32 * 0.76, h as f32 * 0.24, w as f32 * 0.21);
    let mut blend = |x: u32, y: u32, color: [u8; 3], cover: f32| {
        let i = ((y * w + x) * 4) as usize;
        let alpha = cover.clamp(0.0, 1.0);
        for channel in 0..3 {
            out[i + channel] = (out[i + channel] as f32 * (1.0 - alpha) + color[channel] as f32 * alpha) as u8;
        }
        out[i + 3] = out[i + 3].max((alpha * 255.0) as u8);
    };
    for y in 0..h {
        for x in 0..w {
            let distance = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
            let ring = (radius * 1.3 - distance + 0.5).clamp(0.0, 1.0); // soft edge, about one pixel wide
            if ring > 0.0 {
                blend(x, y, [26, 29, 38], ring);
            }
            let dot = (radius - distance + 0.5).clamp(0.0, 1.0);
            if dot > 0.0 {
                blend(x, y, [255, 138, 0], dot);
            }
        }
    }
    out
}

/// Shows or hides the update indicator: an orange dot on the tray icon and an "Update available" entry at the top of
/// the menu.
/// The tray lock is released before touching the tray itself: those calls hop to the main thread, and the main thread
/// may be waiting for the same lock (a tray click), which would freeze the app.
pub fn set_update_badge(app: &AppHandle, available: bool) {
    let st = app.state::<AppState>();
    let (tray, menu, item, icon) = {
        let mut guard = st.tray.lock().unwrap();
        let Some(tray_items) = guard.as_mut() else { return };
        if tray_items.update_shown == available {
            return;
        }
        tray_items.update_shown = available;
        (
            tray_items.tray.clone(),
            tray_items.menu.clone(),
            tray_items.update_item.clone(),
            if available {
                tray_items.icon_badged.clone()
            } else {
                tray_items.icon.clone()
            },
        )
    };
    crate::debug::log(format!(
        "tray update indicator {}",
        if available { "shown" } else { "hidden" }
    ));
    let _ = tray.set_icon(Some(icon));
    let _ = tray.set_tooltip(Some(if available {
        "Keystroke Overlay: update available"
    } else {
        "Keystroke Overlay"
    }));
    if available {
        let _ = menu.insert(&item, 0);
    } else {
        let _ = menu.remove(&item);
    }
}

/// Rebuilds the tray's Layout list after a layout was created or deleted (same lock rule as above).
pub fn refresh_tray_layouts(app: &AppHandle) {
    let st = app.state::<AppState>();
    let cur = st.shared.settings.read().unwrap()["layout"]["id"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let (submenu, old) = {
        let mut guard = st.tray.lock().unwrap();
        let Some(tray_items) = guard.as_mut() else { return };
        (tray_items.layout_menu.clone(), std::mem::take(&mut tray_items.layouts))
    };
    for (_, old_item) in &old {
        let _ = submenu.remove(old_item);
    }
    let mut fresh = Vec::new();
    for layout in server::layouts(&st.shared.paths) {
        let id = layout["id"].as_str().unwrap_or("").to_string();
        let name = layout["name"].as_str().unwrap_or(&id).to_string();
        if let Ok(item) = CheckMenuItemBuilder::with_id(format!("layout:{id}"), name)
            .checked(id == cur)
            .build(app)
        {
            let _ = submenu.append(&item);
            fresh.push((id, item));
        }
    }
    let mut guard = st.tray.lock().unwrap();
    if let Some(tray_items) = guard.as_mut() {
        tray_items.layouts = fresh;
    }
}

/// Stops the overlay server and starts it again on the same port. The old listener needs a moment to
/// release the port, so binding is retried briefly.
pub fn restart_server_inner(app: &AppHandle) -> Result<(), String> {
    let st = app.state::<AppState>();
    let port = port_of(&st.shared);
    if let Some(old) = st.server.lock().unwrap().take() {
        old.stop();
    }
    let mut last = String::new();
    for _ in 0..40 {
        match server::start(st.shared.clone(), port) {
            Ok(handle) => {
                *st.server.lock().unwrap() = Some(handle);
                *st.server_error.lock().unwrap() = None;
                crate::debug::log(format!("server running on port {port}"));
                let _ = app.emit("settings-changed", ());
                return Ok(());
            }
            Err(e) => {
                last = e;
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        }
    }
    crate::debug::log(format!("server could not start on port {port}: {last}"));
    *st.server_error.lock().unwrap() = Some(last.clone());
    let _ = app.emit("settings-changed", ());
    open_settings_async(app); // make the problem visible
    Err(last)
}

// ---------------------------------------------------------------- the tray itself
pub fn build(app: &tauri::App, shared: Arc<Shared>) -> tauri::Result<()> {
    let cur_layout = shared.settings.read().unwrap()["layout"]["id"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let pause_item = CheckMenuItemBuilder::with_id("pause", "Pause overlay")
        .checked(false)
        .build(app)?;
    let mut layout_items: Vec<(String, CheckMenuItem<tauri::Wry>)> = Vec::new();
    for layout in server::layouts(&shared.paths) {
        let id = layout["id"].as_str().unwrap_or("").to_string();
        let name = layout["name"].as_str().unwrap_or(&id).to_string();
        let item = CheckMenuItemBuilder::with_id(format!("layout:{id}"), name)
            .checked(id == cur_layout)
            .build(app)?;
        layout_items.push((id, item));
    }
    let refs: Vec<&dyn IsMenuItem<tauri::Wry>> = layout_items
        .iter()
        .map(|(_, i)| i as &dyn IsMenuItem<tauri::Wry>)
        .collect();
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
    let icon = app.default_window_icon().unwrap().clone();
    let icon_badged = Image::new_owned(
        badge_rgba(icon.rgba(), icon.width(), icon.height()),
        icon.width(),
        icon.height(),
    );
    let update_item = MenuItemBuilder::with_id("update", "Update available").build(app)?;

    let tray = TrayIconBuilder::new()
        .icon(icon.clone())
        .tooltip("Keystroke Overlay")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, ev| {
            let id = ev.id().as_ref().to_string();
            match id.as_str() {
                "open" => open_settings_async(app),
                "copy" => {
                    let _ = app.clipboard().write_text(obs_url(&shared));
                }
                "pause" => {
                    toggle_pause_inner(app);
                }
                "restart" => {
                    let app_handle = app.clone();
                    std::thread::spawn(move || {
                        let _ = restart_server_inner(&app_handle);
                    });
                }
                "update" => open_settings_tab(app, "general"),
                "quit" => app.exit(0),
                other => {
                    if let Some(layout_id) = other.strip_prefix("layout:") {
                        if set_layout_inner(app, layout_id).is_err() {
                            sync_tray(app);
                        }
                    }
                }
            }
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = ev
            {
                open_settings_async(tray.app_handle());
            }
        })
        .build(app)?;
    *app.state::<AppState>().tray.lock().unwrap() = Some(TrayItems {
        pause: pause_item,
        layouts: layout_items,
        layout_menu,
        menu,
        update_item,
        update_shown: false,
        icon: icon.to_owned(),
        icon_badged,
        tray,
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::badge_rgba;
    #[test]
    fn badge_paints_an_orange_dot_top_right_and_leaves_the_rest() {
        let (w, h) = (64u32, 64u32);
        let base = vec![40u8; (w * h * 4) as usize];
        let out = badge_rgba(&base, w, h);
        let px = |x: u32, y: u32| {
            let i = ((y * w + x) * 4) as usize;
            [out[i], out[i + 1], out[i + 2]]
        };
        assert_eq!(px((w as f32 * 0.76) as u32, (h as f32 * 0.24) as u32), [255, 138, 0]);
        assert_eq!(px(2, h - 3), [40, 40, 40]);
        assert_eq!(out.len(), base.len());
    }
}
