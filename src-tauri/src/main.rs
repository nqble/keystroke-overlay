// Hide the console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Keystroke Overlay — entry point: builds the app, starts the keyboard hook + local server, shows the tray.
//! See docs/ARCHITECTURE.md for how the pieces fit together.

mod app_info;
mod commands;
mod crash;
mod debug;
mod downgrade;
mod grid;
mod hotkeys;
mod key_angles;
mod key_labels;
mod keyboard;
mod layout_order;
mod obs_scenes;
mod platform;
mod sanitize;
mod server;
mod settings;
mod state;
mod tray;
mod window;

use serde_json::json;
use server::Shared;
use settings::Paths;
use state::AppState;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::{Manager, RunEvent};
use tokio::sync::{broadcast, watch};
use window::open_settings_async;

fn main() {
    start_async_runtime();

    let app = tauri::Builder::default()
        // Raw Input registrations are per process. Tauri's window layer registers its own at startup, which would
        // compete with the Compatibility input method, so tell it to stand down (we never use its device events).
        .device_event_filter(tauri::DeviceEventFilter::Always)
        .plugin(tauri_plugin_single_instance::init(|app, _, _| open_settings_async(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .setup(|app| start_app(app))
        .on_window_event(window::on_event)
        .on_menu_event(|app, event| platform::on_app_menu_event(app, event.id().as_ref()))
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_state,
            commands::settings::save_settings,
            commands::settings::set_port,
            commands::settings::set_autostart,
            hotkeys::set_pause_hotkey,
            commands::settings::list_layouts,
            commands::settings::copy_text,
            commands::settings::quit_app,
            commands::keyboard_access::get_keyboard_access,
            commands::keyboard_access::request_keyboard_access,
            commands::keyboard_access::restart_app,
            commands::settings::set_input_method,
            commands::settings::set_secure_link,
            commands::settings::regenerate_link_key,
            commands::assets::list_fonts,
            commands::assets::add_font,
            commands::assets::remove_font,
            commands::assets::open_folder,
            commands::assets::create_layout,
            commands::layout_import::pick_layout_source,
            commands::layout_import::typing_virtual_keys,
            commands::layout_import::add_layout,
            commands::assets::export_layouts,
            commands::assets::import_layouts,
            commands::settings::reset_settings,
            commands::assets::delete_layout,
            commands::assets::rename_layout,
            commands::assets::list_presets,
            commands::assets::save_preset,
            commands::assets::load_preset,
            commands::assets::delete_preset,
            commands::assets::export_preset,
            commands::assets::import_preset,
            commands::actions::toggle_pause,
            commands::actions::set_layout,
            commands::actions::restart_server,
            commands::updates::check_update,
            commands::updates::auto_check_update,
            commands::updates::install_update,
            debug::debug_info,
            debug::debug_defaults,
            debug::debug_log,
            debug::debug_log_clear,
            debug::debug_simulate_update,
            debug::debug_tray_state,
            debug::debug_key_monitor,
            commands::updates::open_release_page,
            commands::updates::open_project_page,
            commands::updates::open_kle_site,
            commands::appearance::list_app_themes,
            commands::appearance::export_app_theme,
            commands::appearance::import_app_theme,
            commands::updates::ack_whats_new,
            commands::settings::ack_first_run,
            commands::updates::get_release_notes,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build app");

    app.run(|app, ev| {
        platform::on_run_event(app, &ev);
        // Keep running in the tray when the last window closes.
        if let RunEvent::ExitRequested { api, code, .. } = ev {
            if code.is_none() {
                api.prevent_exit();
            }
        }
    });
}

/// Starts the async runtime (two worker threads) and keeps it for the whole process.
fn start_async_runtime() {
    // Tauri's default async runtime starts one worker thread per CPU core (16 here). This app does
    // almost no async work, so two are plenty: fewer threads = less memory and a faster start.
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .thread_name("ko-async")
        .enable_all()
        .build()
        .expect("async runtime");
    tauri::async_runtime::set(rt.handle().clone());
    std::mem::forget(rt); // keep it alive for the whole process
}

/// Everything that happens once Tauri is ready, in order: the menu bar (macOS), settings, event log, key labels, keyboard,
/// server, state, tray, pause shortcut, update check, window.
fn start_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    platform::set_dock_icon_visible(app.handle(), false); // a menu-bar app until the settings window opens
    platform::install_app_menu(app)?; // macOS: Command+Q, Command+W and Command+,
    let paths = Paths {
        root: app.path().app_data_dir()?,
    };
    paths.ensure();
    let first_run = settings::is_first_run(&paths.settings());
    let current = env!("CARGO_PKG_VERSION");
    let (mut cfg, pending) = load_settings(&paths, &app.config().identifier, current);
    let port = cfg["general"]["port"].as_u64().unwrap_or(7878) as u16;
    let open_on_launch = cfg["general"]["openOnLaunch"].as_bool().unwrap_or(true);

    let method = keyboard::Method::parse(cfg["general"]["inputMethod"].as_str().unwrap_or("hook"))
        .unwrap_or(keyboard::Method::Hook);

    start_event_log(&mut cfg, &paths, current);
    key_labels::init(app.handle()); // what the user's keyboard prints, asked now and on each layout switch

    let shared = make_shared(cfg, paths, method);
    let (srv, err) = match server::start(shared.clone(), port) {
        Ok(handle) => (Some(handle), None),
        Err(e) => (None, Some(e)),
    };
    app.manage(AppState {
        shared: shared.clone(),
        server: Mutex::new(srv),
        server_error: Mutex::new(err),
        tray: Mutex::new(None),
        update_cache: Mutex::new(None),
        whats_new: AtomicBool::new(pending),
        first_run: AtomicBool::new(first_run),
        pending_tab: Mutex::new(None),
        auto_check_changed: tokio::sync::Notify::new(),
    });

    key_labels::follow_switch_keys(app.handle()); // Windows: a layout switch inside one window
    state::forward_overlay_count(app.handle().clone(), &shared);
    tray::build(app, shared.clone())?;
    if let Err(problem) = hotkeys::apply(app.handle(), &shared.settings.read().unwrap()) {
        debug::log(format!("pause shortcut not registered: {problem}"));
    }
    commands::updates::start_background_check(app.handle().clone());

    open_window_at_launch(app, pending, open_on_launch);
    Ok(())
}

/// Reads the settings (migrating them), makes sure the chosen layout still exists, and saves the result. Also says
/// whether to show "What's new" after this start.
fn load_settings(paths: &Paths, identifier: &str, current: &str) -> (serde_json::Value, bool) {
    let (mut cfg, pending) = settings::load_at_startup(&paths.settings(), identifier, current);
    // A layout that no longer exists (for example the retired TSB layout) falls back to Tenkeyless.
    if !server::layouts(paths).iter().any(|l| l["id"] == cfg["layout"]["id"]) {
        cfg["layout"]["id"] = json!("tkl");
    }
    let _ = settings::save(&paths.settings(), &cfg); // persists migrations/new defaults
    (cfg, pending)
}

/// Starts the in-memory event log and the crash note: reports the last crash (if any), then arms the next one.
fn start_event_log(cfg: &mut serde_json::Value, paths: &Paths, current: &str) {
    // `npm run dev:debug` sets KEYOVERLAY_DEBUG so developers get the Debug tab without clicking anything.
    if std::env::var_os("KEYOVERLAY_DEBUG").is_some() {
        cfg["general"]["debugMode"] = json!(true);
    }
    debug::init(cfg["general"]["debugMode"].as_bool().unwrap_or(false));
    debug::log(format!("app started (v{current})"));
    if let Some(note) = crash::take_last(&paths.root) {
        debug::log(format!("the last run crashed: {note}"));
        debug::set_last_crash(note);
    }
    crash::install(&paths.root);
}

/// Starts keyboard capture and builds the state the server and the windows share.
fn make_shared(cfg: serde_json::Value, paths: Paths, method: keyboard::Method) -> Arc<Shared> {
    let (cfg_tx, _) = broadcast::channel(8);
    let shared = Arc::new(Shared {
        bus: keyboard::start(method),
        settings: cfg.into(),
        paths,
        cfg_tx,
        overlays: watch::channel(0).0,
    });
    match shared.bus.error() {
        Some(e) => debug::log(format!("keyboard input ({}) could not start: {e}", method.id())),
        None => debug::log(format!("keyboard input: {}", method.id())),
    }
    shared
}

/// Shows the settings window at start-up when it should appear.
fn open_window_at_launch(app: &tauri::App, pending: bool, open_on_launch: bool) {
    let autostarted = std::env::args().any(|a| a == "--autostart");
    let server_failed = app.state::<AppState>().server_error.lock().unwrap().is_some();
    // Show the window if the overlay server couldn't start (port taken), so the problem is visible,
    // and after an update so the "What's new" window can appear.
    if server_failed || pending || (open_on_launch && !autostarted) {
        open_settings_async(app.handle());
    }
}
