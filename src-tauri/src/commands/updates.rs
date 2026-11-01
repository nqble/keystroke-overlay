//! Updates and release notes. The ONLY code in the app that talks to the internet (GitHub), and only when the
//! user checks / the optional background check runs / release notes are shown. Nothing but the app version is sent.

use crate::app_info::{releases_url, REPO};
use crate::platform;
use crate::settings;
use crate::state::{channel_of_settings, AppState};
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::UpdaterExt as _;

/// How often the background check runs, and how long a result is reused when the settings window opens.
use std::time::Duration;

const CHECK_EVERY_SECS: u64 = 3600;

/// Where each channel's update manifest lives:
///   latest -> latest.json on the newest GitHub release (uploaded with every release)
///   stable -> stable.json on the fixed "channel-stable" release (replaced only when a release is promoted)
/// KEYOVERLAY_TEST_UPDATE_BASE is a build-time override used by test builds only; release builds never set it.
fn manifest_url(channel: &str) -> String {
    if let Some(base) = option_env!("KEYOVERLAY_TEST_UPDATE_BASE") {
        return format!("{base}/{}.json", if channel == "latest" { "latest" } else { "stable" });
    }
    if channel == "latest" {
        format!("{}/latest/download/latest.json", releases_url())
    } else {
        format!("{}/download/channel-stable/stable.json", releases_url())
    }
}

fn channel_of(app: &AppHandle) -> String {
    channel_of_settings(&app.state::<AppState>().shared.settings.read().unwrap())
}

fn updater_for(app: &AppHandle, channel: &str) -> Result<tauri_plugin_updater::Updater, String> {
    let url: tauri::Url = manifest_url(channel)
        .parse()
        .map_err(|_| "Bad update address".to_string())?;
    app.updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())
}

/// What the window says when the update check fails. A Mac gets its own words: the update file on GitHub only has entries
/// the in-app installer can use (Windows and the Linux AppImage), so on a Mac the check always fails, and the honest advice is to download the
/// new version from the Releases page.
fn check_failed_text(system: &str, channel: &str, error: &str) -> String {
    if system == "macos" {
        return format!(
            "Couldn't check for updates. On a Mac the app can't install updates by itself yet: get new versions from the Releases page ({}).",
            releases_url()
        );
    }
    format!("Couldn't check for updates ({error}). You may be offline, or no {channel} release has been published yet.")
}

/// Whether this copy can install an update itself. On Linux only an AppImage can replace itself (the update file on GitHub is
/// an AppImage); a copy installed from the .deb cannot, and would otherwise be offered the AppImage and fail.
fn updates_in_app(system: &str, appimage: bool) -> bool {
    system != "linux" || appimage
}

/// What the window says on a Linux copy that is not an AppImage.
fn not_an_appimage_text() -> String {
    format!(
        "This copy was installed as a package (.deb), so it can't update itself: only the AppImage does. Get new versions from the Releases page ({}).",
        releases_url()
    )
}

async fn do_check(app: &AppHandle) -> Result<Value, String> {
    if let Some(fake) = crate::debug::fake_update() {
        crate::debug::log("update check skipped: a fake update is showing (Debug tab)");
        return Ok(fake);
    }
    if !updates_in_app(platform::name(), std::env::var_os("APPIMAGE").is_some()) {
        crate::debug::log("update check skipped: this Linux copy is not an AppImage");
        return Err(not_an_appimage_text());
    }
    let channel = channel_of(app);
    let upd = updater_for(app, &channel)?;
    let result = match upd.check().await {
        Ok(Some(update)) => {
            // The manifest may carry "manual": true (+ "manual_url") for updates the in-app installer can't apply.
            let manual = update.raw_json.get("manual").and_then(|v| v.as_bool()).unwrap_or(false);
            let latest_page = format!("{}/latest", releases_url());
            let url = update
                .raw_json
                .get("manual_url")
                .and_then(|v| v.as_str())
                .unwrap_or(&latest_page);
            json!({ "available": true, "version": update.version, "notes": update.body, "current": update.current_version, "manual": manual, "url": url, "channel": channel })
        }
        Ok(None) => json!({ "available": false, "current": env!("CARGO_PKG_VERSION"), "channel": channel }),
        Err(e) => {
            crate::debug::log(format!("update check ({channel}) failed: {e}"));
            return Err(check_failed_text(platform::name(), &channel, &e.to_string()));
        }
    };
    crate::debug::log(format!(
        "update check ({channel}): {}",
        if result["available"].as_bool().unwrap_or(false) {
            format!("v{} is available", result["version"].as_str().unwrap_or("?"))
        } else {
            "up to date".to_string()
        }
    ));
    *app.state::<AppState>().update_cache.lock().unwrap() = Some((std::time::Instant::now(), channel, result.clone()));
    crate::tray::set_update_badge(app, result["available"].as_bool().unwrap_or(false));
    let _ = app.emit("update-result", result.clone()); // an open settings window shows its update button right away
    Ok(result)
}

