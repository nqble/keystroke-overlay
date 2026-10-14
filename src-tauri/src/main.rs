// Hide the console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod keyhook;
mod server;
mod settings;

use serde_json::{json, Value};
use server::{ServerHandle, Shared};
use settings::Paths;
use std::sync::{Arc, Mutex};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_clipboard_manager::ClipboardExt as _;
use tauri_plugin_dialog::DialogExt as _;
use tauri_plugin_updater::UpdaterExt as _;
use tokio::sync::broadcast;

struct AppState {
    shared: Arc<Shared>,
    server: Mutex<Option<ServerHandle>>,
    server_error: Mutex<Option<String>>,
}

fn port_of(s: &Shared) -> u16 {
    s.settings.read().unwrap()["general"]["port"].as_u64().unwrap_or(7878) as u16
}
fn obs_url(s: &Shared) -> String { format!("http://localhost:{}/", port_of(s)) }

// ---------------------------------------------------------------- windows
/// Settings window is created on demand and destroyed on close, so when it is
/// closed no WebView2 process is running at all.
fn open_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.unminimize();
        let _ = w.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("index.html".into()))
        .title("Keystroke Overlay")
        .inner_size(1060.0, 800.0)
        .min_inner_size(820.0, 600.0)
        .theme(Some(tauri::Theme::Dark))
        .build();
}
fn open_settings_async(app: &AppHandle) {
    let a = app.clone();
    tauri::async_runtime::spawn(async move { open_settings(&a) });
}

// ---------------------------------------------------------------- commands
#[tauri::command]
fn get_state(st: State<AppState>) -> Value {
    json!({
        "settings": *st.shared.settings.read().unwrap(),
        "url": obs_url(&st.shared),
        "serverError": *st.server_error.lock().unwrap(),
        "version": env!("CARGO_PKG_VERSION"),
    })
}

/// Persist settings from the UI. Port & autostart have dedicated commands
/// (they have side effects), so they are preserved here.
#[tauri::command]
fn save_settings(st: State<AppState>, settings: Value) -> Result<(), String> {
    let mut new = settings::migrate(settings);
    {
        let cur = st.shared.settings.read().unwrap();
        new["general"]["port"] = cur["general"]["port"].clone();
        new["general"]["autostart"] = cur["general"]["autostart"].clone();
    }
    settings::save(&st.shared.paths.settings(), &new).map_err(|e| e.to_string())?;
    *st.shared.settings.write().unwrap() = new;
    let _ = st.shared.cfg_tx.send(());
    Ok(())
}

#[tauri::command]
fn set_port(st: State<AppState>, port: u16) -> Result<String, String> {
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
    let _ = st.shared.cfg_tx.send(());
    Ok(obs_url(&st.shared))
}

#[tauri::command]
fn set_autostart(app: AppHandle, st: State<AppState>, enabled: bool) -> Result<(), String> {
    let al = app.autolaunch();
    (if enabled { al.enable() } else { al.disable() }).map_err(|e| e.to_string())?;
    let mut s = st.shared.settings.write().unwrap();
    s["general"]["autostart"] = json!(enabled);
    let _ = settings::save(&st.shared.paths.settings(), &s);
    Ok(())
}

#[tauri::command]
fn list_layouts(st: State<AppState>) -> Vec<Value> { server::layouts(&st.shared.paths) }

