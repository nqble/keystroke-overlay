// Hide the console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Keystroke Overlay — entry point: builds the app, starts the keyboard hook + local server, shows the tray.
//! See docs/ARCHITECTURE.md for how the pieces fit together.

mod commands;
mod debug;
mod keyboard;
mod platform;
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
use tokio::sync::broadcast;
use window::open_settings_async;

fn main() {
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
        .setup(|app| {
            let paths = Paths {
                root: app.path().app_data_dir()?,
            };
            paths.ensure();
            let existed = paths.settings().exists();
            let mut cfg = settings::load(&paths.settings());
            // "What's new" is shown once after an update. A fresh install has nothing to show.
            let current = env!("CARGO_PKG_VERSION");
            let pending = existed && cfg["general"]["lastSeenVersion"].as_str() != Some(current);
            if !existed {
                cfg["general"]["lastSeenVersion"] = json!(current);
                settings::apply_devbuild_defaults(&app.config().identifier, &mut cfg);
            }
            // A layout that no longer exists (for example the retired TSB layout) falls back to Tenkeyless.
            if !server::layouts(&paths).iter().any(|l| l["id"] == cfg["layout"]["id"]) {
                cfg["layout"]["id"] = json!("tkl");
            }
            let _ = settings::save(&paths.settings(), &cfg); // persists migrations/new defaults
            let port = cfg["general"]["port"].as_u64().unwrap_or(7878) as u16;
            let open_on_launch = cfg["general"]["openOnLaunch"].as_bool().unwrap_or(true);

            let method = keyboard::Method::parse(cfg["general"]["inputMethod"].as_str().unwrap_or("hook"))
                .unwrap_or(keyboard::Method::Hook);

            // `npm run dev:debug` sets KEYOVERLAY_DEBUG so developers get the Debug tab without clicking anything.
            if std::env::var_os("KEYOVERLAY_DEBUG").is_some() {
                cfg["general"]["debugMode"] = json!(true);
            }
            debug::init(cfg["general"]["debugMode"].as_bool().unwrap_or(false));
            debug::log(format!("app started (v{current})"));

            let (cfg_tx, _) = broadcast::channel(8);
            let shared = Arc::new(Shared {
                bus: keyboard::start(method),
                settings: cfg.into(),
                paths,
                cfg_tx,
            });
            let (srv, err) = match server::start(shared.clone(), port) {
                Ok(h) => (Some(h), None),
                Err(e) => (None, Some(e)),
            };
            app.manage(AppState {
                shared: shared.clone(),
                server: Mutex::new(srv),
                server_error: Mutex::new(err),
                tray: Mutex::new(None),
                update_cache: Mutex::new(None),
                whats_new: AtomicBool::new(pending),
                pending_tab: Mutex::new(None),
            });

            tray::build(app, shared)?;
            commands::updates::start_background_check(app.handle().clone());

            let autostarted = std::env::args().any(|a| a == "--autostart");
            let server_failed = app.state::<AppState>().server_error.lock().unwrap().is_some();
            // Show the window if the overlay server couldn't start (port taken), so the problem is visible,
            // and after an update so the "What's new" window can appear.
            if server_failed || pending || (open_on_launch && !autostarted) {
                open_settings_async(app.handle());
            }
            Ok(())
        })
        .on_window_event(window::on_event)
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_state,
            commands::settings::save_settings,
            commands::settings::set_port,
            commands::settings::set_autostart,
            commands::settings::list_layouts,
            commands::settings::copy_text,
            commands::settings::quit_app,
            commands::settings::set_input_method,
            commands::settings::set_secure_link,
            commands::settings::regenerate_link_key,
            commands::assets::list_fonts,
            commands::assets::add_font,
            commands::assets::remove_font,
            commands::assets::open_folder,
            commands::assets::create_layout,
            commands::assets::export_layouts,
            commands::assets::import_layouts,
            commands::settings::reset_settings,
            commands::assets::delete_layout,
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
            debug::debug_log,
            debug::debug_log_clear,
            debug::debug_simulate_update,
            debug::debug_key_monitor,
            commands::updates::open_release_page,
            commands::updates::ack_whats_new,
            commands::updates::get_release_notes,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build app");

    app.run(|_, ev| {
        // Keep running in the tray when the last window closes.
        if let RunEvent::ExitRequested { api, code, .. } = ev {
            if code.is_none() {
                api.prevent_exit();
            }
        }
    });
}