/// How long a request to GitHub may take before the app gives up (release notes, update checks go through the updater).
const REQUEST_TIMEOUT_SECS: u64 = 8;

/// How long after the app starts the first automatic check runs (PRIVACY.md says 45 seconds).
const FIRST_CHECK_AFTER_SECS: u64 = 45;

/// While the app runs it quietly asks GitHub about once an hour (if "Check for updates automatically" is on), so an
/// update shows up on the tray icon even when the settings window is closed. Nothing is ever installed by this.
pub fn start_background_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(FIRST_CHECK_AFTER_SECS)).await;
        let is_on = || {
            app.state::<AppState>().shared.settings.read().unwrap()["general"]["autoCheckUpdates"]
                .as_bool()
                .unwrap_or(false)
        };
        let settings_changed = &app.state::<AppState>().auto_check_changed;
        let check = || async {
            let _ = do_check(&app).await;
        };
        check_while_on(is_on, settings_changed, check, Duration::from_secs(CHECK_EVERY_SECS)).await;
    });
}

/// Checks every `every` while `is_on()`. While it is off, no timer runs at all (CLAUDE.md: nothing wakes the app while
/// idle): the loop just waits until `settings_changed` is notified (save_settings and reset_settings do that).
async fn check_while_on<F: std::future::Future<Output = ()>>(
    is_on: impl Fn() -> bool,
    settings_changed: &tokio::sync::Notify,
    mut check: impl FnMut() -> F,
    every: Duration,
) {
    loop {
        if !is_on() {
            settings_changed.notified().await;
            continue;
        }
        check().await;
        tokio::time::sleep(every).await;
    }
}

/// Manual "Check for updates".
#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<Value, String> {
    do_check(&app).await
}

/// Background check when the settings window opens: only if enabled, and it reuses a result from the
/// last hour so opening the window repeatedly doesn't keep contacting GitHub. Returns null if disabled.
#[tauri::command]
pub async fn auto_check_update(app: AppHandle) -> Result<Value, String> {
    let st = app.state::<AppState>();
    if !st.shared.settings.read().unwrap()["general"]["autoCheckUpdates"]
        .as_bool()
        .unwrap_or(false)
    {
        return Ok(Value::Null);
    }
    if let Some(fake) = crate::debug::fake_update() {
        return Ok(fake);
    }
    let channel = channel_of(&app);
    if let Some((checked_at, cached_channel, cached_result)) = st.update_cache.lock().unwrap().as_ref() {
        if *cached_channel == channel && checked_at.elapsed() < std::time::Duration::from_secs(CHECK_EVERY_SECS) {
            return Ok(cached_result.clone());
        }
    }
    do_check(&app).await
}

/// Opens the project's front page on GitHub in the default browser (the GitHub button under the tabs). It takes no
/// address, so nothing else can be opened through it.
#[tauri::command]
pub fn open_project_page() -> Result<(), String> {
    platform::open_url(&format!("https://github.com/{REPO}")).map_err(|e| e.to_string())
}

