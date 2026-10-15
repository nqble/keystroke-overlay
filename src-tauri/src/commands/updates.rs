//! Updates and release notes. The ONLY code in the app that talks to the internet (GitHub), and only when the
//! user checks / the optional background check runs / release notes are shown. Nothing but the app version is sent.

use crate::platform;
use crate::settings;
use crate::state::{channel_of_settings, AppState, REPO};
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::UpdaterExt as _;

/// How often the background check runs, and how long a result is reused when the settings window opens.
const CHECK_EVERY_SECS: u64 = 3600;
const GITHUB: &str = "https://github.com/nqble/keystroke-overlay/releases";
const RELEASES_URL: &str = "https://github.com/nqble/keystroke-overlay/releases/latest";

/// Where each channel's update manifest lives:
///   latest -> latest.json on the newest GitHub release (uploaded with every release)
///   stable -> stable.json on the fixed "channel-stable" release (replaced only when a release is promoted)
/// KEYOVERLAY_TEST_UPDATE_BASE is a build-time override used by test builds only; release builds never set it.
fn manifest_url(channel: &str) -> String {
    if let Some(base) = option_env!("KEYOVERLAY_TEST_UPDATE_BASE") {
        return format!("{base}/{}.json", if channel == "latest" { "latest" } else { "stable" });
    }
    if channel == "latest" { format!("{GITHUB}/latest/download/latest.json") } else { format!("{GITHUB}/download/channel-stable/stable.json") }
}

fn channel_of(app: &AppHandle) -> String {
    channel_of_settings(&app.state::<AppState>().shared.settings.read().unwrap())
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
        Err(e) => { crate::debug::log(format!("update check ({channel}) failed: {e}")); return Err(format!("Couldn't check for updates ({e}). You may be offline, or no {channel} release has been published yet.")); }
    };
    crate::debug::log(format!("update check ({channel}): {}", if result["available"].as_bool().unwrap_or(false) { format!("v{} is available", result["version"].as_str().unwrap_or("?")) } else { "up to date".to_string() }));
    *app.state::<AppState>().update_cache.lock().unwrap() = Some((std::time::Instant::now(), channel, result.clone()));
    crate::tray::set_update_badge(app, result["available"].as_bool().unwrap_or(false));
    let _ = app.emit("update-result", result.clone());   // an open settings window shows its update button right away
    Ok(result)
}

/// While the app runs it quietly asks GitHub about once an hour (if "Check for updates automatically" is on), so an
/// update shows up on the tray icon even when the settings window is closed. Nothing is ever installed by this.
pub fn start_background_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(45)).await;
        loop {
            let on = app.state::<AppState>().shared.settings.read().unwrap()["general"]["autoCheckUpdates"].as_bool().unwrap_or(false);
            if on { let _ = do_check(&app).await; }
            tokio::time::sleep(std::time::Duration::from_secs(CHECK_EVERY_SECS)).await;
        }
    });
}

/// Manual "Check for updates".
#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<Value, String> { do_check(&app).await }

/// Background check when the settings window opens: only if enabled, and it reuses a result from the
/// last hour so opening the window repeatedly doesn't keep contacting GitHub. Returns null if disabled.
#[tauri::command]
pub async fn auto_check_update(app: AppHandle) -> Result<Value, String> {
    let st = app.state::<AppState>();
    if !st.shared.settings.read().unwrap()["general"]["autoCheckUpdates"].as_bool().unwrap_or(false) { return Ok(Value::Null); }
    let ch = channel_of(&app);
    if let Some((t, c, v)) = st.update_cache.lock().unwrap().as_ref() {
        if *c == ch && t.elapsed() < std::time::Duration::from_secs(CHECK_EVERY_SECS) { return Ok(v.clone()); }
    }
    do_check(&app).await
}

/// Opens the project's GitHub page in the default browser. Only this repo's URLs are allowed.
#[tauri::command]
pub fn open_release_page(url: String) -> Result<(), String> {
    if !url.starts_with(&format!("https://github.com/{REPO}/")) { return Err("Blocked link".into()); }
    platform::open_url(&url).map_err(|e| e.to_string())
}

/// Downloads, verifies the signature, installs, then restarts into the new version.
/// Only ever called from the user clicking "Update now".
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
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

// ---------------------------------------------------------------- "What's new"
#[tauri::command]
pub fn ack_whats_new(st: State<AppState>) {
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
pub async fn get_release_notes(version: Option<String>) -> Result<Value, String> {
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
    #[test]
    fn channel_urls() {
        assert!(manifest_url("latest").ends_with("/latest.json"));
        assert!(manifest_url("stable").ends_with("/stable.json"));
        assert!(manifest_url("anything-else").ends_with("/stable.json"));   // unknown channel falls back to Stable
    }
}
