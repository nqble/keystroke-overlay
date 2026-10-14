// Hide the console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod keyhook;
mod server;
mod settings;

use serde_json::{json, Value};
use server::{ServerHandle, Shared};
use settings::Paths;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::menu::{CheckMenuItem, CheckMenuItemBuilder, IsMenuItem, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_clipboard_manager::ClipboardExt as _;
use tauri_plugin_dialog::DialogExt as _;
use tauri_plugin_updater::UpdaterExt as _;
use tokio::sync::broadcast;

/// Tray menu items we need to re-check when settings change from elsewhere.
struct TrayItems {
    pause: CheckMenuItem<tauri::Wry>,
    layouts: Vec<(String, CheckMenuItem<tauri::Wry>)>,
}

struct AppState {
    shared: Arc<Shared>,
    server: Mutex<Option<ServerHandle>>,
    server_error: Mutex<Option<String>>,
    tray: Mutex<Option<TrayItems>>,
    /// Last update-check result (checked at, channel, result) so the background check runs at most every 6 hours.
    update_cache: Mutex<Option<(std::time::Instant, String, Value)>>,
    /// True until the user has been shown the "What's new" window for this version.
    whats_new: AtomicBool,
}

const REPO: &str = "nqble/keystroke-overlay";

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
        // Same colour as the page: the window appears instantly dark instead of flashing white
        // while WebView2 loads.
        .background_color(tauri::window::Color(18, 20, 26, 255))
        // One renderer process for the settings page + its preview frame instead of two (about 55 MB less
        // while the window is open, measured). Both pages are our own local content. The first flag keeps
        // Tauri's default WebView2 flags.
        .additional_browser_args("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-site-isolation-trials --renderer-process-limit=1")
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
        "paused": st.shared.bus.paused.load(Ordering::Relaxed),
        "whatsNew": st.whats_new.load(Ordering::Relaxed),
    })
}

