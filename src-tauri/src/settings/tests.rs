//! The unit tests of settings.rs, kept in their own file so that file stays short. Each group below is a module that
//! reaches everything in settings.rs through `super::*` (this file's own `use super::*` passes it down).

use super::*;

#[cfg(test)]
mod load_and_save_tests {
    use super::*;
    use crate::sanitize::*;
    #[test]
    fn the_ui_sandbox_has_the_same_defaults() {
        // tools/ui-sandbox.mjs can't run Rust, so it reads a copy. Changed a default? Update the copy too.
        let copy: Value = serde_json::from_str(include_str!("../../../tools/sandbox/default-settings.json")).unwrap();
        assert_eq!(
            copy,
            defaults(),
            "update tools/sandbox/default-settings.json to match defaults()"
        );
    }
    #[test]
    fn a_version_3_file_keeps_everything_on_the_way_up() {
        let migrated = migrate(json!({
            "version": 3,
            "hotkeys": { "enabled": true, "pause": "Ctrl+Shift+KeyP" },
            "style": { "keyLabels": "layout", "radius": 12 }
        }));
        assert_eq!(migrated["version"], json!(CURRENT_VERSION));
        assert_eq!(migrated["hotkeys"]["pause"], json!("Ctrl+Shift+KeyP"));
        assert_eq!(migrated["hotkeys"]["enabled"], json!(true));
        assert_eq!(migrated["style"]["keyLabels"], json!("layout"));
        assert_eq!(migrated["style"]["radius"].as_f64(), Some(12.0));
    }
    #[test]
    fn garbage_becomes_defaults() {
        assert_eq!(migrate(json!("nope")), defaults());
        assert_eq!(migrate(json!(null)), defaults());
    }
    #[test]
    fn missing_keys_get_defaults_and_known_values_survive() {
        let migrated = migrate(json!({ "version": 2, "style": { "radius": 20 } }));
        assert_eq!(migrated["style"]["radius"].as_f64(), Some(20.0));
        assert_eq!(migrated["general"]["port"], json!(7878));
        assert_eq!(migrated["version"], json!(CURRENT_VERSION));
    }
    #[test]
    fn bad_values_are_repaired() {
        let migrated = migrate(
            json!({ "version": 2, "general": { "port": 80 }, "style": { "keySize": "big", "opacity": 9, "keyFill": "red", "fontFamily": "x\"; }" },
                                "animation": { "type": "../../evil", "speed": -5 },
                                "layout": { "profiles": { "tkl": { "disabledKeys": [1, "KeyA"], "labels": { "KeyA": "ok", "KeyB": 5 } }, "../evil": {} } } }),
        );
        assert_eq!(migrated["general"]["port"], json!(7878));
        assert_eq!(migrated["style"]["keySize"], defaults()["style"]["keySize"]);
        assert_eq!(migrated["style"]["opacity"].as_f64(), Some(1.0));
        assert_eq!(migrated["style"]["keyFill"], defaults()["style"]["keyFill"]);
        assert_eq!(migrated["style"]["fontFamily"], defaults()["style"]["fontFamily"]);
        assert_eq!(migrated["animation"]["type"], defaults()["animation"]["type"]);
        assert_eq!(migrated["animation"]["speed"].as_f64(), Some(0.0));
        assert_eq!(migrated["layout"]["profiles"]["tkl"]["disabledKeys"], json!(["KeyA"]));
        assert_eq!(migrated["layout"]["profiles"]["tkl"]["labels"], json!({ "KeyA": "ok" }));
        assert!(migrated["layout"]["profiles"].get("../evil").is_none());
    }
    #[test]
    fn defaults_are_stable_under_sanitize() {
        assert_eq!(migrate(defaults()), defaults());
    }
    #[test]
    fn keys_editor_choices_default_to_quarter_snap_and_no_grid() {
        assert_eq!(
            defaults()["layout"]["editor"],
            json!({ "snap": 0.25, "grid": false, "showHidden": true })
        );
    }
    #[test]
    fn settings_saved_before_the_editor_choices_existed_get_the_defaults() {
        let migrated = migrate(json!({ "version": 2, "layout": { "id": "wasd", "profiles": {} } }));
        assert_eq!(migrated["layout"]["id"], json!("wasd"));
        assert_eq!(
            migrated["layout"]["editor"],
            json!({ "snap": 0.25, "grid": false, "showHidden": true })
        );
    }
    #[test]
    fn every_snap_choice_and_the_grid_survive_a_round_trip() {
        for snap in SNAP_CHOICES {
            let migrated = migrate(json!({ "version": 2, "layout": { "editor": { "snap": snap, "grid": true } } }));
            assert_eq!(migrated["layout"]["editor"]["snap"].as_f64(), Some(snap));
            assert_eq!(migrated["layout"]["editor"]["grid"], json!(true));
        }
    }
    #[test]
    fn bad_editor_choices_go_back_to_the_defaults() {
        let hostile = [
            json!({ "snap": 0.3, "grid": "yes" }),
            json!({ "snap": -1, "grid": 1 }),
            json!({ "snap": 1e300, "grid": null }),
            json!({ "snap": "0.25", "grid": [] }),
            json!({ "snap": null }),
            json!(5),
            json!("snap"),
            json!([0.5]),
        ];
        for editor in hostile {
            let migrated = migrate(json!({ "version": 2, "layout": { "editor": editor } }));
            assert_eq!(
                migrated["layout"]["editor"],
                json!({ "snap": 0.25, "grid": false, "showHidden": true }),
                "{editor}"
            );
        }
    }
    #[test]
    fn unknown_keys_inside_the_editor_choices_are_dropped() {
        let migrated =
            migrate(json!({ "version": 2, "layout": { "editor": { "snap": 0.5, "grid": true, "evil": 1 } } }));
        assert_eq!(
            migrated["layout"]["editor"],
            json!({ "snap": 0.5, "grid": true, "showHidden": true })
        );
    }
    #[test]
    fn v1_settings_migrate_into_a_profile_without_losing_anything() {
        let old = json!({ "version": 1, "general": { "port": 9000, "autoCheckUpdates": true },
                          "layout": { "id": "tsb", "disabledKeys": ["KeyQ"], "labels": { "Space": "Jump" } } });
        let migrated = migrate(old);
        assert_eq!(migrated["version"], json!(CURRENT_VERSION));
        assert_eq!(migrated["general"]["port"], json!(9000));
        assert_eq!(migrated["general"]["autoCheckUpdates"], json!(true));
        assert_eq!(migrated["layout"]["id"], json!("tsb"));
        assert_eq!(migrated["layout"]["profiles"]["tsb"]["disabledKeys"], json!(["KeyQ"]));
        assert_eq!(migrated["layout"]["profiles"]["tsb"]["labels"]["Space"], json!("Jump"));
        assert!(migrated["layout"].get("disabledKeys").is_none() && migrated["layout"].get("labels").is_none());
    }
    #[test]
    fn update_channel_is_limited_to_stable_or_latest() {
        assert_eq!(
            migrate(json!({ "version": 2 }))["general"]["updateChannel"],
            json!("stable")
        );
        assert_eq!(
            migrate(json!({ "version": 2, "general": { "updateChannel": "latest" } }))["general"]["updateChannel"],
            json!("latest")
        );
        assert_eq!(
            migrate(json!({ "version": 2, "general": { "updateChannel": "nightly" } }))["general"]["updateChannel"],
            json!("stable")
        );
        assert_eq!(
            migrate(json!({ "version": 2, "general": { "updateChannel": 5 } }))["general"]["updateChannel"],
            json!("stable")
        );
    }
    #[test]
    fn input_method_is_limited_to_hook_or_rawinput() {
        assert_eq!(
            migrate(json!({ "version": 2 }))["general"]["inputMethod"],
            json!("hook")
        );
        assert_eq!(
            migrate(json!({ "version": 2, "general": { "inputMethod": "rawinput" } }))["general"]["inputMethod"],
            json!("rawinput")
        );
        assert_eq!(
            migrate(json!({ "version": 2, "general": { "inputMethod": "driver" } }))["general"]["inputMethod"],
            json!("hook")
        );
        assert_eq!(
            migrate(json!({ "version": 2, "general": { "inputMethod": 3 } }))["general"]["inputMethod"],
            json!("hook")
        );
    }
    #[test]
    fn secure_link_defaults_off_and_key_is_validated() {
        let migrated = migrate(json!({ "version": 2 }));
        assert_eq!(migrated["general"]["secureLink"], json!(false));
        assert_eq!(migrated["general"]["linkKey"], json!(""));
        let good = "0123456789abcdef0123456789abcdef";
        assert_eq!(
            migrate(json!({ "version": 2, "general": { "secureLink": true, "linkKey": good } }))["general"]["linkKey"],
            json!(good)
        );
        for bad in [
            "short",
            "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
            "../../etc",
            &"a".repeat(65),
        ] {
            assert_eq!(
                migrate(json!({ "version": 2, "general": { "linkKey": bad } }))["general"]["linkKey"],
                json!(""),
                "{bad}"
            );
        }
        assert_eq!(
            migrate(json!({ "version": 2, "general": { "secureLink": "yes" } }))["general"]["secureLink"],
            json!(false)
        );
    }
    #[test]
    fn reset_keeps_the_port_and_the_secure_link_so_the_obs_link_stays_the_same() {
        let mut current = defaults();
        current["general"]["port"] = json!(7900);
        current["general"]["secureLink"] = json!(true);
        current["general"]["linkKey"] = json!("0123456789abcdef0123456789abcdef");
        current["style"]["radius"] = json!(33);
        let reset = reset_keeping_link(&current);
        assert_eq!(reset["style"]["radius"], defaults()["style"]["radius"]);
        for name in ["port", "secureLink", "linkKey"] {
            assert_eq!(reset["general"][name], current["general"][name], "{name}");
        }
    }
    #[test]
    fn new_keys_are_random_hex_and_never_shown_to_the_overlay() {
        let (first_key, second_key) = (new_key().unwrap(), new_key().unwrap());
        assert_eq!(first_key.len(), 32);
        assert!(first_key.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(first_key, second_key);
        let mut full = defaults();
        full["general"]["linkKey"] = json!(first_key);
        let public = public_settings(&full);
        assert!(public["general"].get("linkKey").is_none());
        assert_eq!(public["general"]["port"], full["general"]["port"]); // everything else is kept
    }
    #[test]
    fn corrupt_settings_fall_back_to_the_backup() {
        let dir = std::env::temp_dir().join(format!("ko-settings-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let file = dir.join("settings.json");
        let mut current = defaults();
        current["general"]["autoCheckUpdates"] = json!(true);
        save(&file, &current).unwrap(); // first save: no backup yet
        save(&file, &current).unwrap(); // second save: previous file becomes the backup
        std::fs::write(&file, "{ this is not json").unwrap(); // simulate corruption
        assert_eq!(load(&file)["general"]["autoCheckUpdates"], json!(true));
        std::fs::remove_dir_all(&dir).ok();
    }
    #[test]
    fn a_restored_backup_is_not_a_new_install() {
        let dir = scratch_folder("backup-only");
        let file = dir.join("settings.json");
        let old = json!({ "version": CURRENT_VERSION, "general": { "port": 9000, "lastSeenVersion": "1.0.0" } });
        std::fs::write(dir.join("settings.json.bak"), old.to_string()).unwrap();
        // a devbuild's first run would move the port: a restored backup keeps its own
        let (cfg, whats_new) = load_at_startup(&file, "app.devbuild", "9.9.9");
        assert_eq!(cfg["general"]["port"], json!(9000), "the backup's port is kept");
        assert_eq!(cfg["general"]["lastSeenVersion"], json!("1.0.0"));
        assert!(whats_new, "an update over a restored backup still shows What's new");
        std::fs::remove_dir_all(&dir).ok();
    }
    #[test]
    fn an_empty_folder_is_a_new_install() {
        let dir = scratch_folder("empty-start");
        let (cfg, whats_new) = load_at_startup(&dir.join("settings.json"), "app", "9.9.9");
        assert_eq!(
            cfg["general"]["secureLink"],
            json!(false),
            "the secure link stays an optional choice"
        );
        assert_eq!(cfg["general"]["lastSeenVersion"], json!("9.9.9"));
        assert!(!whats_new);
        std::fs::remove_dir_all(&dir).ok();
    }
    fn scratch_folder(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("ko-settings-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }
    #[test]
    fn settings_from_a_newer_version_are_copied_aside_once_and_never_lost() {
        let dir = scratch_folder("newer");
        let file = dir.join("settings.json");
        let future = CURRENT_VERSION + 6;
        std::fs::write(
            &file,
            format!(r#"{{ "version": {future}, "futureThing": "first", "style": {{ "radius": 7 }} }}"#),
        )
        .unwrap();
        let loaded = load(&file);
        assert_eq!(loaded["version"], json!(CURRENT_VERSION));
        assert_eq!(loaded["style"]["radius"].as_f64(), Some(7.0));
        let copy = dir.join(format!("settings.v{future}.json"));
        let kept: Value = serde_json::from_str(&std::fs::read_to_string(&copy).unwrap()).unwrap();
        assert_eq!(
            kept["futureThing"],
            json!("first"),
            "the copy is the untouched original"
        );
        // saving the cleaned settings, then meeting another newer file, must not overwrite the first copy
        save(&file, &loaded).unwrap();
        std::fs::write(&file, format!(r#"{{ "version": {future}, "futureThing": "second" }}"#)).unwrap();
        load(&file);
        let still: Value = serde_json::from_str(&std::fs::read_to_string(&copy).unwrap()).unwrap();
        assert_eq!(still["futureThing"], json!("first"));
        std::fs::remove_dir_all(&dir).ok();
    }
    #[test]
    fn going_forward_again_after_a_downgrade_brings_the_newer_fields_back() {
        let dir = scratch_folder("forward");
        let file = dir.join("settings.json");
        let copy = dir.join(format!("settings.v{CURRENT_VERSION}.json"));
        // the copy an older version kept of this version's file, with a field the older version can't read
        std::fs::write(
            &copy,
            format!(r#"{{ "version": {CURRENT_VERSION}, "style": {{ "radius": 7, "keySize": 70 }}, "layout": {{ "editor": {{ "snap": 0.5 }} }} }}"#),
        )
        .unwrap();
        // what the older version saved: it changed the radius, and has no editor settings
        std::fs::write(&file, r#"{ "version": 2, "style": { "radius": 12 } }"#).unwrap();
        let loaded = load(&file);
        assert_eq!(
            loaded["style"]["radius"].as_f64(),
            Some(12.0),
            "the change made on the older version wins"
        );
        assert_eq!(
            loaded["style"]["keySize"].as_f64(),
            Some(70.0),
            "the rest comes back from the copy"
        );
        assert_eq!(
            loaded["layout"]["editor"]["snap"].as_f64(),
            Some(0.5),
            "a field the older file lacks comes back"
        );
        assert!(
            !copy.exists(),
            "the copy is removed once settings.json has it, so the next downgrade makes a fresh one"
        );
        let saved: Value = serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
        assert_eq!(saved["layout"]["editor"]["snap"].as_f64(), Some(0.5));
        std::fs::remove_dir_all(&dir).ok();
    }
    #[test]
    fn settings_of_the_current_or_an_older_version_get_no_copy() {
        let dir = scratch_folder("same");
        let file = dir.join("settings.json");
        for version in [1, 2, CURRENT_VERSION] {
            std::fs::write(&file, format!(r#"{{ "version": {version} }}"#)).unwrap();
            load(&file);
        }
        let copies = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with("settings.v"))
            .count();
        assert_eq!(copies, 0);
        std::fs::remove_dir_all(&dir).ok();
    }
    #[test]
    fn only_a_folder_without_settings_or_their_backup_is_a_first_run() {
        let dir = scratch_folder("first-run");
        let file = dir.join("settings.json");
        assert!(is_first_run(&file));
        std::fs::write(dir.join("settings.json.bak"), "{}").unwrap();
        assert!(!is_first_run(&file), "a backup means the app ran before");
        std::fs::write(&file, "{}").unwrap();
        assert!(!is_first_run(&file));
        std::fs::remove_dir_all(&dir).ok();
    }
    #[test]
    fn a_newer_backup_is_copied_aside_too() {
        let dir = scratch_folder("newer-backup");
        let file = dir.join("settings.json");
        let future = CURRENT_VERSION + 2;
        std::fs::write(&file, "{ this is not json").unwrap();
        std::fs::write(
            dir.join("settings.json.bak"),
            format!(r#"{{ "version": {future}, "x": 1 }}"#),
        )
        .unwrap();
        load(&file);
        assert!(dir.join(format!("settings.v{future}.json")).exists());
        std::fs::remove_dir_all(&dir).ok();
    }
    #[test]
    fn an_empty_secure_link_key_is_replaced_so_there_is_a_working_link() {
        let mut broken = migrate(json!({ "version": 3, "general": { "secureLink": true, "linkKey": "not a key" } }));
        assert_eq!(
            broken["general"]["linkKey"],
            json!(""),
            "the sanitizer clears an invalid key"
        );
        assert!(give_empty_secure_link_a_key(&mut broken));
        let key = broken["general"]["linkKey"].as_str().unwrap().to_string();
        assert_eq!(key.len(), 32);
        assert!(key.chars().all(|c| c.is_ascii_hexdigit()));
        // a second call changes nothing, and neither does an existing good key or a link that is off
        assert!(!give_empty_secure_link_a_key(&mut broken));
        let mut off = defaults();
        assert!(!give_empty_secure_link_a_key(&mut off));
        assert_eq!(off["general"]["linkKey"], json!(""));
    }
    #[test]
    fn load_saves_the_new_secure_link_key_so_the_link_stays_the_same() {
        let dir = scratch_folder("key");
        let file = dir.join("settings.json");
        std::fs::write(
            &file,
            r#"{ "version": 3, "general": { "secureLink": true, "linkKey": "" } }"#,
        )
        .unwrap();
        let first = load(&file)["general"]["linkKey"].as_str().unwrap().to_string();
        assert_eq!(
            load(&file)["general"]["linkKey"],
            json!(first),
            "the same key on the next start"
        );
        std::fs::remove_dir_all(&dir).ok();
    }
    #[test]
    fn profiles_and_version_survive_a_round_trip() {
        let mut current = defaults();
        current["general"]["lastSeenVersion"] = json!("1.1.2");
        current["general"]["autoCheckUpdates"] = json!(true);
        current["layout"]["profiles"] = json!({ "wasd": { "disabledKeys": ["KeyE"], "labels": { "Space": "⎵" } }, "my layout.v2": { "disabledKeys": [], "labels": {} } });
        assert_eq!(migrate(current.clone()), current);
    }
}

/// Hostile-input tests: files a user hand-edits, imports or downloads must never crash the app or slip past the rules.
/// A tiny deterministic random generator (no extra libraries) builds thousands of nasty JSON documents.
#[cfg(test)]
mod robustness_tests {
    use super::*;
    use crate::sanitize::*;

    struct Rng(u64);
    impl Rng {
        fn next(&mut self) -> u64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            self.0
        }
        fn below(&mut self, limit: u64) -> u64 {
            self.next() % limit
        }
        fn pick<'a, T>(&mut self, items: &'a [T]) -> &'a T {
            &items[self.below(items.len() as u64) as usize]
        }
    }

    const KEYS: &[&str] = &[
        "version",
        "general",
        "style",
        "layout",
        "animation",
        "port",
        "autostart",
        "linkKey",
        "secureLink",
        "inputMethod",
        "updateChannel",
        "lastSeenVersion",
        "id",
        "profiles",
        "editor",
        "snap",
        "grid",
        "disabledKeys",
        "labels",
        "fontFamily",
        "fontSize",
        "opacity",
        "keyFill",
        "borderColor",
        "scale",
        "speed",
        "intensity",
        "type",
        "easing",
        "../evil",
        "a\"b",
        "__proto__",
        "",
    ];
    const STRINGS: &[&str] = &[
        "",
        "tkl",
        "../../etc/passwd",
        "a/b\\c",
        "#zzzzzz",
        "#12345678",
        "#123",
        "x\"; }</style>",
        "\u{0}\u{7}\u{1b}",
        "é🎹日本語",
        "stable",
        "latest",
        "hook",
        "rawinput",
        "0123456789abcdef0123456789abcdef",
        "1.2.0",
        "con",
        "KeyA",
        "Segoe UI",
    ];

    fn gen(rng: &mut Rng, depth: u32) -> Value {
        match rng.below(if depth >= 4 { 6 } else { 9 }) {
            0 => Value::Null,
            1 => json!(rng.below(2) == 0),
            2 => json!(rng.next() as i64),
            3 => json!([0.0, -1.5, 1e308, -1e308, 0.5, 7.0, 99999.0, 1e-300][rng.below(8) as usize]),
            4 => json!(*rng.pick(STRINGS)),
            5 => json!("x".repeat(rng.below(5000) as usize)),
            6 | 7 => Value::Array((0..rng.below(6)).map(|_| gen(rng, depth + 1)).collect()),
            _ => Value::Object(
                (0..rng.below(8))
                    .map(|_| (rng.pick(KEYS).to_string(), gen(rng, depth + 1)))
                    .collect(),
            ),
        }
    }

    /// Every rule a cleaned settings document must satisfy, however hostile the input was.
    fn assert_valid(settings: &Value, seed: u64) {
        let def = defaults();
        let general = &settings["general"];
        assert_eq!(settings["version"], json!(CURRENT_VERSION), "seed {seed}");
        let port = general["port"].as_f64().unwrap();
        assert!(
            (1024.0..=65535.0).contains(&port) && port.fract() == 0.0,
            "seed {seed}: port {port}"
        );
        for (path, lo, hi) in RANGES {
            let number = path
                .split('.')
                .fold(settings, |v, k| &v[k])
                .as_f64()
                .unwrap_or_else(|| panic!("seed {seed}: {path} is not a number"));
            assert!(
                number.is_finite() && number >= *lo && number <= *hi,
                "seed {seed}: {path} = {number}"
            );
        }
        for color_field in [
            "keyFill",
            "keyFillPressed",
            "borderColor",
            "borderColorPressed",
            "textColor",
            "textColorPressed",
            "glowColor",
        ] {
            assert!(
                is_hex_color(settings["style"][color_field].as_str().unwrap_or("")),
                "seed {seed}: color {color_field}"
            );
        }
        let font = settings["style"]["fontFamily"].as_str().unwrap();
        assert!(
            !font.is_empty() && font.len() <= 80 && !font.contains(['"', '\\', '{', '}', ';', '<', '>']),
            "seed {seed}: font {font:?}"
        );
        assert!(
            is_id(settings["layout"]["id"].as_str().unwrap()),
            "seed {seed}: layout id"
        );
        for (id, profile) in settings["layout"]["profiles"].as_object().unwrap() {
            assert!(is_id(id), "seed {seed}: profile id {id:?}");
            for (code, pos) in ["shape", "grid"]
                .iter()
                .filter_map(|style| profile.pointer(&format!("/styles/{style}/positions")))
                .filter_map(|x| x.as_object())
                .flatten()
            {
                let (x, y) = (pos["x"].as_f64().unwrap(), pos["y"].as_f64().unwrap());
                assert!(
                    code.len() <= 40 && (0.0..=100.0).contains(&x) && (0.0..=100.0).contains(&y),
                    "seed {seed}: position of {code:?}"
                );
            }
        }
        let key = general["linkKey"].as_str().unwrap();
        assert!(
            key.is_empty() || (key.len() >= 32 && key.chars().all(|c| c.is_ascii_hexdigit())),
            "seed {seed}: link key"
        );
        assert!(
            matches!(general["inputMethod"].as_str(), Some("hook" | "rawinput"))
                && matches!(general["updateChannel"].as_str(), Some("stable" | "latest")),
            "seed {seed}"
        );
        assert!(
            is_version(general["lastSeenVersion"].as_str().unwrap()),
            "seed {seed}: lastSeenVersion"
        );
        for field in ["type", "easing"] {
            assert!(
                is_ident(settings["animation"][field].as_str().unwrap()),
                "seed {seed}: animation {field}"
            );
        }
        // Same shape as the defaults (nothing extra, nothing missing) and stable after being written out and read back.
        assert_eq!(
            settings.as_object().unwrap().keys().collect::<Vec<_>>(),
            def.as_object().unwrap().keys().collect::<Vec<_>>(),
            "seed {seed}: top-level keys"
        );
        assert_eq!(
            &migrate(serde_json::from_str(&settings.to_string()).unwrap()),
            settings,
            "seed {seed}: not stable after a round trip"
        );
    }

    /// Paths of every setting in the defaults, e.g. ["style", "fontFamily"].
    fn leaf_paths(value: &Value, here: &mut Vec<String>, out: &mut Vec<Vec<String>>) {
        match value {
            Value::Object(entries) if !entries.is_empty() => {
                for (key, child) in entries {
                    here.push(key.clone());
                    leaf_paths(child, here, out);
                    here.pop();
                }
            }
            _ => out.push(here.clone()),
        }
    }

    #[test]
    fn random_garbage_never_panics_and_always_comes_out_valid() {
        for seed in 1..=4000u64 {
            let mut rng = Rng(seed.wrapping_mul(0x9E3779B97F4A7C15) | 1);
            assert_valid(&migrate(gen(&mut rng, 0)), seed);
        }
    }

    #[test]
    fn corrupting_single_settings_of_a_valid_file_is_always_repaired() {
        let mut paths = Vec::new();
        leaf_paths(&defaults(), &mut Vec::new(), &mut paths);
        for seed in 1..=6000u64 {
            let mut rng = Rng(seed.wrapping_mul(0xA24BAED4963EE407) | 1);
            let mut doc = defaults();
            for _ in 0..=rng.below(4) {
                let path = rng.pick(&paths).clone();
                let bad = if rng.below(3) == 0 {
                    json!(*rng.pick(STRINGS))
                } else {
                    gen(&mut rng, 3)
                };
                let mut cur = &mut doc;
                for k in &path[..path.len() - 1] {
                    cur = &mut cur[k.as_str()];
                }
                cur[path[path.len() - 1].as_str()] = bad;
            }
            if rng.below(4) == 0 {
                doc["layout"]["profiles"] = gen(&mut rng, 1);
            }
            assert_valid(&migrate(doc), seed);
        }
    }

    #[test]
    fn the_secure_link_key_check_rejects_everything_but_the_exact_key() {
        let key = "0123456789abcdef0123456789abcdef";
        let on = json!({ "general": { "secureLink": true, "linkKey": key } });
        let ok = |q: Option<&str>| crate::server::key_ok(&on, q);
        assert!(ok(Some(&format!("key={key}"))));
        assert!(ok(Some(&format!("a=1&key={key}&b=2"))));
        for bad in [
            "",
            "key=",
            "key=0123456789abcdef0123456789abcdeF",
            "key=0123456789abcdef0123456789abcde",
            &format!("key={key}0"),
            &format!("KEY={key}"),
            &format!("xkey={key}"),
            "key=%30123456789abcdef0123456789abcdef",
        ] {
            assert!(!ok(Some(bad)), "accepted {bad:?}");
        }
        assert!(!ok(None));
        // Switched on but with no key stored: refuse everything instead of opening up.
        assert!(!crate::server::key_ok(
            &json!({ "general": { "secureLink": true, "linkKey": "" } }),
            Some("key=")
        ));
        // Switched off: always open. Missing or odd settings never count as "on".
        assert!(crate::server::key_ok(
            &json!({ "general": { "secureLink": false, "linkKey": key } }),
            None
        ));
        assert!(crate::server::key_ok(&json!({}), None));
    }

    #[test]
    fn profiles_from_hostile_files_are_cleaned() {
        for seed in 1..=1500u64 {
            let mut rng = Rng(seed.wrapping_mul(0xD1B54A32D192ED03) | 1);
            let out = clean_profiles(&gen(&mut rng, 0));
            let map = out.as_object().unwrap();
            assert!(map.len() <= 50);
            for (id, profile) in map {
                assert!(is_id(id));
                assert!(
                    profile["disabledKeys"].as_array().unwrap().len() <= 300
                        && profile["disabledKeys"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .all(|k| k.as_str().is_some_and(|s| s.len() <= 40))
                );
                assert!(profile["labels"]
                    .as_object()
                    .unwrap()
                    .iter()
                    .all(|(k, v)| k.len() <= 40 && v.as_str().is_some_and(|s| s.chars().count() <= 16)));
            }
        }
    }
}

#[cfg(test)]
mod devbuild_tests {
    use super::*;
    #[test]
    fn only_devbuilds_get_their_own_port_and_no_update_check() {
        let mut dev = defaults();
        apply_devbuild_defaults(crate::app_info::ID_DEVBUILD, &mut dev);
        assert_eq!(
            (
                dev["general"]["port"].clone(),
                dev["general"]["autoCheckUpdates"].clone()
            ),
            (json!(7881), json!(false))
        );
        let mut real = defaults();
        apply_devbuild_defaults(crate::app_info::ID_APP, &mut real);
        assert_eq!(real, defaults());
    }
}

#[cfg(test)]
mod position_tests {
    use super::*;
    use crate::sanitize::*;
    #[test]
    fn moved_keys_are_kept_clamped_and_junk_is_dropped() {
        let raw = json!({ "wasd": { "styles": { "shape": { "positions": {
            "KeyW": { "x": 1.256, "y": 0 }, "KeyA": { "x": -5, "y": 1e9 }, "KeyB": { "x": -1e9, "y": 0 }, "KeyS": { "x": "1", "y": 2 }, "KeyD": { "x": 3 }, "": { "x": 1, "y": 1 } } } } } });
        let out = clean_profiles(&raw);
        let pos = &out["wasd"]["styles"]["shape"]["positions"];
        assert_eq!(pos["KeyW"], json!({ "x": 1.26, "y": 0.0 }));
        // a key may sit left of or above the layout's origin (the board is centered on the layout), down to MIN_POSITION
        assert_eq!(pos["KeyA"], json!({ "x": -5.0, "y": 100.0 }));
        assert_eq!(pos["KeyB"], json!({ "x": -100.0, "y": 0.0 }));
        assert!(pos.get("KeyS").is_none() && pos.get("KeyD").is_none() && pos.get("").is_none());
        // A profile without moved keys has no "styles" entry at all (old settings files stay small and byte-identical).
        for empty in [
            json!({ "styles": { "shape": { "positions": {} } } }),
            json!({ "styles": "nope" }),
        ] {
            assert!(clean_profiles(&json!({ "x": empty }))["x"].get("styles").is_none());
        }
    }
}

#[cfg(test)]
mod key_height_tests {
    use super::*;
    use crate::sanitize::*;
    #[test]
    fn a_key_size_may_hold_a_width_a_height_or_both_and_junk_is_dropped() {
        let raw = json!({ "wasd": { "styles": { "shape": { "sizes": {
            "KeyW": { "w": 2.456, "h": 3 }, "KeyA": { "h": 1e9 }, "KeyS": { "h": 0.001 }, "KeyD": { "h": "tall" }, "Space": { "w": 4.5 } } } } } });
        let sizes = &clean_profiles(&raw)["wasd"]["styles"]["shape"]["sizes"];
        assert_eq!(sizes["KeyW"], json!({ "w": 2.46, "h": 3.0 }));
        assert_eq!(sizes["KeyA"], json!({ "h": MAX_KEY_WIDTH }));
        assert_eq!(sizes["KeyS"], json!({ "h": MIN_KEY_WIDTH }));
        assert!(
            sizes.get("KeyD").is_none(),
            "a height that is not a number drops the entry"
        );
        assert_eq!(
            sizes["Space"],
            json!({ "w": 4.5 }),
            "width-only entries from before stay as they are"
        );
    }
}

#[cfg(test)]
mod layout_style_tests {
    use super::*;
    use crate::sanitize::*;

    #[test]
    fn version_2_positions_move_into_the_shape_style() {
        let old = json!({ "version": 2, "layout": { "id": "wasd", "profiles": {
            "wasd": { "disabledKeys": ["KeyE"], "labels": { "Space": "Jump" }, "positions": { "KeyW": { "x": 2, "y": 1.5 } } },
            "tkl": { "disabledKeys": [], "labels": {} } } } });
        let migrated = migrate(old);
        let wasd = &migrated["layout"]["profiles"]["wasd"];
        assert_eq!(migrated["version"], json!(CURRENT_VERSION));
        assert_eq!(wasd["disabledKeys"], json!(["KeyE"]));
        assert_eq!(wasd["labels"], json!({ "Space": "Jump" }));
        assert_eq!(
            wasd["styles"]["shape"]["positions"]["KeyW"],
            json!({ "x": 2.0, "y": 1.5 })
        );
        assert!(wasd.get("positions").is_none(), "the old place is gone");
        assert!(
            wasd.get("layoutStyle").is_none(),
            "shape stays the default and is not written"
        );
        assert!(migrated["layout"]["profiles"]["tkl"].get("styles").is_none());
    }

    #[test]
    fn both_styles_keep_their_own_positions_and_sizes_and_survive_a_round_trip() {
        let raw = json!({ "a": { "disabledKeys": [], "labels": {}, "layoutStyle": "grid", "styles": {
            "shape": { "positions": { "KeyW": { "x": 1, "y": 0 } }, "sizes": { "Space": { "w": 4.5 } } },
            "grid": { "positions": { "KeyW": { "x": 3, "y": 2 } }, "sizes": { "KeyW": { "w": 2 } } } } } });
        let once = clean_profiles(&raw);
        assert_eq!(once["a"]["layoutStyle"], json!("grid"));
        assert_eq!(once["a"]["styles"]["shape"]["sizes"]["Space"], json!({ "w": 4.5 }));
        assert_eq!(
            once["a"]["styles"]["grid"]["positions"]["KeyW"],
            json!({ "x": 3.0, "y": 2.0 })
        );
        assert_eq!(once["a"]["styles"]["grid"]["sizes"]["KeyW"], json!({ "w": 2.0 }));
        assert_eq!(clean_profiles(&once), once, "cleaning twice changes nothing");
    }

    #[test]
    fn an_unknown_layout_style_means_shape() {
        for style in [json!("evil"), json!(5), json!(null), json!(["grid"]), json!("Grid")] {
            let out = clean_profiles(&json!({ "a": { "layoutStyle": style } }));
            assert!(out["a"].get("layoutStyle").is_none(), "{style}");
        }
    }

    #[test]
    fn a_missing_grid_style_is_simply_absent() {
        let out = clean_profiles(&json!({ "a": { "styles": { "shape": { "sizes": { "Space": { "w": 3 } } } } } }));
        assert!(out["a"]["styles"].get("grid").is_none());
        assert_eq!(out["a"]["styles"]["shape"]["sizes"]["Space"], json!({ "w": 3.0 }));
    }

    #[test]
    fn key_widths_are_clamped_rounded_and_junk_is_dropped() {
        let raw = json!({ "a": { "styles": { "shape": { "sizes": {
            "Wide": { "w": 4.567 }, "Tiny": { "w": 0 }, "Huge": { "w": 1e9 }, "Neg": { "w": -3 },
            "Text": { "w": "2" }, "Nothing": {}, "Plain": 5, "": { "w": 2 } } } } } });
        let sizes = &clean_profiles(&raw)["a"]["styles"]["shape"]["sizes"];
        assert_eq!(sizes["Wide"], json!({ "w": 4.57 }));
        assert_eq!(sizes["Tiny"], json!({ "w": MIN_KEY_WIDTH }));
        assert_eq!(sizes["Huge"], json!({ "w": MAX_KEY_WIDTH }));
        assert_eq!(sizes["Neg"], json!({ "w": MIN_KEY_WIDTH }));
        for dropped in ["Text", "Nothing", "Plain", ""] {
            assert!(sizes.get(dropped).is_none(), "{dropped:?}");
        }
    }

    #[test]
    fn hostile_style_data_is_cleaned_without_panicking() {
        let hostile = [
            json!(null),
            json!(5),
            json!("x"),
            json!([1, 2]),
            json!({ "shape": 3 }),
            json!({ "grid": [] }),
            json!({ "shape": { "positions": [1], "sizes": "no" } }),
        ];
        for styles in hostile {
            let out = clean_profiles(&json!({ "a": { "styles": styles } }));
            assert!(out["a"].get("styles").is_none());
        }
    }

    #[test]
    fn at_most_three_hundred_resized_keys_are_kept() {
        let sizes: Map<String, Value> = (0..400).map(|n| (format!("Key{n}"), json!({ "w": 2 }))).collect();
        let out = clean_profiles(&json!({ "a": { "styles": { "shape": { "sizes": sizes } } } }));
        assert_eq!(
            out["a"]["styles"]["shape"]["sizes"].as_object().unwrap().len(),
            MAX_EDITED_KEYS
        );
    }

    #[test]
    fn positions_written_by_older_versions_are_still_accepted_on_import() {
        let out = clean_profiles(&json!({ "a": { "positions": { "KeyW": { "x": 1, "y": 2 } } } }));
        assert_eq!(
            out["a"]["styles"]["shape"]["positions"]["KeyW"],
            json!({ "x": 1.0, "y": 2.0 })
        );
    }
}

#[cfg(test)]
mod layout_key_tests {
    use super::*;
    use crate::sanitize::*;

    #[test]
    fn layout_keys_keep_the_rules_they_had() {
        let long_code = "K".repeat(41);
        let raw = json!([
            { "code": "KeyA", "x": 0, "y": 0, "label": "a label longer than sixteen" },
            { "code": "", "x": 0, "y": 0 },
            { "code": long_code, "x": 0, "y": 0 },
            { "code": 5, "x": 0, "y": 0 },
            { "code": "KeyB", "x": "1", "y": 0 },
            { "code": "KeyC", "y": 0 },
            { "code": "KeyD", "x": 1, "y": 0, "w": "wide", "label": 7 },
            "not a key"
        ]);
        assert_eq!(
            clean_layout_keys(&raw),
            vec![
                json!({ "code": "KeyA", "x": 0.0, "y": 0.0, "label": "a label longer t" }),
                json!({ "code": "KeyD", "x": 1.0, "y": 0.0 })
            ]
        );
        assert!(clean_layout_keys(&json!({ "keys": [] })).is_empty());
        assert!(clean_layout_keys(&Value::Null).is_empty());
    }

    #[test]
    fn layout_key_codes_are_letters_and_digits_only() {
        let raw = json!([
            { "code": "<img src=x>", "x": 0, "y": 0 },
            { "code": "Key A", "x": 0, "y": 0 },
            { "code": "Key\u{0}A", "x": 0, "y": 0 },
            { "code": "KeyÄ", "x": 0, "y": 0 },
            { "code": "Unlinked3", "x": 1, "y": 0 }
        ]);
        assert_eq!(
            clean_layout_keys(&raw),
            vec![json!({ "code": "Unlinked3", "x": 1.0, "y": 0.0 })]
        );
    }

    #[test]
    fn layout_keys_are_limited_rounded_and_unique() {
        let raw = json!([
            { "code": "KeyA", "x": -1e9, "y": 1e9, "w": 0.1, "h": 1e9 },
            { "code": "KeyB", "x": 0.125, "y": 0.375, "w": 1.875, "h": 2 },
            { "code": "KeyA", "x": 5, "y": 5 }
        ]);
        assert_eq!(
            clean_layout_keys(&raw),
            vec![
                json!({ "code": "KeyA", "x": MIN_POSITION, "y": MAX_POSITION, "w": MIN_KEY_WIDTH, "h": MAX_KEY_WIDTH }),
                json!({ "code": "KeyB", "x": 0.13, "y": 0.38, "w": 1.88, "h": 2.0 })
            ],
            "the second KeyA is dropped: the first key keeps its code"
        );
    }

    #[test]
    fn at_most_three_hundred_layout_keys_are_read() {
        let raw: Vec<Value> = (0..400)
            .map(|n| json!({ "code": format!("Key{n}"), "x": 0, "y": 0 }))
            .collect();
        assert_eq!(clean_layout_keys(&json!(raw)).len(), MAX_LAYOUT_KEYS);
    }

    #[test]
    fn a_drawn_device_keeps_a_plain_drawing_name_only_on_its_own_block() {
        let raw = json!([
            { "code": "Mouse", "x": 16, "y": 1, "w": 2.5, "h": 4, "device": "mouse" },
            { "code": "Controller", "x": 0, "y": 6, "device": "../../evil" },
            { "code": "KeyA", "x": 0, "y": 0, "device": "mouse" },
            { "code": "Unlinked1", "x": 1, "y": 0, "device": 5 }
        ]);
        let keys = clean_layout_keys(&raw);
        assert_eq!(keys[0]["device"], json!("mouse"));
        assert!(keys[1].get("device").is_none(), "only a plain lower-case name");
        assert!(
            keys[2].get("device").is_none() && keys[3].get("device").is_none(),
            "only on Mouse or Controller"
        );
        assert_eq!(keys[0]["w"], json!(2.5));
    }
}
