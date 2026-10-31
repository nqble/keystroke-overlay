//! Settings storage: versioned JSON + migration chain + defaults merging.
//!
//! The file on disk is `{ "version": N, ... }`. On load it is migrated one
//! step at a time up to `CURRENT_VERSION`, then deep-merged on top of
//! `defaults()` so newly added settings always have a value, then sanitized.
//!
//! HOW TO ADD A SETTING: add it to `defaults()` (and to `CONTROLS` in
//! ui/settings/controls.js). No migration is needed for purely additive changes. If it needs a rule beyond its
//! type (a range, a fixed set of choices, a text format), add one line to the tables in sanitize.rs.
//! HOW TO RENAME/RESTRUCTURE: bump CURRENT_VERSION and add a step to `MIGRATIONS`.

use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

use crate::sanitize::sanitize;

pub const CURRENT_VERSION: u64 = 5;
/// The settings version v1.4.0 wrote. v1.4.0 drops every setting it doesn't know when it saves, and only a higher
/// number makes it keep a copy of this version's file first (downgrade.rs), so the build fails if this ever stops holding.
const VERSION_WRITTEN_BY_V1_4: u64 = 3;
const _: () = assert!(CURRENT_VERSION > VERSION_WRITTEN_BY_V1_4);

pub fn defaults() -> Value {
    json!({
        "version": CURRENT_VERSION,
        "general": {
            "port": 7878, "autostart": false, "minimizeToTray": true, "openOnLaunch": true,
            // Developer tools: adds a Debug tab and an in-memory event log (src-tauri/src/debug.rs). Off by default.
            "debugMode": false,
            // Background update check (about once an hour while the app runs, and when the settings window opens).
            // Updates are
            // never installed without the user clicking the update button.
            "autoCheckUpdates": true,
            // How keys are read: "hook" (standard, default) or "rawinput" (compatibility, for games that block hooks).
            "inputMethod": "hook",
            // Optional "secure link": when on, the overlay link carries a private key (?key=...) and the local server
            // refuses requests without it. Off by default (plain link, no extra step). The key is never sent to the
            // overlay itself.
            "secureLink": false,
            "linkKey": "",
            // "stable" = only releases that were promoted to the Stable channel; "latest" = every release.
            "updateChannel": "stable",
            // Last app version the user has seen the "What's new" window for (managed by the app).
            "lastSeenVersion": ""
        },
        // profiles[layoutId] = { disabledKeys: [...], labels: { code: text }, layoutStyle: "grid" (only when chosen),
        //   styles: { shape: { positions: { code: { x, y } }, sizes: { code: { w } } }, grid: { ... } } }
        // (one per layout, saved automatically; disabledKeys and labels are shared by both layout styles).
        // editor = the Keys tab's snap step (0 = off, else 0.25, 0.5 or 1 key), whether it shows the grid, and whether it
        // shows the keys that are hidden in the overlay (dimmed).
        // order = the layouts the Layout tab and the tray show, in order (layout_order.rs): a built-in layout shows only
        //   while it is listed (the others wait in "Other layouts"); the user's own always show.
        "layout": { "id": "tkl", "profiles": {}, "editor": { "snap": 0.25, "grid": false, "showHidden": true }, "order": crate::layout_order::DEFAULT_ORDER },
        "style": {
            "keyFill": "#1e222bd9", "keyFillPressed": "#4f8cffff",
            "borderColor": "#ffffff40", "borderColorPressed": "#ffffffff", "borderWidth": 2, "radius": 8,
            "fontFamily": "Segoe UI", "fontSize": 18, "fontWeight": 600,
            "textColor": "#e6e9f0ff", "textColorPressed": "#ffffffff",
            "glowColor": "#4f8cffff", "glowSize": 18,
            "keySize": 52, "gap": 6, "scale": 1.0, "opacity": 1.0,
            // "keyboard": labels follow the user's keyboard language (key_labels.rs); "layout": the layout files' own
            "keyLabels": "keyboard"
        },
        // The global pause shortcut (hotkeys.rs), e.g. "Ctrl+Shift+KeyP". Off and empty by default.
        "hotkeys": { "enabled": false, "pause": "" },
        // OBS scenes (obs_scenes.rs): hide the overlay or show another layout in the listed scenes, followed by the
        // overlay page inside OBS. rules = [{ "scene": "Chat", "show": false, "layout": "" }]; off by default.
        "obs": { "scenes": { "enabled": false, "rules": [] } },
        "animation": { "type": "none", "speed": 120, "easing": "default", "intensity": 1.0 },
        // The settings window's theme (commands/appearance.rs, ui/settings/app-themes.js): a file name in
        // ui/settings/themes/ without ".json", or the id of one of the person's own themes in `custom`
        // ([{ id, name, colors }], at most 20; commands/appearance.rs cleans them). "default" is today's look; an unknown
        // name falls back to it.
        "appearance": { "theme": "default", "custom": [] }
    })
}