/// Re-check the tray's Pause / Layout items to match the real state.
fn sync_tray(app: &AppHandle) {
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
fn announce(app: &AppHandle) {
    let st = app.state::<AppState>();
    let _ = st.shared.cfg_tx.send("cfg");
    let _ = app.emit("settings-changed", ());
}

/// Persist settings from the UI. Port & autostart have dedicated commands
/// (they have side effects), so they are preserved here.
#[tauri::command]
fn save_settings(app: AppHandle, st: State<AppState>, settings: Value) -> Result<(), String> {
    let mut new = settings::migrate(settings);
    {
        // These have their own commands (side effects / app-managed), so the UI's copy never overwrites them.
        let cur = st.shared.settings.read().unwrap();
        for k in ["port", "autostart", "lastSeenVersion"] { new["general"][k] = cur["general"][k].clone(); }
    }
    let channel_changed = st.shared.settings.read().unwrap()["general"]["updateChannel"] != new["general"]["updateChannel"];
    settings::save(&st.shared.paths.settings(), &new).map_err(|e| e.to_string())?;
    *st.shared.settings.write().unwrap() = new;
    if channel_changed { *st.update_cache.lock().unwrap() = None; }   // a different channel needs a fresh check
    let _ = st.shared.cfg_tx.send("cfg");
    sync_tray(&app);
    Ok(())
}

// ---- tray quick actions (also callable from the settings window)
fn toggle_pause_inner(app: &AppHandle) -> bool {
    let st = app.state::<AppState>();
    let now = !st.shared.bus.paused.load(Ordering::Relaxed);
    st.shared.bus.paused.store(now, Ordering::Relaxed);
    if now { st.shared.bus.held.lock().unwrap().clear(); }
    announce(app);
    sync_tray(app);
    now
}
fn set_layout_inner(app: &AppHandle, id: &str) -> Result<(), String> {
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
/// Stops the overlay server and starts it again on the same port. The old listener needs a moment to
/// release the port, so binding is retried briefly.
fn restart_server_inner(app: &AppHandle) -> Result<(), String> {
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

#[tauri::command]
fn toggle_pause(app: AppHandle) -> bool { toggle_pause_inner(&app) }
#[tauri::command]
fn set_layout(app: AppHandle, id: String) -> Result<(), String> { set_layout_inner(&app, &id) }
#[tauri::command]
async fn restart_server(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || restart_server_inner(&app)).await.map_err(|e| e.to_string())?
}

// ---- "What's new"
#[tauri::command]
fn ack_whats_new(st: State<AppState>) {
    st.whats_new.store(false, Ordering::Relaxed);
    let mut s = st.shared.settings.write().unwrap();
    s["general"]["lastSeenVersion"] = json!(env!("CARGO_PKG_VERSION"));
    let _ = settings::save(&st.shared.paths.settings(), &s);
}

fn release_notes_from(j: &Value, ver: &str) -> Value {
    let body: String = j["body"].as_str().unwrap_or("").chars().take(20000).collect();
    json!({
        "version": ver,
        "title": j["name"].as_str().filter(|s| !s.is_empty()).map(String::from).unwrap_or_else(|| format!("v{ver}")),
        "body": body,
        "url": j["html_url"].as_str().unwrap_or("")
    })
}

/// Fetches the GitHub release notes for a version (default: the running one). Contacts GitHub only
/// when the user opens "What's new" / "View release notes".
#[tauri::command]
async fn get_release_notes(version: Option<String>) -> Result<Value, String> {
    let ver = version.unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string());
    if ver.is_empty() || !ver.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') { return Err("Bad version".into()); }
    let client = reqwest::Client::builder()
        .user_agent(concat!("KeystrokeOverlay/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(8))
        .build().map_err(|e| e.to_string())?;
    let resp = client.get(format!("https://api.github.com/repos/{REPO}/releases/tags/v{ver}"))
        .header("Accept", "application/vnd.github+json").send().await
        .map_err(|_| "Couldn't reach GitHub. Check your internet connection.".to_string())?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND { return Err(format!("No release notes are published for v{ver} yet.")); }
    if !resp.status().is_success() { return Err(format!("GitHub returned an error ({}).", resp.status())); }
    let j: Value = resp.json().await.map_err(|_| "GitHub sent something unexpected.".to_string())?;
    Ok(release_notes_from(&j, &ver))
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
    let _ = st.shared.cfg_tx.send("cfg");
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
    let _ = st.shared.cfg_tx.send("assets");
    Ok(Some(name))
}
#[tauri::command]
fn remove_font(st: State<AppState>, name: String) -> Result<(), String> {
    if name.contains(['/', '\\']) { return Err("bad name".into()); }
    std::fs::remove_file(st.shared.paths.fonts().join(name)).map_err(|e| e.to_string())?;
    let _ = st.shared.cfg_tx.send("assets");
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

// ---- updates (contacts GitHub only for the optional background check or when asked; sends nothing but the version)
const GITHUB: &str = "https://github.com/nqble/keystroke-overlay/releases";
const RELEASES_URL: &str = "https://github.com/nqble/keystroke-overlay/releases/latest";

/// Where each channel's update manifest lives:
///   latest -> latest.json on the newest GitHub release (uploaded with every release)
///   stable -> stable.json on the fixed "channel-stable" release (replaced only when you promote a release)
/// KEYOVERLAY_TEST_UPDATE_BASE is a build-time override used by test builds only; release builds never set it.
fn manifest_url(channel: &str) -> String {
    if let Some(base) = option_env!("KEYOVERLAY_TEST_UPDATE_BASE") {
        return format!("{base}/{}.json", if channel == "latest" { "latest" } else { "stable" });
    }
    if channel == "latest" { format!("{GITHUB}/latest/download/latest.json") } else { format!("{GITHUB}/download/channel-stable/stable.json") }
}
fn channel_of(app: &AppHandle) -> String {
    app.state::<AppState>().shared.settings.read().unwrap()["general"]["updateChannel"].as_str().unwrap_or("stable").to_string()
}
fn updater_for(app: &AppHandle, channel: &str) -> Result<tauri_plugin_updater::Updater, String> {
    let url: tauri::Url = manifest_url(channel).parse().map_err(|_| "Bad update address".to_string())?;
    app.updater_builder().endpoints(vec![url]).map_err(|e| e.to_string())?.build().map_err(|e| e.to_string())
}

async fn do_check(app: &AppHandle) -> Result<Value, String> {
    let channel = channel_of(app);
    let upd = updater_for(app, &channel)?;
    let result = match upd.check().await {
        Ok(Some(u)) => {
            // The manifest may carry "manual": true (+ "manual_url") for updates the in-app installer can't apply.
            let manual = u.raw_json.get("manual").and_then(|v| v.as_bool()).unwrap_or(false);
            let url = u.raw_json.get("manual_url").and_then(|v| v.as_str()).unwrap_or(RELEASES_URL);
            json!({ "available": true, "version": u.version, "notes": u.body, "current": u.current_version, "manual": manual, "url": url, "channel": channel })
        }
        Ok(None) => json!({ "available": false, "current": env!("CARGO_PKG_VERSION"), "channel": channel }),
        Err(e) => return Err(format!("Couldn't check for updates ({e}). You may be offline, or no {channel} release has been published yet.")),
    };
    *app.state::<AppState>().update_cache.lock().unwrap() = Some((std::time::Instant::now(), channel, result.clone()));
    Ok(result)
}

/// Manual "Check for updates".
#[tauri::command]
async fn check_update(app: AppHandle) -> Result<Value, String> { do_check(&app).await }

/// Background check when the settings window opens: only if enabled, and it reuses a result from the
/// last 6 hours so opening the window repeatedly doesn't keep contacting GitHub. Returns null if disabled.
#[tauri::command]
async fn auto_check_update(app: AppHandle) -> Result<Value, String> {
    let st = app.state::<AppState>();
    if !st.shared.settings.read().unwrap()["general"]["autoCheckUpdates"].as_bool().unwrap_or(false) { return Ok(Value::Null); }
    let ch = channel_of(&app);
    if let Some((t, c, v)) = st.update_cache.lock().unwrap().as_ref() {
        if *c == ch && t.elapsed() < std::time::Duration::from_secs(6 * 3600) { return Ok(v.clone()); }
    }
    do_check(&app).await
}

/// Opens the project's GitHub page in the default browser. Only this repo's URLs are allowed.
#[tauri::command]
fn open_release_page(url: String) -> Result<(), String> {
    if !url.starts_with("https://github.com/nqble/keystroke-overlay/") { return Err("Blocked link".into()); }
    std::process::Command::new("explorer").arg(url).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Downloads, verifies the signature, installs, then restarts into the new version.
/// Only ever called from the user clicking "Update now".
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    let channel = channel_of(&app);
    let upd = updater_for(&app, &channel)?;
    let Some(u) = upd.check().await.map_err(|e| e.to_string())? else { return Err("Already up to date".into()) };
    let (a1, a2) = (app.clone(), app.clone());
    let mut done: u64 = 0;
    u.download_and_install(
        move |chunk, total| { done += chunk as u64; let _ = a1.emit("update-progress", json!({ "done": done, "total": total })); },
        move || { let _ = a2.emit("update-installing", ()); },
    ).await.map_err(|e| format!("Update failed: {e}"))?;
    app.restart();
}

#[tauri::command]
fn quit_app(app: AppHandle) { app.exit(0); }

// ---------------------------------------------------------------- main
fn main() {
    // Tauri's default async runtime starts one worker thread per CPU core (16 here). This app does
    // almost no async work, so two are plenty: fewer threads = less memory and a faster start.
    let rt = tokio::runtime::Builder::new_multi_thread().worker_threads(2).thread_name("ko-async").enable_all().build().expect("async runtime");
    tauri::async_runtime::set(rt.handle().clone());
    std::mem::forget(rt);   // keep it alive for the whole process

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
            let existed = paths.settings().exists();
            let mut cfg = settings::load(&paths.settings());
            // "What's new" is shown once after an update. A fresh install has nothing to show.
            let current = env!("CARGO_PKG_VERSION");
            let pending = existed && cfg["general"]["lastSeenVersion"].as_str() != Some(current);
            if !existed { cfg["general"]["lastSeenVersion"] = json!(current); }
            let _ = settings::save(&paths.settings(), &cfg); // persists migrations/new defaults
            let port = cfg["general"]["port"].as_u64().unwrap_or(7878) as u16;
            let open_on_launch = cfg["general"]["openOnLaunch"].as_bool().unwrap_or(true);

            let (cfg_tx, _) = broadcast::channel(8);
            let shared = Arc::new(Shared { bus: keyhook::start(), settings: cfg.into(), paths, cfg_tx });
            let (srv, err) = match server::start(shared.clone(), port) {
                Ok(h) => (Some(h), None),
                Err(e) => (None, Some(e)),
            };
            app.manage(AppState {
                shared: shared.clone(), server: Mutex::new(srv), server_error: Mutex::new(err),
                tray: Mutex::new(None), update_cache: Mutex::new(None), whats_new: AtomicBool::new(pending),
            });

            // ---- tray
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
            *app.state::<AppState>().tray.lock().unwrap() = Some(TrayItems { pause: pause_item, layouts: layout_items });
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

            let autostarted = std::env::args().any(|a| a == "--autostart");
            let server_failed = app.state::<AppState>().server_error.lock().unwrap().is_some();
            // Always show the window if the overlay server couldn't start (e.g. port taken), so the problem is visible.
            // Also show it after an update, so the "What's new" window can appear.
            if server_failed || pending || (open_on_launch && !autostarted) { open_settings_async(app.handle()); }
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
            check_update, auto_check_update, install_update, open_release_page,
            toggle_pause, set_layout, restart_server, ack_whats_new, get_release_notes
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn release_notes_parse() {
        let j = json!({ "name": "v1.2.3", "body": "- one\n- two", "html_url": "https://github.com/x/y/releases/tag/v1.2.3" });
        let n = release_notes_from(&j, "1.2.3");
        assert_eq!(n["title"], "v1.2.3");
        assert_eq!(n["body"], "- one\n- two");
        let empty = release_notes_from(&json!({ "name": "", "body": null }), "9.9.9");
        assert_eq!(empty["title"], "v9.9.9");
        assert_eq!(empty["body"], "");
    }
}
