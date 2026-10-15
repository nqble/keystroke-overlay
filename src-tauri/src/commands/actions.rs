//! Quick actions (the logic lives in `tray.rs` so the tray menu and the settings window share it).

use crate::tray::{restart_server_inner, set_layout_inner, toggle_pause_inner};
use tauri::AppHandle;

#[tauri::command]
pub fn toggle_pause(app: AppHandle) -> bool {
    toggle_pause_inner(&app)
}

#[tauri::command]
pub fn set_layout(app: AppHandle, id: String) -> Result<(), String> {
    set_layout_inner(&app, &id)
}

#[tauri::command]
pub async fn restart_server(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || restart_server_inner(&app))
        .await
        .map_err(|e| e.to_string())?
}