type Migration = fn(&mut Value);

/// MIGRATIONS[i] upgrades a config from version (i+1) to (i+2).
const MIGRATIONS: &[Migration] = &[v1_to_v2, v2_to_v3, v3_to_v4, v4_to_v5];

/// v1 stored one global `layout.disabledKeys` / `layout.labels`.
/// v2 stores them per layout in `layout.profiles[layoutId]`.
fn v1_to_v2(config: &mut Value) {
    let Some(layout) = config.get_mut("layout").and_then(|l| l.as_object_mut()) else {
        return;
    };
    let id = layout.get("id").and_then(|x| x.as_str()).unwrap_or("tkl").to_string();
    let disabled = layout.remove("disabledKeys").unwrap_or_else(|| json!([]));
    let labels = layout.remove("labels").unwrap_or_else(|| json!({}));
    let mut profile = Map::new();
    profile.insert("disabledKeys".into(), disabled);
    profile.insert("labels".into(), labels);
    let mut profiles = Map::new();
    profiles.insert(id, Value::Object(profile));
    layout.insert("profiles".into(), Value::Object(profiles));
}

/// v2 kept a layout's moved keys in `profile.positions`.
/// v3 keeps positions (and key sizes) per layout style in `profile.styles.<style>`, so today's positions become the
/// "shape" style's.
fn v2_to_v3(config: &mut Value) {
    let Some(profiles) = config.pointer_mut("/layout/profiles").and_then(Value::as_object_mut) else {
        return;
    };
    for profile in profiles.values_mut().filter_map(Value::as_object_mut) {
        if let Some(positions) = profile.remove("positions") {
            profile.insert("styles".into(), json!({ "shape": { "positions": positions } }));
        }
    }
}

/// v4 (v2.0) only adds settings (`hotkeys`, `layout.order`, `style.keyLabels`), so nothing moves. The number goes up
/// anyway: v1.4.0 also wrote version 3, and it drops every setting it doesn't know when it saves. Seeing a newer
/// version is what makes an older app keep a copy first (downgrade.rs), so going back to v1.4.0 and forward again
/// loses nothing.
fn v3_to_v4(_config: &mut Value) {}

/// v5 only adds turned keys (`rotations` in a profile's shape style; docs/proposals/key-rotation.md), so nothing moves.
/// The number goes up so that an older app, which drops `rotations` when it saves, keeps a copy of this file first
/// (downgrade.rs): going back and forward again keeps every angle.
fn v4_to_v5(_config: &mut Value) {}

pub fn migrate(mut config: Value) -> Value {
    if !config.is_object() {
        return defaults();
    }
    let mut ver = config.get("version").and_then(|x| x.as_u64()).unwrap_or(1).max(1);
    while ver < CURRENT_VERSION {
        if let Some(migration) = MIGRATIONS.get((ver - 1) as usize) {
            migration(&mut config);
        }
        ver += 1;
    }
    config["version"] = json!(CURRENT_VERSION);
    let mut out = defaults();
    merge(&mut out, &config);
    sanitize(&mut out, &defaults());
    out
}

/// A fresh private link key: 128 bits from the operating system's secure random generator, as 32 hex characters.
pub fn new_key() -> Result<String, String> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|e| format!("couldn't create a secure key: {e}"))?;
    Ok(bytes.iter().map(|x| format!("{x:02x}")).collect())
}

/// Settings as the overlay is allowed to see them: everything except the private link key.
pub fn public_settings(settings: &Value) -> Value {
    let mut public = settings.clone();
    if let Some(general) = public.get_mut("general").and_then(|g| g.as_object_mut()) {
        general.remove("linkKey");
    }
    public
}

/// Deep-merge `src` into `dst` (objects recurse, everything else replaces).
pub fn merge(dst: &mut Value, src: &Value) {
    match (dst, src) {
        (Value::Object(dst_map), Value::Object(src_map)) => {
            for (key, src_value) in src_map {
                match dst_map.get_mut(key) {
                    Some(dst_value) if dst_value.is_object() && src_value.is_object() => merge(dst_value, src_value),
                    _ => {
                        dst_map.insert(key.clone(), src_value.clone());
                    }
                }
            }
        }
        (dst_value, src_value) => *dst_value = src_value.clone(),
    }
}

pub(crate) fn read_json(path: &Path) -> Option<Value> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .filter(|v| v.is_object())
}