/// keyboard-layout-editor.com, where a user draws a keyboard to import (the "From a KLE file" choice in the New
/// layout popup). Fixed here, like the project page above, so this command can open nothing else.
const KLE_SITE: &str = "https://www.keyboard-layout-editor.com/";

/// Opens keyboard-layout-editor.com in the default browser. It takes no address.
#[tauri::command]
pub fn open_kle_site() -> Result<(), String> {
    platform::open_url(KLE_SITE).map_err(|e| e.to_string())
}

/// Opens the project's GitHub page in the default browser. Only this repo's URLs are allowed.
#[tauri::command]
pub fn open_release_page(url: String) -> Result<(), String> {
    if !url.starts_with(&format!("https://github.com/{REPO}/")) {
        return Err("Blocked link".into());
    }
    platform::open_url(&url).map_err(|e| e.to_string())
}

/// Downloads, verifies the signature, installs, then restarts into the new version.
/// Only ever called from the user clicking "Update now".
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    if crate::debug::fake_update().is_some() {
        return Err("This is a fake update from the Debug tab: there is nothing to install.".into());
    }
    let channel = channel_of(&app);
    let upd = updater_for(&app, &channel)?;
    let Some(update) = upd.check().await.map_err(|e| e.to_string())? else {
        return Err("Already up to date".into());
    };
    crate::debug::log(format!("installing update v{}", update.version));
    let (progress_app, installing_app) = (app.clone(), app.clone());
    let mut done: u64 = 0;
    update
        .download_and_install(
            move |chunk, total| {
                done += chunk as u64;
                let _ = progress_app.emit("update-progress", json!({ "done": done, "total": total }));
            },
            move || {
                let _ = installing_app.emit("update-installing", ());
            },
        )
        .await
        .map_err(|e| {
            crate::debug::log(format!("update failed: {e}"));
            format!("Update failed: {e}")
        })?;
    app.restart();
}

// ---------------------------------------------------------------- "What's new"
#[tauri::command]
pub fn ack_whats_new(st: State<AppState>) {
    st.whats_new.store(false, Ordering::Relaxed);
    let mut current_settings = st.shared.settings.write().unwrap();
    current_settings["general"]["lastSeenVersion"] = json!(env!("CARGO_PKG_VERSION"));
    let _ = settings::save(&st.shared.paths.settings(), &current_settings);
}

/// Where a release's "Which file do I download?" table starts (tools/download-table.mjs; keep the heading in step). It
/// is for visitors of the release page, so What's new leaves it out.
const DOWNLOAD_TABLE_HEADING: &str = "### Which file do I download?";

fn release_notes_from(release: &Value, ver: &str) -> Value {
    let full = release["body"].as_str().unwrap_or("");
    let notes = full.split(DOWNLOAD_TABLE_HEADING).next().unwrap_or("").trim_end();
    let body: String = notes.chars().take(20000).collect();
    json!({
        "version": ver,
        "title": release["name"].as_str().filter(|s| !s.is_empty()).map(String::from).unwrap_or_else(|| format!("v{ver}")),
        "body": body,
        "url": release["html_url"].as_str().unwrap_or("")
    })
}

/// Fetches the GitHub release notes for a version (default: the running one). Contacts GitHub only
/// when the user opens "What's new" / "View release notes".
#[tauri::command]
pub async fn get_release_notes(version: Option<String>) -> Result<Value, String> {
    let ver = version.unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string());
    if ver.is_empty() || !ver.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
        return Err("Bad version".into());
    }
    let client = reqwest::Client::builder()
        .user_agent(concat!("KeystrokeOverlay/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(format!("https://api.github.com/repos/{REPO}/releases/tags/v{ver}"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|_| "Couldn't reach GitHub. Check your internet connection.".to_string())?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(format!("No release notes are published for v{ver} yet."));
    }
    if !resp.status().is_success() {
        return Err(format!("GitHub returned an error ({}).", resp.status()));
    }
    let release: Value = resp
        .json()
        .await
        .map_err(|_| "GitHub sent something unexpected.".to_string())?;
    Ok(release_notes_from(&release, &ver))
}