#[tauri::command]
fn copy_text(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

// ---- fonts
#[tauri::command]
fn list_fonts(st: State<AppState>) -> Vec<String> { server::font_files(&st.shared.paths) }

#[tauri::command]
async fn add_font(app: AppHandle, st: State<'_, AppState>) -> Result<Option<String>, String> {
    let Some(p) = app.dialog().file().add_filter("Fonts", &["ttf", "otf", "woff", "woff2"]).blocking_pick_file() else { return Ok(None) };
    let src = p.into_path().map_err(|e| e.to_string())?;
    let name = src.file_name().and_then(|n| n.to_str()).ok_or("bad file name")?.to_string();
    std::fs::copy(&src, st.shared.paths.fonts().join(&name)).map_err(|e| e.to_string())?;
    let _ = st.shared.cfg_tx.send(());
    Ok(Some(name))
}
#[tauri::command]
fn remove_font(st: State<AppState>, name: String) -> Result<(), String> {
    if name.contains(['/', '\\']) { return Err("bad name".into()); }
    std::fs::remove_file(st.shared.paths.fonts().join(name)).map_err(|e| e.to_string())?;
    let _ = st.shared.cfg_tx.send(());
    Ok(())
}
#[tauri::command]
fn open_folder(st: State<AppState>, kind: String) {
    let p = match kind.as_str() { "fonts" | "presets" | "layouts" | "animations" | "themes" => st.shared.paths.user(&kind), _ => st.shared.paths.root.clone() };
    let _ = std::fs::create_dir_all(&p);
    let _ = std::process::Command::new("explorer").arg(p).spawn();
}

// ---- style presets (style + animation), stored as presets/<name>.json
fn clean_name(n: &str) -> Result<String, String> {
    let n: String = n.trim().chars().filter(|c| !r#"\/:*?"<>|"#.contains(*c)).collect();
    if n.is_empty() { Err("Enter a preset name".into()) } else { Ok(n) }
}
#[tauri::command]
fn list_presets(st: State<AppState>) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(st.shared.paths.presets()).into_iter().flatten().flatten()
        .filter_map(|e| e.path().file_stem()?.to_str().map(String::from)).collect();
    v.sort();
    v
}
#[tauri::command]
fn save_preset(st: State<AppState>, name: String, data: Value) -> Result<(), String> {
    let p = st.shared.paths.presets().join(format!("{}.json", clean_name(&name)?));
    std::fs::write(p, serde_json::to_string_pretty(&data).unwrap()).map_err(|e| e.to_string())
}
#[tauri::command]
fn load_preset(st: State<AppState>, name: String) -> Result<Value, String> {
    let p = st.shared.paths.presets().join(format!("{}.json", clean_name(&name)?));
    serde_json::from_str(&std::fs::read_to_string(p).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
#[tauri::command]
fn delete_preset(st: State<AppState>, name: String) -> Result<(), String> {
    std::fs::remove_file(st.shared.paths.presets().join(format!("{}.json", clean_name(&name)?))).map_err(|e| e.to_string())
}
#[tauri::command]
async fn export_preset(app: AppHandle, data: Value) -> Result<bool, String> {
    let Some(p) = app.dialog().file().add_filter("Style preset", &["json"]).set_file_name("my-style.json").blocking_save_file() else { return Ok(false) };
    let path = p.into_path().map_err(|e| e.to_string())?;
    std::fs::write(path, serde_json::to_string_pretty(&data).unwrap()).map_err(|e| e.to_string())?;
    Ok(true)
}
#[tauri::command]
async fn import_preset(app: AppHandle) -> Result<Option<Value>, String> {
    let Some(p) = app.dialog().file().add_filter("Style preset", &["json"]).blocking_pick_file() else { return Ok(None) };
    let path = p.into_path().map_err(|e| e.to_string())?;
    let v: Value = serde_json::from_str(&std::fs::read_to_string(path).map_err(|e| e.to_string())?).map_err(|e| format!("Not a valid preset: {e}"))?;
    Ok(Some(v))
}

// ---- updates (only contacts GitHub when asked; sends nothing but the version header)
#[tauri::command]
async fn check_update(app: AppHandle) -> Result<Value, String> {
    let upd = app.updater().map_err(|e| e.to_string())?;
    match upd.check().await.map_err(|e| format!("Couldn't check for updates: {e}"))? {
        Some(u) => {
            // latest.json may carry "manual": true (+ "manual_url") for updates the in-app installer can't apply.
            let manual = u.raw_json.get("manual").and_then(|v| v.as_bool()).unwrap_or(false);
            let url = u.raw_json.get("manual_url").and_then(|v| v.as_str()).unwrap_or(RELEASES_URL);
            Ok(json!({ "available": true, "version": u.version, "notes": u.body, "current": u.current_version, "manual": manual, "url": url }))
        }
        None => Ok(json!({ "available": false, "current": env!("CARGO_PKG_VERSION") })),
    }
}
const RELEASES_URL: &str = "https://github.com/nqble/keystroke-overlay/releases/latest";

/// Opens the project's GitHub page in the default browser. Only this repo's URLs are allowed.
#[tauri::command]
fn open_release_page(url: String) -> Result<(), String> {
    if !url.starts_with("https://github.com/nqble/keystroke-overlay/") { return Err("Blocked link".into()); }
    std::process::Command::new("explorer").arg(url).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Downloads, verifies the signature, installs, then restarts into the new version.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    let upd = app.updater().map_err(|e| e.to_string())?;
    let Some(u) = upd.check().await.map_err(|e| e.to_string())? else { return Err("Already up to date".into()) };
    u.download_and_install(|_, _| {}, || {}).await.map_err(|e| format!("Update failed: {e}"))?;
    app.restart();
}

#[tauri::command]
fn quit_app(app: AppHandle) { app.exit(0); }

// ---------------------------------------------------------------- main
fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| open_settings_async(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--autostart"])))
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            let paths = Paths { root };
            paths.ensure();
            let cfg = settings::load(&paths.settings());
            let _ = settings::save(&paths.settings(), &cfg); // persists migrations/new defaults
            let port = cfg["general"]["port"].as_u64().unwrap_or(7878) as u16;
            let open_on_launch = cfg["general"]["openOnLaunch"].as_bool().unwrap_or(true);

            let (cfg_tx, _) = broadcast::channel(8);
            let shared = Arc::new(Shared { bus: keyhook::start(), settings: cfg.into(), paths, cfg_tx });
            let (srv, err) = match server::start(shared.clone(), port) {
                Ok(h) => (Some(h), None),
                Err(e) => (None, Some(e)),
            };
            app.manage(AppState { shared: shared.clone(), server: Mutex::new(srv), server_error: Mutex::new(err) });

            // ---- tray
            let menu = MenuBuilder::new(app)
                .item(&MenuItemBuilder::with_id("open", "Open settings").build(app)?)
                .item(&MenuItemBuilder::with_id("copy", "Copy OBS URL").build(app)?)
                .separator()
                .item(&MenuItemBuilder::with_id("quit", "Quit").build(app)?)
                .build()?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Keystroke Overlay")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, ev| match ev.id().as_ref() {
                    "open" => open_settings_async(app),
                    "copy" => { let _ = app.clipboard().write_text(obs_url(&shared)); }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                        open_settings_async(tray.app_handle());
                    }
                })
                .build(app)?;

            let autostarted = std::env::args().any(|a| a == "--autostart");
            let server_failed = app.state::<AppState>().server_error.lock().unwrap().is_some();
            // Always show the window if the overlay server couldn't start (e.g. port taken), so the problem is visible.
            if server_failed || (open_on_launch && !autostarted) { open_settings_async(app.handle()); }
            Ok(())
        })
        .on_window_event(|win, ev| {
            // "Minimize to tray": minimizing the settings window destroys it.
            if win.label() == "settings" {
                if let WindowEvent::Destroyed = ev {
                    // Hand freed pages back to Windows so the tray-only footprint drops back down.
                    std::thread::spawn(|| {
                        std::thread::sleep(std::time::Duration::from_millis(1500));
                        unsafe { let _ = windows::Win32::System::ProcessStatus::EmptyWorkingSet(windows::Win32::System::Threading::GetCurrentProcess()); }
                    });
                }
                if let WindowEvent::Resized(_) = ev {
                    let st = win.state::<AppState>();
                    let mtt = st.shared.settings.read().unwrap()["general"]["minimizeToTray"].as_bool().unwrap_or(true);
                    if mtt && win.is_minimized().unwrap_or(false) { let _ = win.close(); }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_state, save_settings, set_port, set_autostart, list_layouts, copy_text,
            list_fonts, add_font, remove_font, open_folder,
            list_presets, save_preset, load_preset, delete_preset, export_preset, import_preset, quit_app,
            check_update, install_update, open_release_page
        ])
        .build(tauri::generate_context!())
        .expect("failed to build app");

    app.run(|_, ev| {
        // Keep running in the tray when the last window closes.
        if let RunEvent::ExitRequested { api, code, .. } = ev {
            if code.is_none() { api.prevent_exit(); }
        }
    });
}