/// Loads settings. If settings.json is missing or corrupt, the last good copy (settings.json.bak) is used.
pub fn load(path: &Path) -> Value {
    let backup = path.with_extension("json.bak");
    let Some((source, raw)) = [path.to_path_buf(), backup]
        .into_iter()
        .find_map(|candidate| read_json(&candidate).map(|value| (candidate, value)))
    else {
        return defaults();
    };
    crate::downgrade::keep_copy_of_newer_settings(&source, &raw);
    let (raw, restored_copy) = crate::downgrade::with_copy_restored(path, raw);
    let mut settings = migrate(raw);
    if let Some(copy) = restored_copy {
        // the copy is only removed once its fields are safely back in settings.json
        if save(path, &settings).is_ok() {
            let _ = std::fs::remove_file(copy);
        }
    }
    if give_empty_secure_link_a_key(&mut settings) {
        let _ = save(path, &settings);
    }
    settings
}

/// With the secure link on but no valid key (a hand-edited file, say), the overlay would stay locked and the settings window
/// would have no link to show. Make a fresh key so there is a working link. (The server still refuses every request
/// while there is no key, see `key_ok` in server.rs.) Returns true when it changed something.
fn give_empty_secure_link_a_key(settings: &mut Value) -> bool {
    let general = &mut settings["general"];
    let wanted = general["secureLink"].as_bool() == Some(true);
    let has_key = general["linkKey"].as_str().is_some_and(|key| !key.is_empty());
    if !wanted || has_key {
        return false;
    }
    match new_key() {
        Ok(key) => {
            general["linkKey"] = json!(key);
            true
        }
        Err(_) => false,
    }
}

/// What "Reset all settings" keeps: the port and the secure link with its key, so the OBS URL stays exactly the same
/// (and a reset never turns the protection off), and the version the "What's new" popup last showed.
const KEPT_ON_RESET: [&str; 4] = ["lastSeenVersion", "port", "secureLink", "linkKey"];

/// Every setting back to its default, except the ones in `KEPT_ON_RESET`, taken from `current`.
pub fn reset_keeping_link(current: &Value) -> Value {
    let mut reset = defaults();
    for name in KEPT_ON_RESET {
        reset["general"][name] = current["general"][name].clone();
    }
    reset
}

pub fn save(path: &Path, settings: &Value) -> std::io::Result<()> {
    if let Some(folder) = path.parent() {
        std::fs::create_dir_all(folder)?;
    }
    // Keep the previous good file as a backup (only if it is itself valid).
    if read_json(path).is_some() {
        let _ = std::fs::copy(path, path.with_extension("json.bak"));
    }
    // Write-then-rename so a crash can never leave a half-written config.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(settings).unwrap())?;
    std::fs::rename(tmp, path)
}

/// Per-user data folders (settings, fonts, presets, user layouts/animations/themes).
pub struct Paths {
    pub root: PathBuf,
}
impl Paths {
    pub fn settings(&self) -> PathBuf {
        self.root.join("settings.json")
    }
    pub fn fonts(&self) -> PathBuf {
        self.root.join("fonts")
    }
    pub fn presets(&self) -> PathBuf {
        self.root.join("presets")
    }
    pub fn user(&self, kind: &str) -> PathBuf {
        self.root.join(kind)
    } // layouts | animations | themes
    pub fn ensure(&self) {
        for folder_name in ["fonts", "presets", "layouts", "animations", "themes"] {
            let _ = std::fs::create_dir_all(self.root.join(folder_name));
        }
    }
}

/// True when this is a brand-new install: no settings file and no backup of one. Then the settings window opens on
/// the first run setup screen (docs/design/ui-design-v2.md, First run setup). After an update the file is there. A
/// missing settings.json with a backup is not new: load() restores the backup, and new-install defaults must not
/// overwrite it (load_at_startup).
pub fn is_first_run(path: &Path) -> bool {
    !path.exists() && !path.with_extension("json.bak").exists()
}

/// The settings the app starts with, and whether to show "What's new" (once after an update; a brand-new install has
/// nothing to show). Only a brand-new install gets the devbuild defaults and today's version as "last seen".
pub fn load_at_startup(path: &Path, identifier: &str, current_version: &str) -> (Value, bool) {
    let first_run = is_first_run(path);
    let mut cfg = load(path);
    let whats_new = !first_run && cfg["general"]["lastSeenVersion"].as_str() != Some(current_version);
    if first_run {
        cfg["general"]["lastSeenVersion"] = json!(current_version);
        apply_devbuild_defaults(identifier, &mut cfg);
    }
    (cfg, whats_new)
}

/// Devbuilds (tools/devbuild.mjs) have their own app identity ("com.keyoverlay.devbuild") so they can run beside an
/// installed copy. On their very first start they take port 7881 (the installed copy uses 7878) and leave the automatic
/// update check off.
pub fn apply_devbuild_defaults(identifier: &str, cfg: &mut Value) {
    if identifier.ends_with(".devbuild") {
        cfg["general"]["port"] = json!(7881);
        cfg["general"]["autoCheckUpdates"] = json!(false);
    }
}

#[cfg(test)]
mod tests;