#[cfg(test)]
mod tests {
    use super::*;
    /// The outside review: the hourly timer used to keep waking the app with the setting off. Now, while off, the
    /// loop waits for a settings change and never checks; turning it on (and saying so) starts the checks.
    #[tokio::test]
    async fn no_checks_and_no_timer_while_automatic_checks_are_off() {
        use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
        use std::sync::Arc;
        let on = Arc::new(AtomicBool::new(false));
        let checks = Arc::new(AtomicUsize::new(0));
        let changed = Arc::new(tokio::sync::Notify::new());
        let looping = {
            let (on, checks, changed) = (on.clone(), checks.clone(), changed.clone());
            tokio::spawn(async move {
                let count = || async {
                    checks.fetch_add(1, Ordering::SeqCst);
                };
                check_while_on(|| on.load(Ordering::SeqCst), &changed, count, Duration::from_millis(5)).await;
            })
        };
        tokio::time::sleep(Duration::from_millis(60)).await;
        assert_eq!(checks.load(Ordering::SeqCst), 0, "no check while the setting is off");
        on.store(true, Ordering::SeqCst);
        changed.notify_one();
        tokio::time::sleep(Duration::from_millis(60)).await;
        assert!(checks.load(Ordering::SeqCst) > 0, "turning it on starts checking");
        looping.abort();
    }
    #[test]
    fn only_an_appimage_updates_itself_on_linux() {
        assert!(!updates_in_app("linux", false), "a .deb copy can't replace itself");
        assert!(updates_in_app("linux", true));
        assert!(updates_in_app("windows", false));
        assert!(updates_in_app("macos", false));
        assert!(not_an_appimage_text().contains("AppImage") && not_an_appimage_text().contains("Releases page"));
    }

    #[test]
    fn a_failed_check_on_a_mac_points_to_the_releases_page() {
        let text = check_failed_text("macos", "latest", "None of the fallback platforms were found");
        assert!(text.contains("Releases page"));
        assert!(
            !text.contains("fallback platforms"),
            "no confusing technical error for a Mac user"
        );
    }

    #[test]
    fn a_failed_check_elsewhere_keeps_the_usual_words() {
        let text = check_failed_text("windows", "stable", "timed out");
        assert!(text.contains("timed out") && text.contains("no stable release"));
    }

    #[test]
    fn release_notes_parse() {
        let release = json!({ "name": "v1.2.3", "body": "- one\n- two", "html_url": "https://github.com/x/y/releases/tag/v1.2.3" });
        let notes = release_notes_from(&release, "1.2.3");
        assert_eq!(notes["title"], "v1.2.3");
        assert_eq!(notes["body"], "- one\n- two");
        let empty = release_notes_from(&json!({ "name": "", "body": null }), "9.9.9");
        assert_eq!(empty["title"], "v9.9.9");
        assert_eq!(empty["body"], "");
    }
    #[test]
    fn whats_new_leaves_out_the_download_table() {
        let body = "- one\n- two\n\n### Which file do I download?\n\n| Your computer | Download | |";
        let notes = release_notes_from(&json!({ "name": "v2.1.0", "body": body }), "2.1.0");
        assert_eq!(notes["body"], "- one\n- two");
    }
    #[test]
    fn channel_urls() {
        assert!(manifest_url("latest").ends_with("/latest.json"));
        assert!(manifest_url("stable").ends_with("/stable.json"));
        assert!(manifest_url("anything-else").ends_with("/stable.json")); // unknown channel falls back to Stable
    }

    /// Updates install without showing Windows' installer window ("quiet"), so updating looks seamless. "quiet" needs no
    /// admin rights only because the app installs per user (NSIS currentUser); both are checked here.
    #[test]
    fn updates_install_quietly_for_the_current_user() {
        let config: serde_json::Value = serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
        assert_eq!(config["plugins"]["updater"]["windows"]["installMode"], "quiet");
        assert_eq!(config["bundle"]["windows"]["nsis"]["installMode"], "currentUser");
    }
}
