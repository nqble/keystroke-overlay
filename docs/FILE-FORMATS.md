# File formats

The files the app reads and writes. All are plain JSON or tiny JavaScript, and everything the app loads from the outside
is validated and cleaned first. Schemas for the two shareable formats are in [`docs/schemas/`](schemas/).

Where user files live: `%APPDATA%\com.keyoverlay.app\` (General → App → Open data folder).

## Settings (`settings.json`)
Versioned (`"version": 2` today) and migrated on load; see [decision 0007](decisions/0007-versioned-settings-with-migrations.md).
The defaults live in `defaults()` in `src-tauri/src/settings.rs`, which is the single source of truth. Shape:

```jsonc
{
  "version": 2,
  "general": { "port": 7878, "autostart": false, "minimizeToTray": true, "openOnLaunch": true,
               "autoCheckUpdates": true, "inputMethod": "hook",            // "hook" | "rawinput"
               "secureLink": false, "linkKey": "", "updateChannel": "stable", // "stable" | "latest"
               "debugMode": false, "lastSeenVersion": "" },
  "layout": { "id": "tkl",
              "profiles": { "<layoutId>": { "disabledKeys": ["KeyW"], "labels": { "Space": "Jump" } } } },   // see "positions" below
  "style": { "keyFill": "#1e222bd9", "keyFillPressed": "#4f8cffff", "borderColor": "#ffffff40", "borderColorPressed": "#ffffffff",
             "borderWidth": 2, "radius": 8, "fontFamily": "Segoe UI", "fontSize": 18, "fontWeight": 600,
             "textColor": "#e6e9f0ff", "textColorPressed": "#ffffffff", "glowColor": "#4f8cffff", "glowSize": 18,
             "keySize": 52, "gap": 6, "scale": 1.0, "opacity": 1.0 },
  "animation": { "type": "none", "speed": 120, "easing": "default", "intensity": 1.0 }
}
```

**`positions` (unreleased; exists on the `v1.3.0-dev` branch only).** A profile may also carry an optional
`"positions": { "KeyW": { "x": 1.25, "y": 0 } }` map: where the user dragged individual keys to, in key units. Only keys the
user moved are listed; every other key stays where the layout file puts it. On load, entries that are not a pair of finite
numbers are dropped, values are limited to 0–100 and rounded to 2 decimals, at most 300 keys are kept, and a profile with no
moved keys has no `positions` entry at all (so older settings files stay byte-identical). Until v1.3.0 ships this may still change.

Numbers are clamped to these ranges on load: port 1024–65535, borderWidth 0–20, radius 0–100, fontSize 0–120,
fontWeight 100–900, glowSize 0–100, keySize 16–200, gap 0–60, scale 0.2–4, opacity 0–1, animation speed 0–2000,
intensity 0–4. Colours are `#rrggbb` or `#rrggbbaa`. Wrong types fall back to the default.

## Layout (`layouts/<id>.json`)
Schema: [`schemas/layout.schema.json`](schemas/layout.schema.json).

```json
{
  "id": "mine",
  "name": "My layout",
  "keys": [
    { "code": "KeyW", "label": "W", "x": 1, "y": 0 },
    { "code": "KeyA", "label": "A", "x": 0, "y": 1 },
    { "code": "Space", "label": "", "x": 0, "y": 2, "w": 3 }
  ]
}
```

`x`, `y` are the key's position and `w`, `h` its size, in key units (1 = one normal key). `code` is a key name from the
[protocol](PROTOCOL.md). The app keeps at most **20** layouts you made.

**Exported layout file** (Layout tab → Export, and what Import reads):

```json
{ "format": "keystroke-overlay-layouts", "version": 1,
  "layouts": [ { "id": "mine", "name": "My layout", "keys": [ ... ] } ],
  "profiles": { "mine": { "disabledKeys": ["KeyW"], "labels": { "Space": "Jump" } } } }
```

Import also accepts a single bare layout object. It cleans the data (at most 300 keys of 40-character codes, labels of 16
characters, names of 30), never overwrites an existing layout (a number is added to the id instead), and stops at the
20-layout limit.

## Preset (exported style, `presets/<name>.json`)
Schema: [`schemas/preset.schema.json`](schemas/preset.schema.json). It is the `style` and `animation` parts of the
settings, nothing else:

```json
{ "style": { "radius": 14, "keyFill": "#ffffff1f" }, "animation": { "type": "scale", "speed": 140 } }
```

Any subset of fields is allowed; missing ones keep their current value.

## Themes and animations (JavaScript modules)
Small files that register themselves. They are loaded only by the overlay page. How to write one is in
[EXTENDING.md](EXTENDING.md); the registry API is documented at the top of `ui/overlay/registry.js`.

## Compatibility
Files from older versions must keep working. Any change to these formats comes with a migration (settings) or a
backwards-compatible reader (layouts, presets) and a test.
